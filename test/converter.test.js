const test = require("node:test");
const assert = require("node:assert/strict");
const { buildDat, cleanText, findColumns } = require("../converter");

const headers = [
  "Reporting Month",
  "Vendor TIN",
  "Branch Code",
  "Company Name",
  "Last Name",
  "First Name",
  "Middle Name",
  "ATC",
  "Income Payment",
  "Tax Rate",
  "Tax Amount"
];

const agent = {
  tin: "987654321",
  branch: "3333",
  rdo: "143",
  name: "CONDE CRISTINA MONDELO"
};

test("generates a MAP DAT file with header, detail, control, and documented filename", () => {
  const result = buildDat({
    headers,
    rows: [
      ["2024-03-01", "123456789", 1, "TEST, COMPANY", "ONE", "ALEX", "B", "WC158", 1250, 5, 62.5]
    ],
    reportType: "1600VT",
    period: "2024-03",
    agent
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.filename, "98765432133330320241600VT.DAT");
  assert.equal(result.detailCount, 1);
  assert.deepEqual(result.text.split("\r\n"), [
    "HMAP,H1600VT,987654321,3333,CONDE CRISTINA MONDELO,03/2024,143",
    "DMAP,D1600VT,1,123456789,0001,TEST COMPANY,ONE,ALEX,B,03/2024,WC158,,5.00,1250.00,62.50",
    "CMAP,C1600VT,987654321,3333,03/2024,1250.00,62.50"
  ]);
});

test("generates a QAP DAT file and totals multiple detail records", () => {
  const result = buildDat({
    headers,
    rows: [
      ["03/2024", "123456789", "0001", "PAYEE ONE", "ONE", "ALICE", "", "WC158", 100, 5, 5],
      ["03/2024", "111222333", "2", "PAYEE TWO", "TWO", "BOB", "C", "WC160", 200, 2, 4]
    ],
    reportType: "1601EQ",
    period: "2024-03",
    agent
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.filename, "98765432133330320241601EQ.DAT");
  assert.deepEqual(result.text.split("\r\n"), [
    "HQAP,H1601EQ,987654321,3333,CONDE CRISTINA MONDELO,03/2024,143",
    "D1,1601EQ,1,123456789,0001,PAYEE ONE,ONE,ALICE,,03/2024,WC158,5.00,100.00,5.00",
    "D1,1601EQ,2,111222333,0002,PAYEE TWO,TWO,BOB,C,03/2024,WC160,2.00,200.00,4.00",
    "C1,1601EQ,987654321,3333,03/2024,300.00,9.00"
  ]);
});

test("generates an Audit Trail file in the documented header and detail format", () => {
  const result = buildDat({
    headers: [
      "Generated Date & Time",
      "User Code",
      "Username",
      "Module",
      "Activity",
      "Reference No.",
      "Posting Date",
      "Details",
      "Amount",
      "Return Period"
    ],
    rows: [
      ["1/21/2013 11:28:00AM", "manager", "Jayson Butler", "ACCESS LOG", "LOGOFF", 3920, "", "", "", "03/2024"]
    ],
    reportType: "AT",
    period: "2024-03",
    agent
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.filename, "9876543213333032024AT.DAT");
  assert.deepEqual(result.text.split("\r\n"), [
    "H,HAT,987654321,3333,CONDE CRISTINA MONDELO,03/2024,143",
    "D,AT,1/21/2013 11:28:00AM,manager,Jayson Butler,ACCESS LOG,LOGOFF,3920,,,0.00,03/2024"
  ]);
  assert.equal(result.summary, "1 audit trail record · Total amount 0.00");
});

test("generates a Cash Receipt Book file and balances its control totals", () => {
  const result = buildDat({
    headers: [
      "Date",
      "Customer Name",
      "Reference No.",
      "Journal Entry No.",
      "Details",
      "GL Account",
      "GL Account Name",
      "Debit",
      "Credit",
      "Return Period"
    ],
    rows: [
      ["03/05/2024", "Customer One", "OR-100", "1001", "Cash received", "1010", "Cash on hand", 100, "", "03/2024"],
      ["03/06/2024", "Customer Two", "OR-101", "1002", "Invoice payment", "4000", "Sales", "", 100, "03/2024"]
    ],
    reportType: "CRB",
    period: "2024-03",
    agent
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.filename, "9876543213333032024CRB.DAT");
  assert.deepEqual(result.text.split("\r\n"), [
    "H,HCRB,987654321,3333,CONDE CRISTINA MONDELO,03/2024,143",
    "D,DCRB,03/05/2024,Customer One,OR100,1001,Cash received,1010,Cash on hand,100.00,0.00,03/2024",
    "D,DCRB,03/06/2024,Customer Two,OR101,1002,Invoice payment,4000,Sales,0.00,100.00,03/2024",
    "C,CCRB,987654321,3333,03/2024,100.00,100.00"
  ]);
  assert.equal(result.summary, "2 detail records · Total debit 100.00 · Total credit 100.00");
});

const memoHeaders = [
  "Date",
  "Customer TIN",
  "Customer Name",
  "Customer Address",
  "Description",
  "Reference No.",
  "Amount",
  "Discount",
  "VAT Amount",
  "Withholding Amount",
  "Net Sales",
  "Return Period"
];

test("generates a Credit Memo Journal with customer fields and memo control totals", () => {
  const result = buildDat({
    headers: memoHeaders,
    rows: [
      ["03/05/2024", "123456789", "ACME, INC.", "123 Main St.", "Price adjustment", "CM-001", 1200, 100, 132, "", 1232, "03/2024"]
    ],
    reportType: "CMJ",
    period: "2024-03",
    agent
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.filename, "9876543213333032024CMJ.DAT");
  assert.deepEqual(result.text.split("\r\n"), [
    "H,HCMJ,987654321,3333,CONDE CRISTINA MONDELO,03/2024,143",
    "D,DCMJ,03/05/2024,123456789,ACME INC,123 Main St,Price adjustment,CM001,1200.00,100.00,132.00,0.00,1232.00,03/2024",
    "C,CCMJ,987654321,3333,03/2024,1200.00,100.00,132.00,0.00,1232.00"
  ]);
});

test("generates a Debit Memo Journal with vendor fields and memo control totals", () => {
  const result = buildDat({
    headers: [
      "Date",
      "Vendor TIN",
      "Vendor Name",
      "Vendor Address",
      "Description",
      "Reference No.",
      "Amount",
      "Discount",
      "VAT Amount",
      "Withholding Amount",
      "Net Sales",
      "Return Period"
    ],
    rows: [
      ["03/06/2024", "987654321", "SUPPLIER ONE", "45 Vendor Road", "Returned goods", "DM-101", 500, 25, 60, 10, 525, "03/2024"]
    ],
    reportType: "DMJ",
    period: "2024-03",
    agent
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.filename, "9876543213333032024DMJ.DAT");
  assert.deepEqual(result.text.split("\r\n"), [
    "H,HDMJ,987654321,3333,CONDE CRISTINA MONDELO,03/2024,143",
    "D,DDMJ,03/06/2024,987654321,SUPPLIER ONE,45 Vendor Road,Returned goods,DM101,500.00,25.00,60.00,10.00,525.00,03/2024",
    "C,CDMJ,987654321,3333,03/2024,500.00,25.00,60.00,10.00,525.00"
  ]);
});

test("validates ledger columns, dates, and cash receipt debit or credit values", () => {
  const missingAuditColumn = buildDat({
    headers: ["Generated Date & Time"],
    rows: [],
    reportType: "AT",
    period: "2024-03",
    agent
  });
  assert.match(missingAuditColumn.errors.join(" "), /User Code/);

  const invalidCashDate = buildDat({
    headers: ["Date", "Debit", "Credit"],
    rows: [["not a date", 10, ""]],
    reportType: "CRB",
    period: "2024-03",
    agent
  });
  assert.ok(invalidCashDate.errors.some((error) => error.includes("valid date")));

  const emptyCashRow = buildDat({
    headers: ["Date", "Debit", "Credit"],
    rows: [["03/05/2024", "", ""]],
    reportType: "CRB",
    period: "2024-03",
    agent
  });
  assert.ok(emptyCashRow.errors.some((error) => error.includes("Enter a debit or credit")));

  const mismatchedPeriod = buildDat({
    headers: ["Date", "Debit", "Credit", "Return Period"],
    rows: [["03/05/2024", 10, "", "02/2024"]],
    reportType: "CRB",
    period: "2024-03",
    agent
  });
  assert.ok(mismatchedPeriod.errors.some((error) => error.includes("Reporting Period does not match")));
});

test("reports missing required columns and invalid record values", () => {
  const missing = buildDat({
    headers: ["Vendor TIN"],
    rows: [],
    reportType: "1600VT",
    period: "2024-03",
    agent
  });
  assert.match(missing.errors.join(" "), /Missing required Excel columns/);

  const invalid = buildDat({
    headers,
    rows: [["03/2024", "bad-tin", 1, "PAYEE", "ONE", "A", "", "WC158", -1, 5, 0]],
    reportType: "1600VT",
    period: "2024-03",
    agent
  });
  assert.ok(invalid.errors.some((error) => error.includes("Vendor TIN")));
  assert.ok(invalid.errors.some((error) => error.includes("Income Payment")));
});

test("pads identifiers and reports invalid or mismatched reporting periods", () => {
  const padded = buildDat({
    headers,
    rows: [
      ["02/21/2024", "12345678", 1, "PAYEE", "ONE", "A", "", "WC158", 100, 5, 5]
    ],
    reportType: "1600VT",
    period: "2024-02",
    agent: { tin: "12345678", branch: "1", rdo: "3", name: "Agent" }
  });
  assert.deepEqual(padded.errors, []);
  assert.match(padded.text, /^HMAP,H1600VT,012345678,0001,Agent,02\/2024,003/);

  const invalidPeriod = buildDat({
    headers,
    rows: [],
    reportType: "1600VT",
    period: "not-a-month",
    agent
  });
  assert.ok(invalidPeriod.errors.includes("Choose a valid reporting month."));

  const mismatchedPeriod = buildDat({
    headers,
    rows: [
      ["03/2024", "123456789", 1, "PAYEE", "ONE", "A", "", "WC158", 100, 5, 5]
    ],
    reportType: "1600VT",
    period: "2024-02",
    agent
  });
  assert.ok(mismatchedPeriod.errors.some((error) => error.includes("Reporting Month does not match")));
});

test("normalizes column headings and removes special characters from DAT text", () => {
  assert.equal(findColumns(["Vendor TIN", "Company_Name"]).tin, 0);
  assert.equal(findColumns(["Vendor TIN", "Company_Name"]).registeredName, 1);
  assert.equal(cleanText("Méndez, & Sons, Inc."), "Mendez Sons Inc");
});
