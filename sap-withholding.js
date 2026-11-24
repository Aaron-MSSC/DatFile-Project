(function (root, factory) {
  const converter = typeof module !== "undefined" && module.exports
    ? require("./converter")
    : root.DatConverter;
  const api = factory(converter);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.DatSapWithholding = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (DatConverter) {
  /*
   * SAP Business One withholding-tax pull -> canonical buildDat source.
   *
   * Input is the payload of POST /api/connectors/sap/pull, which wraps the BIR
   * API Integration project's /api/v2/withholding-tax endpoints (Milestone 7.3).
   * Each withholding-tax line on an included document contributes to one
   * consolidated row per payee TIN + branch + ATC + rate. Credit memos are
   * subtracted. Nothing is defaulted: a missing TIN, branch, ATC or amount is a
   * blocking error that names the SAP document.
   */

  // Which SAP documents feed which DAT report, and over what period.
  const PULL_REPORTS = {
    "1601EQ": {
      direction: "purchase",
      periodicity: "quarter",
      sources: ["purchase-invoices", "purchase-credit-memos"]
    },
    "2550M": {
      direction: "sales",
      periodicity: "month",
      sources: ["sales-invoices", "sales-credit-memos"]
    },
    "2550Q": {
      direction: "sales",
      periodicity: "quarter",
      sources: ["sales-invoices", "sales-credit-memos"]
    }
  };

  const CREDIT_SOURCES = new Set(["purchase-credit-memos", "sales-credit-memos"]);

  const OBJECT_LABELS = {
    PurchaseInvoice: "AP Invoice",
    PurchaseCreditMemo: "AP Credit Memo",
    Invoice: "AR Invoice",
    CreditMemo: "AR Credit Memo"
  };

  /*
   * Every profile starts as "pending-approval" (AGENTS.md section 4). Conversion
   * is refused until an approved mapping document changes the status; preview
   * and document review still work.
   */
  const MAPPING_PROFILES = [
    {
      id: "SAPB1-WTAX-to-1601EQ",
      reportType: "1601EQ",
      status: "pending-approval",
      reason: "Confirm that SAP WTCode -> OfficialCode is the BIR ATC, that invoice-category withholding on AP invoices/credit memos is the complete 1601-EQ population, and the source of individual payee names."
    },
    {
      id: "SAPB1-WTAX-to-2550M",
      reportType: "2550M",
      status: "pending-approval",
      reason: "Confirm that withholding recorded on AR invoices/credit memos is the complete SAWT population and that customer WTCode -> OfficialCode is the BIR ATC."
    },
    {
      id: "SAPB1-WTAX-to-2550Q",
      reportType: "2550Q",
      status: "pending-approval",
      reason: "Confirm that withholding recorded on AR invoices/credit memos is the complete SAWT population and that customer WTCode -> OfficialCode is the BIR ATC."
    }
  ];

  const MAX_ISSUES_PER_DOCUMENT = 10;

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function lastDay(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  /**
   * Date range and SAP sources for a report and a selected YYYY-MM period.
   * Quarters follow the calendar year; a different fiscal calendar is not
   * supported yet and must be confirmed.
   */
  function pullPlan(reportType, period) {
    const report = PULL_REPORTS[reportType];
    if (!report) {
      return {
        errors: [`SAP pulls are not available for ${reportType || "this report"}. Supported: ${Object.keys(PULL_REPORTS).join(", ")}.`]
      };
    }
    const match = /^(\d{4})-(\d{2})$/.exec(String(period ?? ""));
    const year = match ? Number(match[1]) : NaN;
    const month = match ? Number(match[2]) : NaN;
    if (!match || month < 1 || month > 12) {
      return { errors: ["Choose a valid reporting month (YYYY-MM)."] };
    }

    const firstMonth = report.periodicity === "quarter" ? Math.floor((month - 1) / 3) * 3 + 1 : month;
    const endMonth = report.periodicity === "quarter" ? firstMonth + 2 : month;
    return {
      errors: [],
      reportType,
      period,
      direction: report.direction,
      periodicity: report.periodicity,
      sources: [...report.sources],
      from: `${year}-${pad(firstMonth)}-01`,
      to: `${year}-${pad(endMonth)}-${pad(lastDay(year, endMonth))}`
    };
  }

  function findProfile(reportType, profiles = MAPPING_PROFILES) {
    return profiles.find((profile) => profile.reportType === reportType) || null;
  }

  function documentKey(item) {
    const identity = item?.sourceIdentity || {};
    return `${identity.objectType}:${identity.docEntry}`;
  }

  function documentLabel(item) {
    const identity = item?.sourceIdentity || {};
    const label = OBJECT_LABELS[identity.objectType] || identity.objectType || "Document";
    const docNum = identity.docNum ?? item?.document?.DocNum;
    return `${label} ${docNum ?? "?"} (DocEntry ${identity.docEntry})`;
  }

  // Exact cents for a decimal SAP amount, or null when it is not numeric.
  function toCents(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(number)) return null;
    return Math.sign(number) * Math.round((Math.abs(number) + Number.EPSILON) * 100);
  }

  function formatCents(cents) {
    const sign = cents < 0 ? "-" : "";
    const absolute = Math.abs(cents);
    return `${sign}${Math.floor(absolute / 100)}.${pad(absolute % 100)}`;
  }

  function codeIndex(codes) {
    const index = new Map();
    for (const code of Array.isArray(codes) ? codes : []) {
      const key = text(code?.WTCode);
      if (key) index.set(key, code);
    }
    return index;
  }

  /**
   * Converts a SAP pull into a canonical buildDat source.
   * @param {object} pull       payload from POST /api/connectors/sap/pull
   * @param {object} options
   * @param {string} options.reportType  selected DAT report
   * @param {Iterable<string>} [options.excluded]  documentKey() values the operator excluded
   */
  function toSource(pull, { reportType, excluded = [], profiles = MAPPING_PROFILES } = {}) {
    const errors = [];
    const warnings = [];
    const notes = [];
    const excludedKeys = new Set(excluded);
    const documents = [];
    const result = (extra = {}) => ({
      headers: [],
      rows: [],
      rowNumbers: [],
      metadata: {},
      errors,
      warnings,
      notes,
      profile: null,
      documents,
      groups: [],
      reconciliation: null,
      ...extra
    });

    if (!pull || typeof pull !== "object" || !Array.isArray(pull.listings)) {
      errors.push("The SAP pull result is missing or incomplete. Pull the documents again.");
      return result();
    }
    if (pull.reportType !== reportType) {
      errors.push(`These SAP documents were pulled for ${pull.reportType}, but the selected report is ${reportType}. Pull again for the selected report.`);
      return result();
    }

    const plan = pullPlan(reportType, pull.period);
    if (plan.errors.length) {
      errors.push(...plan.errors);
      return result();
    }
    const expectedSources = new Set(plan.sources);
    const pulledSources = new Set(pull.listings.map((listing) => listing.source));
    for (const sourceKey of expectedSources) {
      if (!pulledSources.has(sourceKey)) {
        errors.push(`The SAP pull did not include ${sourceKey}; the result is incomplete. Pull the documents again.`);
      }
    }
    for (const listing of pull.listings) {
      if (!expectedSources.has(listing.source)) {
        errors.push(`The SAP pull included unexpected source ${listing.source} for ${reportType}.`);
      } else if (listing.from !== plan.from || listing.to !== plan.to) {
        errors.push(`The ${listing.source} listing covers ${listing.from}..${listing.to}, not the required ${plan.from}..${plan.to}.`);
      }
    }

    const profile = findProfile(reportType, profiles);
    if (!profile) {
      errors.push(`No SAP mapping profile exists for ${reportType}.`);
      return result();
    }
    if (profile.status !== "approved") {
      errors.push(`The SAP Business One → ${reportType} field mapping (${profile.id}) is pending approval, so conversion is disabled. ${profile.reason}`);
    }

    const codes = codeIndex(pull.codes);
    const groups = new Map();
    const totals = { lineIncome: 0, lineWithheld: 0, lines: 0, includedDocuments: 0 };

    for (const listing of pull.listings) {
      const sign = CREDIT_SOURCES.has(listing.source) ? -1 : 1;
      for (const item of Array.isArray(listing.documents) ? listing.documents : []) {
        const doc = item?.document || {};
        const key = documentKey(item);
        const label = documentLabel(item);
        const included = !excludedKeys.has(key);
        const issues = [];
        const issue = (message) => {
          if (issues.length < MAX_ISSUES_PER_DOCUMENT) issues.push(message);
        };

        const lines = Array.isArray(doc.WithholdingTaxDataCollection) ? doc.WithholdingTaxDataCollection : [];
        const tinParts = DatConverter.splitTinBranch(text(doc.FederalTaxID));
        const docDate = text(doc.DocDate).slice(0, 10);
        const name = text(doc.CardName);

        if (text(doc.Cancelled) && text(doc.Cancelled) !== "tNO") {
          issue(`is marked cancelled (Cancelled=${text(doc.Cancelled)}). Exclude it, or confirm how cancellations are reported.`);
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(docDate) || docDate < plan.from || docDate > plan.to) {
          issue(`has document date ${docDate || "(blank)"}, outside ${plan.from}..${plan.to}.`);
        }
        if (!tinParts) {
          issue(`has no valid TIN (FederalTaxID must be XXX-XXX-XXX-BBBB). The TIN is never assumed.`);
        } else if (!tinParts.branch) {
          issue(`has a TIN without a branch code. The branch code is required and is never assumed.`);
        }
        if (!name) {
          issue("has a blank business partner name (CardName).");
        }

        let docWithheld = 0;
        let lineWithheldKnown = true;
        const lineRows = [];
        lines.forEach((line, lineIndex) => {
          const at = `withholding line ${line?.LineNum ?? lineIndex}`;
          const wtCode = text(line?.WTCode);
          const code = codes.get(wtCode);
          const atc = text(code?.OfficialCode).toUpperCase();
          const category = text(line?.Category);
          const income = toCents(line?.TaxableAmount);
          const withheld = toCents(line?.WTAmount);
          const rate = toCents(line?.Rate);

          if (!wtCode) issue(`${at} has no withholding tax code.`);
          else if (!code) issue(`${at}: withholding tax code ${wtCode} is not in the SAP code list.`);
          else if (!atc) issue(`${at}: withholding tax code ${wtCode} has no Official Code (BIR ATC) in SAP.`);
          if (category && !/invoice/i.test(category)) {
            issue(`${at}: code ${wtCode} is ${category}; payment-based withholding is recorded on payments, which this pull does not read yet.`);
          }
          if (income === null) issue(`${at} has no taxable amount.`);
          if (withheld === null) {
            issue(`${at} has no withheld amount.`);
            lineWithheldKnown = false;
          } else {
            docWithheld += withheld;
          }
          if (rate === null) issue(`${at} has no rate.`);

          if (income !== null && withheld !== null && rate !== null) {
            const expected = Math.round((income * rate) / 10000);
            if (Math.abs(expected - withheld) > 1) {
              warnings.push(`${label} ${at}: withheld ${formatCents(withheld)} differs from taxable ${formatCents(income)} × ${formatCents(rate)}% (${formatCents(expected)}). The SAP amount is kept.`);
            }
          }
          lineRows.push({ atc, rate, income, withheld, nature: text(code?.WTName) });
        });

        const headerWithheld = toCents(doc.WTAmount);
        if (lineWithheldKnown && headerWithheld !== null && headerWithheld !== docWithheld) {
          warnings.push(`${label}: document withholding total ${formatCents(headerWithheld)} differs from its lines (${formatCents(docWithheld)}).`);
        }

        documents.push({
          key,
          label,
          source: listing.source,
          objectType: item?.sourceIdentity?.objectType || "",
          docEntry: item?.sourceIdentity?.docEntry ?? null,
          docNum: item?.sourceIdentity?.docNum ?? doc.DocNum ?? null,
          docDate,
          cardCode: text(doc.CardCode),
          cardName: name,
          tin: text(doc.FederalTaxID),
          withheld: lineWithheldKnown ? formatCents(sign * docWithheld) : "",
          sourceHash: item?.sourceHash || "",
          included,
          issues
        });

        if (!included) continue;
        if (issues.length) {
          for (const message of issues) errors.push(`${label} ${message}`);
          continue;
        }

        totals.includedDocuments += 1;
        for (const line of lineRows) {
          const groupKey = [tinParts.tin, tinParts.branch, line.atc, line.rate].join("|");
          let group = groups.get(groupKey);
          if (!group) {
            group = {
              tin: tinParts.tin,
              branch: tinParts.branch,
              atc: line.atc,
              rate: line.rate,
              names: new Set(),
              natures: new Set(),
              income: 0,
              withheld: 0,
              lastDate: "",
              documents: new Set()
            };
            groups.set(groupKey, group);
          }
          group.names.add(name);
          if (line.nature) group.natures.add(line.nature);
          group.income += sign * line.income;
          group.withheld += sign * line.withheld;
          if (docDate > group.lastDate) group.lastDate = docDate;
          group.documents.add(key);
          totals.lineIncome += sign * line.income;
          totals.lineWithheld += sign * line.withheld;
          totals.lines += 1;
        }
      }
    }

    const headers = [...DatConverter.CANONICAL_HEADERS.map(([, heading]) => heading), "Reporting Month"];
    const rows = [];
    const rowNumbers = [];
    const groupList = [];
    let rowIncome = 0;
    let rowWithheld = 0;

    for (const group of groups.values()) {
      const groupLabel = `Payee TIN ${group.tin}-${group.branch}, ATC ${group.atc}, rate ${formatCents(group.rate)}%`;
      if (group.names.size > 1) {
        errors.push(`${groupLabel}: the documents use ${group.names.size} different business partner names. Correct the SAP business partners or exclude documents.`);
        continue;
      }
      if (group.income === 0 && group.withheld === 0) {
        notes.push(`${groupLabel}: invoices and credit memos net to zero, so no detail record is written for it.`);
        continue;
      }
      if (group.income < 0 || group.withheld < 0) {
        errors.push(`${groupLabel}: credit memos exceed invoices for the period (income ${formatCents(group.income)}, withheld ${formatCents(group.withheld)}). Negative detail records are not written.`);
        continue;
      }

      const rowNumber = rows.length + 1;
      const [year, month] = group.lastDate.split("-");
      const canonical = {
        tin: group.tin,
        branch: group.branch,
        registeredName: [...group.names][0],
        lastName: "",
        firstName: "",
        middleName: "",
        atc: group.atc,
        nature: group.natures.size === 1 ? [...group.natures][0] : "",
        income: formatCents(group.income),
        rate: formatCents(group.rate),
        withheld: formatCents(group.withheld)
      };
      rows.push([...DatConverter.CANONICAL_HEADERS.map(([field]) => canonical[field] ?? ""), `${month}/${year}`]);
      rowNumbers.push(rowNumber);
      groupList.push({ rowNumber, label: groupLabel, documents: [...group.documents] });
      rowIncome += group.income;
      rowWithheld += group.withheld;
    }

    if (!documents.length) {
      errors.push(`SAP returned no documents with withholding tax for ${plan.from}..${plan.to}.`);
    } else if (!totals.includedDocuments && !errors.length) {
      errors.push("Every SAP document was excluded. Include at least one document.");
    }

    const reconciliation = {
      includedDocuments: totals.includedDocuments,
      excludedDocuments: documents.filter((item) => !item.included).length,
      withholdingLines: totals.lines,
      detailRows: rows.length,
      totalIncome: formatCents(totals.lineIncome),
      totalWithheld: formatCents(totals.lineWithheld),
      rowIncome: formatCents(rowIncome),
      rowWithheld: formatCents(rowWithheld)
    };
    // Zero-net groups contribute nothing, so line totals must equal row totals
    // whenever no group was rejected.
    reconciliation.matches = !errors.length &&
      reconciliation.totalIncome === reconciliation.rowIncome &&
      reconciliation.totalWithheld === reconciliation.rowWithheld;
    if (!errors.length && !reconciliation.matches) {
      errors.push(`Internal reconciliation failed: withholding lines total ${reconciliation.totalIncome} / ${reconciliation.totalWithheld} but detail rows total ${reconciliation.rowIncome} / ${reconciliation.rowWithheld}.`);
    }

    notes.push(`Rows are consolidated per payee TIN, branch, ATC and rate for ${plan.from}..${plan.to}; credit memos are subtracted. Row numbers refer to these consolidated rows.`);
    notes.push("Business partner names come from SAP CardName and are written as registered names. Individual payees need separate Last, First and Middle names, which standard SAP B1 does not provide.");
    notes.push("Amounts are SAP local-currency values (TaxableAmount, WTAmount). Confirm that the company's local currency is PHP.");
    if (plan.periodicity === "quarter") {
      notes.push("Quarters follow the calendar year. Confirm this matches the company's fiscal calendar.");
    }

    return result({ headers, rows, rowNumbers, profile, groups: groupList, reconciliation });
  }

  /**
   * Source-to-DAT reconciliation for a SAP pull: the DAT must contain exactly
   * one detail record per consolidated row and the same control totals.
   * @returns {string[]} discrepancies (empty when reconciled)
   */
  function reconcileDat(adapted, datResult) {
    const problems = [];
    const expected = adapted?.reconciliation;
    if (!expected || !datResult || datResult.errors?.length) {
      return ["The DAT output could not be reconciled with the SAP documents."];
    }
    if (datResult.detailCount !== adapted.rows.length) {
      problems.push(`The DAT has ${datResult.detailCount} detail records, but ${adapted.rows.length} consolidated rows were prepared.`);
    }
    if (datResult.totalIncome !== expected.totalIncome) {
      problems.push(`DAT total income ${datResult.totalIncome} does not match the SAP withholding lines (${expected.totalIncome}).`);
    }
    if (datResult.totalWithheld !== expected.totalWithheld) {
      problems.push(`DAT total tax withheld ${datResult.totalWithheld} does not match the SAP withholding lines (${expected.totalWithheld}).`);
    }
    return problems;
  }

  return {
    CREDIT_SOURCES,
    MAPPING_PROFILES,
    PULL_REPORTS,
    documentKey,
    findProfile,
    pullPlan,
    reconcileDat,
    toSource
  };
});
