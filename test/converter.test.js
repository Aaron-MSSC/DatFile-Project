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
