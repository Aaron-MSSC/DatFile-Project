const test = require("node:test");
const assert = require("node:assert/strict");
const { buildDat } = require("../converter");
const {
  MAPPING_PROFILES,
  documentKey,
  pullPlan,
  reconcileDat,
  toSource
} = require("../sap-withholding");

// Fictitious SAP data. TINs, names and codes are test values only.
const approved = MAPPING_PROFILES.map((profile) => ({ ...profile, status: "approved" }));
const agent = { tin: "987654321", branch: "0000", rdo: "043", name: "SAMPLE AGENT CORP" };
const codes = [
  { WTCode: "WC158", WTName: "Goods 1%", OfficialCode: "WC158", Category: "wtcc_Invoice" },
  { WTCode: "WC160", WTName: "Services 2%", OfficialCode: "WC160", Category: "wtcc_Invoice" },
  { WTCode: "NOATC", WTName: "Unmapped", OfficialCode: null },
  { WTCode: "PAY01", WTName: "On payment", OfficialCode: "WC158", Category: "wtcc_Payment" }
];

let nextEntry = 1;
function doc(objectType, overrides = {}, lines = null) {
  const docEntry = nextEntry++;
  return {
    sourceIdentity: { companyDB: "TESTDB", objectType, docEntry, docNum: 5000 + docEntry, series: 1, branchId: 1 },
    sourceHash: "a".repeat(64),
    document: {
      DocNum: 5000 + docEntry,
      DocDate: "2026-02-10",
      CardCode: "V001",
      CardName: "ALPHA TRADING INC",
      FederalTaxID: "123-456-789-0000",
      Cancelled: "tNO",
      WTAmount: 10,
      WithholdingTaxDataCollection: lines ?? [
        { LineNum: 0, WTCode: "WC158", Rate: 1, TaxableAmount: 1000, WTAmount: 10, Category: "wtcc_Invoice" }
      ],
      ...overrides
    }
  };
}

function pull({ reportType = "1601EQ", period = "2026-03", invoices = [], credits = [] } = {}) {
  const plan = pullPlan(reportType, period);
  const [invoiceSource, creditSource] = plan.sources;
  return {
    connection: { name: "SAP Business One", companyDB: "TESTDB" },
    reportType,
    period,
    from: plan.from,
    to: plan.to,
    codes,
    listings: [
      { source: invoiceSource, from: plan.from, to: plan.to, documents: invoices },
      { source: creditSource, from: plan.from, to: plan.to, documents: credits }
    ]
  };
}

test("pull plans cover the calendar quarter or month of the selected period", () => {
  assert.deepEqual(
    (({ from, to, sources }) => ({ from, to, sources }))(pullPlan("1601EQ", "2026-08")),
    { from: "2026-07-01", to: "2026-09-30", sources: ["purchase-invoices", "purchase-credit-memos"] }
  );
  const monthly = pullPlan("2550M", "2028-02");
  assert.equal(monthly.from, "2028-02-01");
  assert.equal(monthly.to, "2028-02-29");
  assert.deepEqual(monthly.sources, ["sales-invoices", "sales-credit-memos"]);
  assert.equal(pullPlan("2550Q", "2026-12").from, "2026-10-01");
  assert.match(pullPlan("1600VT", "2026-01").errors[0], /not available/);
  assert.match(pullPlan("1601EQ", "2026-13").errors[0], /valid reporting month/);
});

test("profiles are pending approval and block conversion while preview still works", () => {
  for (const profile of MAPPING_PROFILES) assert.equal(profile.status, "pending-approval");
  const adapted = toSource(pull({ invoices: [doc("PurchaseInvoice")] }), { reportType: "1601EQ" });
  assert.match(adapted.errors.join("\n"), /pending approval/);
  assert.equal(adapted.rows.length, 1);
  assert.equal(adapted.documents.length, 1);
});

test("consolidates per payee TIN, branch, ATC and rate and nets credit memos", () => {
  const source = pull({
    invoices: [
      doc("PurchaseInvoice", { DocDate: "2026-01-05" }),
      doc("PurchaseInvoice", { DocDate: "2026-03-20", WTAmount: 30 }, [
        { WTCode: "WC158", Rate: 1, TaxableAmount: 1000, WTAmount: 10 },
        { WTCode: "WC160", Rate: 2, TaxableAmount: 1000, WTAmount: 20 }
      ]),
      doc("PurchaseInvoice", { CardName: "BETA SERVICES CO", FederalTaxID: "222-333-444-0001", WTAmount: 4 }, [
        { WTCode: "WC160", Rate: 2, TaxableAmount: 200, WTAmount: 4 }
      ])
    ],
    credits: [
      doc("PurchaseCreditMemo", { DocDate: "2026-02-01", WTAmount: 2.5 }, [
        { WTCode: "WC158", Rate: 1, TaxableAmount: 250, WTAmount: 2.5 }
      ])
    ]
  });

  const adapted = toSource(source, { reportType: "1601EQ", profiles: approved });

  assert.deepEqual(adapted.errors, []);
  assert.equal(adapted.rows.length, 3);
  const alphaGoods = adapted.rows.find((row) => row[0] === "123456789" && row[6] === "WC158");
  // 1000 + 1000 - 250 income; 10 + 10 - 2.50 withheld; latest document month.
  assert.deepEqual(alphaGoods, ["123456789", "0000", "ALPHA TRADING INC", "", "", "", "WC158", "Goods 1%", "1750.00", "1.00", "17.50", "03/2026"]);
  assert.deepEqual(adapted.reconciliation, {
    includedDocuments: 4,
    excludedDocuments: 0,
    withholdingLines: 5,
    detailRows: 3,
    totalIncome: "2950.00",
    totalWithheld: "41.50",
    rowIncome: "2950.00",
    rowWithheld: "41.50",
    matches: true
  });

  const dat = buildDat({
    headers: adapted.headers,
    rows: adapted.rows,
    rowNumbers: adapted.rowNumbers,
    reportType: "1601EQ",
    period: "2026-03",
    agent
  });
  assert.deepEqual(dat.errors, []);
  assert.equal(dat.filename, "9876543210000032026" + "1601EQ.DAT");
  const records = dat.text.split("\r\n");
  assert.equal(records.length, 5);
  assert.equal(records[0], "HQAP,H1601EQ,987654321,0000,SAMPLE AGENT CORP,03/2026,043");
  assert.equal(records[1], "D1,1601EQ,1,123456789,0000,ALPHA TRADING INC,,,,03/2026,WC158,1.00,1750.00,17.50");
  assert.equal(records[4], "C1,1601EQ,987654321,0000,03/2026,2950.00,41.50");
  assert.deepEqual(reconcileDat(adapted, dat), []);
});

test("reconcileDat reports count and total discrepancies", () => {
  const adapted = toSource(pull({ invoices: [doc("PurchaseInvoice")] }), { reportType: "1601EQ", profiles: approved });
  const problems = reconcileDat(adapted, { errors: [], detailCount: 2, totalIncome: "1.00", totalWithheld: "10.00" });
  assert.equal(problems.length, 2);
  assert.match(problems[0], /2 detail records/);
  assert.match(problems[1], /total income 1.00/);
});

test("never assumes a TIN, branch, ATC or amount and names the SAP document", () => {
  const missingTin = doc("PurchaseInvoice", { FederalTaxID: null });
  const noBranch = doc("PurchaseInvoice", { FederalTaxID: "123456789" });
  const noAtc = doc("PurchaseInvoice", {}, [{ WTCode: "NOATC", Rate: 1, TaxableAmount: 100, WTAmount: 1 }]);
  const unknownCode = doc("PurchaseInvoice", {}, [{ WTCode: "ZZZ", Rate: 1, TaxableAmount: 100, WTAmount: 1 }]);
  const noAmount = doc("PurchaseInvoice", {}, [{ WTCode: "WC158", Rate: 1, TaxableAmount: null, WTAmount: 1 }]);
  const paymentCategory = doc("PurchaseInvoice", {}, [{ WTCode: "PAY01", Rate: 1, TaxableAmount: 100, WTAmount: 1, Category: "wtcc_Payment" }]);
  const cancelled = doc("PurchaseInvoice", { Cancelled: "tYES" });
  const outOfRange = doc("PurchaseInvoice", { DocDate: "2026-04-01" });

  const adapted = toSource(pull({
    invoices: [missingTin, noBranch, noAtc, unknownCode, noAmount, paymentCategory, cancelled, outOfRange]
  }), { reportType: "1601EQ", profiles: approved });
  const text = adapted.errors.join("\n");

  assert.match(text, new RegExp(`AP Invoice ${missingTin.sourceIdentity.docNum} \\(DocEntry ${missingTin.sourceIdentity.docEntry}\\) has no valid TIN`));
  assert.match(text, /TIN without a branch code/);
  assert.match(text, /NOATC has no Official Code/);
  assert.match(text, /ZZZ is not in the SAP code list/);
  assert.match(text, /has no taxable amount/);
  assert.match(text, /payment-based withholding/);
  assert.match(text, /marked cancelled/);
  assert.match(text, /outside 2026-01-01\.\.2026-03-31/);
  assert.equal(adapted.rows.length, 0);
});

test("excluded documents are left out and reported in the review list", () => {
  const good = doc("PurchaseInvoice");
  const bad = doc("PurchaseInvoice", { FederalTaxID: null });
  const source = pull({ invoices: [good, bad] });

  const blocked = toSource(source, { reportType: "1601EQ", profiles: approved });
  assert.equal(blocked.errors.length, 1);

  const adapted = toSource(source, { reportType: "1601EQ", profiles: approved, excluded: [documentKey(bad)] });
  assert.deepEqual(adapted.errors, []);
  assert.equal(adapted.reconciliation.excludedDocuments, 1);
  assert.equal(adapted.documents.find((item) => item.key === documentKey(bad)).included, false);
  assert.equal(adapted.rows.length, 1);

  const none = toSource(source, { reportType: "1601EQ", profiles: approved, excluded: [documentKey(good), documentKey(bad)] });
  assert.match(none.errors.join("\n"), /Every SAP document was excluded/);
});

test("credit memos exceeding invoices block the payee; zero-net groups are noted, not written", () => {
  const negative = toSource(pull({
    invoices: [doc("PurchaseInvoice")],
    credits: [doc("PurchaseCreditMemo", { WTAmount: 20 }, [{ WTCode: "WC158", Rate: 1, TaxableAmount: 2000, WTAmount: 20 }])]
  }), { reportType: "1601EQ", profiles: approved });
  assert.match(negative.errors.join("\n"), /credit memos exceed invoices/);

  const zero = toSource(pull({
    invoices: [doc("PurchaseInvoice"), doc("PurchaseInvoice", { CardName: "BETA", FederalTaxID: "222-333-444-0001" })],
    credits: [doc("PurchaseCreditMemo")]
  }), { reportType: "1601EQ", profiles: approved });
  assert.deepEqual(zero.errors, []);
  assert.equal(zero.rows.length, 1);
  assert.match(zero.notes.join("\n"), /net to zero/);
  assert.equal(zero.reconciliation.matches, true);
});

test("different names for one TIN, a mismatched report and an incomplete pull are refused", () => {
  const names = toSource(pull({
    invoices: [doc("PurchaseInvoice"), doc("PurchaseInvoice", { CardName: "ALPHA TRADING INCORPORATED" })]
  }), { reportType: "1601EQ", profiles: approved });
  assert.match(names.errors.join("\n"), /2 different business partner names/);

  const wrongReport = toSource(pull({ invoices: [doc("PurchaseInvoice")] }), { reportType: "2550Q", profiles: approved });
  assert.match(wrongReport.errors[0], /pulled for 1601EQ/);

  const incomplete = pull({ invoices: [doc("PurchaseInvoice")] });
  incomplete.listings.pop();
  assert.match(toSource(incomplete, { reportType: "1601EQ", profiles: approved }).errors.join("\n"), /did not include purchase-credit-memos/);
});

test("warns, without changing SAP amounts, when withheld differs from taxable × rate", () => {
  const adapted = toSource(pull({
    invoices: [doc("PurchaseInvoice", { WTAmount: 12 }, [{ WTCode: "WC158", Rate: 1, TaxableAmount: 1000, WTAmount: 12 }])]
  }), { reportType: "1601EQ", profiles: approved });
  assert.deepEqual(adapted.errors, []);
  assert.match(adapted.warnings.join("\n"), /differs from taxable 1000.00 × 1.00%/);
  assert.equal(adapted.rows[0][10], "12.00");
});

test("SAWT 2550M uses AR documents and produces a DAT that buildDat accepts", () => {
  const source = pull({
    reportType: "2550M",
    period: "2026-02",
    invoices: [doc("Invoice", { CardName: "CUSTOMER GAMMA CORP", FederalTaxID: "333-444-555-000" }, [
      { WTCode: "WC158", Rate: 1, TaxableAmount: 5000, WTAmount: 50 }
    ])]
  });
  source.listings[0].documents[0].document.WTAmount = 50;
  const adapted = toSource(source, { reportType: "2550M", profiles: approved });
  assert.deepEqual(adapted.errors, []);

  const dat = buildDat({ ...adapted, reportType: "2550M", period: "2026-02", agent });
  assert.deepEqual(dat.errors, []);
  // buildDat removes special characters such as "%" from text fields.
  assert.equal(dat.text.split("\r\n")[1], "DSAWT,D2550M,1,333444555,000,CUSTOMER GAMMA CORP,,,,02/2026,Goods 1,WC158,1.00,5000.00,50.00");
  assert.deepEqual(reconcileDat(adapted, dat), []);
});
