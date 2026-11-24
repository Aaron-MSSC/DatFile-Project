const test = require("node:test");
const assert = require("node:assert/strict");
const { buildDat, extractReportLayout, splitTinBranch } = require("../converter");

// Synthetic BIR alphalist layouts modelled on Documentation/BIR/BIR REPORTS.
// All TINs and names are fictitious.
const HEADER = [
  "SEQ. NO\n\n (1)\n------------",
  "TAXPAYER IDENTIFICATION NO.\n\n (2)\n-----------",
  "CORPORATION\n(Registered Name)\n\n (3)\n---------",
  "INDIVIDUAL\n(Last Name, First Name, Middle Name)\n (4)\n------",
  "ATC CODE\n\n\n (5)\n--------",
  "NATURE OF INCOME\n\n\n (6)\n--------",
  "AMOUNT OF INCOME PAYMENT\n\n(7)\n-------",
  "TAX RATE\n\n\n(8)\n------",
  "AMOUNT OF TAX WITHHELD\n\n(9)\n------"
];

const agent = { tin: "987654321", branch: "3333", rdo: "143", name: "SAMPLE AGENT CORP" };

function mapLayout(details, grandTotal = ["Grand Total", 1350, 14, "END OF REPORT", "I declare...", "Signature", "", "", ""]) {
  return [
    ["BIR FORM\nMONTHLY ALPHALIST OF PAYEES (MAP)\nFOR THE MONTH OF MARCH 2026", "TIN: 987-654-321-3333", "WITHHOLDING AGENT'S NAME: SAMPLE AGENT CORP", "", "", "", "", "", ""],
    HEADER,
    ...details,
    grandTotal,
    [" Printed: 03/31/2026  5:00:00PM", "Page 1 of 1", "", "", "", "", "", "", ""]
  ];
}

const DETAILS = [
  [1, "123-456-789-000", "ALPHA TRADING INC", "", "WC158", "WC158 - 1% goods", 1000, 1, 10],
  [2, "111-222-333-0001", "BETA SERVICES CORP", "", "WC160", "WC160 - 2% services", 350, 2, 4]
];

test("splitTinBranch accepts only the strict 9-digit TIN plus 3-4 digit branch form", () => {
  assert.deepEqual(splitTinBranch("123-456-789-000"), { tin: "123456789", branch: "000" });
  assert.deepEqual(splitTinBranch("123456789"), { tin: "123456789", branch: "" });
  assert.deepEqual(splitTinBranch("111-222-333-0001"), { tin: "111222333", branch: "0001" });
  assert.equal(splitTinBranch("123-456789-00000"), null);
  assert.equal(splitTinBranch("123-456-789-00000"), null);
  assert.equal(splitTinBranch(""), null);
});

test("reads a MAP report layout, pre-fills agent metadata, reconciles the Grand Total, and builds the DAT", () => {
  const layout = extractReportLayout(mapLayout(DETAILS), { reportType: "1600VT" });

  assert.deepEqual(layout.errors, []);
  assert.deepEqual(layout.metadata, {
    agentTin: "987654321",
    agentBranch: "3333",
    agentName: "SAMPLE AGENT CORP",
    reportTitle: "MAP"
  });
  assert.deepEqual(layout.rowNumbers, [3, 4]);
  assert.equal(layout.reconciliation.matches, true);
  assert.equal(layout.reconciliation.method, "order");
  assert.equal(layout.reconciliation.reportIncome, "1350.00");

  const result = buildDat({ ...layout, reportType: "1600VT", period: "2026-03", agent });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.text.split("\r\n"), [
    "HMAP,H1600VT,987654321,3333,SAMPLE AGENT CORP,03/2026,143",
    "DMAP,D1600VT,1,123456789,000,ALPHA TRADING INC,,,,03/2026,WC158,WC158 1 goods,1.00,1000.00,10.00",
    "DMAP,D1600VT,2,111222333,0001,BETA SERVICES CORP,,,,03/2026,WC160,WC160 2 services,2.00,350.00,4.00",
    "CMAP,C1600VT,987654321,3333,03/2026,1350.00,14.00"
  ]);
});

test("reads merged SAWT-style headings and reconciles totals that sit under their columns", () => {
  // Header in row 3 spans rows 3-5; TIN heading spans columns 1-2 and data sits in column 2.
  const matrix = [
    ["", "BIR FORM\nSUMMARY ALPHALIST OF WITHHOLDING TAXES (SAWT)", "", "", "", "", "", "", "", ""],
    ["WITHHOLDING AGENT'S NAME: SAMPLE AGENT CORP", "", "", "", "", "", "", "", "", ""],
    ["SEQ. NO (1)", "TAXPAYER IDENTIFICATION NO. (2)", "", "CORPORATION (Registered Name) (3)", "INDIVIDUAL (Last Name, First Name, Middle Name) (4)", "ATC CODE (5)", "NATURE OF INCOME (6)", "AMOUNT OF INCOME PAYMENT (7)", "TAX RATE (8)", "AMOUNT OF TAX WITHHELD (9)"],
    ["", "", "", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", "", "", ""],
    [1, "", "123-456-789-000", "ALPHA TRADING INC", "", "WC100", "Rentals", 45000, 5, 2250],
    ["", "", "", "", "", "", "", "", "", ""],
    ["Grand Total", "", "", "", "", "", "", 45000, "", 2250],
    ["END OF REPORT", "", "", "", "", "", "", "", "", ""]
  ];
  const merges = [
    { s: { r: 2, c: 0 }, e: { r: 4, c: 0 } },
    { s: { r: 2, c: 1 }, e: { r: 4, c: 2 } }
  ];
  const layout = extractReportLayout(matrix, { merges, reportType: "2550M" });

  assert.deepEqual(layout.errors, []);
  assert.equal(layout.rows.length, 1);
  assert.deepEqual(layout.rowNumbers, [6]);
  assert.equal(layout.reconciliation.method, "column");
  assert.equal(layout.reconciliation.matches, true);
  assert.match(layout.notes.join(" "), /1 blank row/);

  const result = buildDat({ ...layout, reportType: "2550M", period: "2026-03", agent });
  assert.deepEqual(result.errors, []);
  assert.match(result.text, /DSAWT,D2550M,1,123456789,000,ALPHA TRADING INC,,,,03\/2026,Rentals,WC100,5\.00,45000\.00,2250\.00/);
});

test("flags a Grand Total that does not match the detail rows", () => {
  const layout = extractReportLayout(
    mapLayout(DETAILS, ["Grand Total", 9999, 14, "END OF REPORT", "", "", "", "", ""]),
    { reportType: "1600VT" }
  );
  assert.equal(layout.reconciliation.matches, false);
  assert.match(layout.errors.join("\n"), /Grand Total mismatch: the report shows income 9999\.00/);
});

test("does not split combined individual names or assume missing branch codes", () => {
  const layout = extractReportLayout(mapLayout([
    [1, "123-456-789", "", "DELA CRUZ, JUAN SANTOS", "WI010", "Prof fees", 1000, 10, 100],
    [2, "123-456789-00000", "GAMMA INC", "", "WC158", "Goods", 350, 1, 3.5],
    [3, "", "", "", "WC158", "Goods", 0, 1, 0]
  ], ["Grand Total", 1350, 103.5, "", "", "", "", "", ""]), { reportType: "1600VT" });

  const text = layout.errors.join("\n");
  assert.match(text, /Row 3: Taxpayer Identification No\. has no branch code suffix/);
  assert.match(text, /Row 3: the Individual payee name is in one combined column/);
  assert.match(text, /Row 4: Taxpayer Identification No\. must be in XXX-XXX-XXX-BBBB form/);
  assert.match(text, /Row 5: the payee has neither a Corporation/);
  // The combined name is never written into a name column.
  assert.deepEqual(layout.rows[0].slice(2, 6), ["", "", "", ""]);
});

test("refuses layouts whose data does not line up with the headings", () => {
  // QAP-style export: data rows carry extra columns beyond the nine headings.
  const layout = extractReportLayout(mapLayout([
    [1, 46080, "123-456-789-000", "ALPHA TRADING INC", "", "", "", "WC158", "Goods", 1000, 1, 10]
  ]), { reportType: "1600VT" });

  assert.equal(layout.errors.length, 1);
  assert.match(layout.errors[0], /column\(s\) J, K, L, which sit under no BIR column heading/);
  assert.equal(layout.headers.length, 0);
});

test("reports a missing header row, an unsupported report, and a title mismatch", () => {
  const noHeader = extractReportLayout([["Vendor TIN", "ATC"], ["123456789", "WC158"]], { reportType: "1600VT" });
  assert.match(noHeader.errors[0], /No BIR alphalist header row was found/);

  const ledger = extractReportLayout(mapLayout(DETAILS), { reportType: "GJ" });
  assert.match(ledger.errors[0], /supports the MAP \(1600VT\), QAP \(1601EQ\) and SAWT/);

  const mismatch = extractReportLayout(mapLayout(DETAILS), { reportType: "1601EQ" });
  assert.match(mismatch.warnings.join(" "), /title says MAP, but the selected report is 1601EQ/);
});

test("warns when no Grand Total row exists", () => {
  const matrix = mapLayout(DETAILS).slice(0, 4);
  const layout = extractReportLayout(matrix, { reportType: "1600VT" });
  assert.equal(layout.reconciliation, null);
  assert.match(layout.warnings.join(" "), /No Grand Total row was found/);
});
