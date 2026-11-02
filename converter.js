(function (root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.DatConverter = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const REPORTS = {
    "1600VT": {
      title: "Monthly Alphalist of Payees (MAP)",
      headerType: "HMAP",
      headerCode: "H1600VT",
      detailType: "DMAP",
      detailCode: "D1600VT",
      controlType: "CMAP",
      controlCode: "C1600VT",
      schedule: null
    },
    "1601EQ": {
      title: "Quarterly Alphalist of Payees (QAP)",
      headerType: "HQAP",
      headerCode: "H1601EQ",
      detailType: "D1",
      detailCode: "1601EQ",
      controlType: "C1",
      controlCode: "1601EQ",
      schedule: "D1"
    }
  };

  const COLUMNS = {
    tin: ["vendortin", "tinpayee", "tin"],
    branch: ["branchcode", "branchcodepayee", "vendorbranchcode"],
    registeredName: ["companyname", "registeredname", "vendorname"],
    lastName: ["lastname", "surname", "surnames"],
    firstName: ["firstname", "givenname"],
    middleName: ["middlename", "middlenamepayee"],
    atc: ["atc", "atccode"],
    nature: ["natureincome", "natureofincome", "natureofincomepayment"],
    income: ["incomepayment", "incomepaym", "taxbase"],
    rate: ["taxrate", "rateoftax"],
    withheld: ["taxamount", "actualamtwithheld", "amountwithheld"],
    reportingMonth: ["reportingmonth", "returnperiod", "taxablemonth"]
  };

  const REQUIRED_COLUMNS = [
    ["tin", "Vendor TIN"],
    ["branch", "Branch Code"],
    ["registeredName", "Company Name"],
    ["lastName", "Last Name"],
    ["firstName", "First Name"],
    ["middleName", "Middle Name"],
    ["atc", "ATC"],
    ["income", "Income Payment"],
    ["rate", "Tax Rate"],
    ["withheld", "Tax Amount"]
  ];

  function normalizeHeader(value) {
    return String(value ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function findColumns(headers) {
    const normalized = headers.map(normalizeHeader);
    const result = {};

    for (const [field, aliases] of Object.entries(COLUMNS)) {
      result[field] = normalized.findIndex((header) => aliases.includes(header));
    }

    return result;
  }

  function cleanText(value) {
    return String(value ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9 ]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeNumericId(value, label, width, errors, rowNumber) {
    const raw = String(value ?? "").trim();
    const normalized = raw.replace(/[\s-]/g, "");

    if (!/^\d+$/.test(normalized)) {
      errors.push(`Row ${rowNumber}: ${label} must contain digits only.`);
      return "";
    }

    if (normalized.length > width) {
      errors.push(`Row ${rowNumber}: ${label} must be ${width} digits or fewer.`);
      return "";
    }

    return normalized.padStart(width, "0");
  }

  function normalizeTin(value, label, errors, rowNumber) {
    const raw = String(value ?? "").trim();
    const normalized = raw.replace(/[\s-]/g, "");

    if (!/^\d{1,9}$/.test(normalized)) {
      errors.push(`Row ${rowNumber}: ${label} must contain no more than 9 digits.`);
      return "";
    }

    return normalized.padStart(9, "0");
  }

  function parseAmount(value, label, errors, rowNumber, required) {
    if (value === null || value === undefined || String(value).trim() === "") {
      if (required) {
        errors.push(`Row ${rowNumber}: ${label} is required.`);
        return null;
      }

      return 0;
    }

    const cleaned = typeof value === "number"
      ? value
      : Number(String(value).replace(/[,\s₱$]/g, "").replace(/^P(?=\d)/i, ""));

    if (!Number.isFinite(cleaned) || cleaned < 0) {
      errors.push(`Row ${rowNumber}: ${label} must be a non-negative number.`);
      return null;
    }

    const cents = Math.round((cleaned + Number.EPSILON) * 100);
    if (!Number.isSafeInteger(cents) || cents > 9999999999999) {
      errors.push(`Row ${rowNumber}: ${label} exceeds the documented 11-digit amount limit.`);
      return null;
    }

    return cents;
  }

  function formatCents(cents) {
    return (cents / 100).toFixed(2);
  }

  function parsePeriod(value) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(value ?? ""));
    if (!match) {
      return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) {
      return null;
    }

    return {
      formatted: `${match[2]}/${match[1]}`,
      filename: `${match[2]}${match[1]}`
    };
  }

  function metadataValue(value, label, width, errors, pattern) {
    const text = cleanText(value);

    if (!text) {
      errors.push(`${label} is required.`);
      return "";
    }

    if (text.length > width) {
      errors.push(`${label} must be ${width} characters or fewer.`);
      return "";
    }

    if (pattern && !pattern.test(text)) {
      errors.push(`${label} has an invalid format.`);
      return "";
    }

    return text;
  }

  function fixedDigits(value, label, width, errors) {
    const digits = String(value ?? "").replace(/[\s-]/g, "");
    if (!new RegExp(`^\\d{1,${width}}$`).test(digits)) {
      errors.push(`${label} must contain no more than ${width} digits.`);
      return "";
    }

    return digits.padStart(width, "0");
  }

  function buildDat({ headers, rows, rowNumbers = [], reportType, period, agent }) {
    const errors = [];
    const report = REPORTS[reportType];

    if (!report) {
      return { errors: ["Choose a supported reporting type."], filename: "", text: "" };
    }

    const selectedPeriod = parsePeriod(period);
    if (!selectedPeriod) {
      errors.push("Choose a valid reporting month.");
    }

    const agentTin = fixedDigits(agent?.tin, "Withholding agent TIN", 9, errors);
    const agentBranch = fixedDigits(agent?.branch, "Withholding agent branch code", 4, errors);
    const agentRdo = fixedDigits(agent?.rdo, "Withholding agent RDO code", 3, errors);
    const agentName = metadataValue(agent?.name, "Withholding agent registered name", 50, errors);

    const columns = findColumns(headers);
    const missingColumns = REQUIRED_COLUMNS
      .filter(([field]) => columns[field] < 0)
      .map(([, label]) => label);

    if (missingColumns.length) {
      errors.push(`Missing required Excel columns: ${missingColumns.join(", ")}.`);
    }

    if (errors.length) {
      return { errors, filename: "", text: "", columns, missingColumns };
    }

    const detailRows = [];
    let totalIncome = 0;
    let totalWithheld = 0;

    if (!missingColumns.length) {
      rows.forEach((row, index) => {
        const rowNumber = rowNumbers[index] ?? index + 2;
        const values = Array.isArray(row) ? row : [];

        if (values.every((value) => value === null || value === undefined || String(value).trim() === "")) {
          return;
        }

        const rowErrorsBefore = errors.length;
        const payeeTin = normalizeTin(values[columns.tin], "Vendor TIN", errors, rowNumber);
        const payeeBranch = normalizeNumericId(values[columns.branch], "Branch Code", 4, errors, rowNumber);
        const name = cleanText(values[columns.registeredName]);
        const lastName = cleanText(values[columns.lastName]);
        const firstName = cleanText(values[columns.firstName]);
        const middleName = cleanText(values[columns.middleName]);
        const atc = cleanText(values[columns.atc]);
        const nature = columns.nature >= 0 ? cleanText(values[columns.nature]) : "";
        const income = parseAmount(values[columns.income], "Income Payment", errors, rowNumber, false);
        const rate = parseAmount(values[columns.rate], "Tax Rate", errors, rowNumber, true);
        const withheld = parseAmount(values[columns.withheld], "Tax Amount", errors, rowNumber, false);

        const limitedText = [
          [name, 50, "Company Name"],
          [lastName, 30, "Last Name"],
          [firstName, 30, "First Name"],
          [middleName, 30, "Middle Name"],
          [atc, 5, "ATC"],
          [nature, 50, "Nature of Income"]
        ];

        for (const [text, width, label] of limitedText) {
          if (text.length > width) {
            errors.push(`Row ${rowNumber}: ${label} must be ${width} characters or fewer after removing special characters.`);
          }
        }

        if (rate !== null && rate > 9999) {
          errors.push(`Row ${rowNumber}: Tax Rate cannot exceed 99.99.`);
        }

        if (columns.reportingMonth >= 0 && values[columns.reportingMonth] !== "" && values[columns.reportingMonth] !== undefined) {
          const rowPeriod = parseSourcePeriod(values[columns.reportingMonth]);
          if (rowPeriod && rowPeriod !== selectedPeriod.formatted) {
            errors.push(`Row ${rowNumber}: Reporting Month does not match the selected reporting period.`);
          }
        }

        if (errors.length !== rowErrorsBefore) {
          return;
        }

        const detail = report.schedule
          ? [
              report.schedule,
              report.detailCode,
              String(detailRows.length + 1),
              payeeTin,
              payeeBranch,
              name,
              lastName,
              firstName,
              middleName,
              selectedPeriod.formatted,
              atc,
              formatCents(rate),
              formatCents(income),
              formatCents(withheld)
            ]
          : [
              report.detailType,
              report.detailCode,
              String(detailRows.length + 1),
              payeeTin,
              payeeBranch,
              name,
              lastName,
              firstName,
              middleName,
              selectedPeriod.formatted,
              atc,
              nature,
              formatCents(rate),
              formatCents(income),
              formatCents(withheld)
            ];

        detailRows.push(detail);
        totalIncome += income;
        totalWithheld += withheld;
      });
    }

    if (!detailRows.length && !missingColumns.length) {
      errors.push("No valid detail rows were found in the selected worksheet.");
    }

    if (totalIncome > 9999999999999) {
      errors.push("Total income exceeds the documented 11-digit amount limit.");
    }

    if (totalWithheld > 9999999999999) {
      errors.push("Total tax withheld exceeds the documented 11-digit amount limit.");
    }

    if (errors.length) {
      return { errors, filename: "", text: "", columns, missingColumns };
    }

    const header = [
      report.headerType,
      report.headerCode,
      agentTin,
      agentBranch,
      agentName,
      selectedPeriod.formatted,
      agentRdo
    ];

    const control = [
      report.controlType,
      report.controlCode,
      agentTin,
      agentBranch,
      selectedPeriod.formatted,
      formatCents(totalIncome),
      formatCents(totalWithheld)
    ];

    const filename = `${agentTin}${agentBranch}${selectedPeriod.filename}${reportType}.DAT`;
    const text = [header, ...detailRows, control]
      .map((record) => record.join(","))
      .join("\r\n");

    return {
      errors: [],
      filename,
      text,
      columns,
      detailCount: detailRows.length,
      totalIncome: formatCents(totalIncome),
      totalWithheld: formatCents(totalWithheld),
      reportTitle: report.title
    };
  }

  function parseSourcePeriod(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return `${String(value.getMonth() + 1).padStart(2, "0")}/${value.getFullYear()}`;
    }

    const text = String(value ?? "").trim();
    const monthDayYear = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
    if (monthDayYear) {
      const month = Number(monthDayYear[1]) <= 12
        ? Number(monthDayYear[1])
        : Number(monthDayYear[2]);
      if (month >= 1 && month <= 12) {
        return `${String(month).padStart(2, "0")}/${monthDayYear[3]}`;
      }
    }

    const monthFirst = /^(\d{1,2})[/-](\d{4})$/.exec(text);
    if (monthFirst && Number(monthFirst[1]) >= 1 && Number(monthFirst[1]) <= 12) {
      return `${monthFirst[1].padStart(2, "0")}/${monthFirst[2]}`;
    }

    const yearFirst = /^(\d{4})-(\d{2})/.exec(text);
    if (yearFirst && Number(yearFirst[2]) >= 1 && Number(yearFirst[2]) <= 12) {
      return `${yearFirst[2]}/${yearFirst[1]}`;
    }

    return null;
  }

  return {
    REPORTS,
    buildDat,
    cleanText,
    findColumns,
    normalizeHeader,
    parsePeriod
  };
});
