const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseConverterErrors,
  resolveErrorField,
  resolveErrorColumn,
  extractTotals,
  countNonBlankRows,
  buildReconciliationRows,
  toCsv
} = require("../ui-helpers");
const { buildDat } = require("../converter");

test("parseConverterErrors splits general and row-level errors without dropping any", () => {
  const parsed = parseConverterErrors([
    "Missing required Excel columns: ATC.",
    "Row 5: Vendor TIN must contain exactly 9 digits.",
    "Row 5: Tax Amount must be a non-negative number.",
    "Row 12: Enter a debit or credit amount."
  ]);
  assert.deepEqual(parsed.general, ["Missing required Excel columns: ATC."]);
  assert.equal(parsed.rows.get(5).length, 2);
  assert.equal(parsed.rows.get(5)[0].label, "Vendor TIN");
  assert.equal(parsed.rows.get(5)[0].message, "Vendor TIN must contain exactly 9 digits.");
  assert.equal(parsed.rows.get(12)[0].label, null);
  assert.equal(parsed.total, 4);
});

test("parseConverterErrors tolerates empty and non-array input", () => {
  assert.equal(parseConverterErrors([]).total, 0);
  assert.equal(parseConverterErrors(undefined).total, 0);
});

test("resolveErrorField uses the longest matching label", () => {
  assert.equal(resolveErrorField("Discount Amount must be a number."), "discount");
  assert.equal(resolveErrorField("Discount must be a number."), "discount");
  assert.equal(resolveErrorField("GL Account Name is required."), "accountName");
  assert.equal(resolveErrorField("GL Account is required."), "account");
  assert.equal(resolveErrorField("Reporting Month does not match the selected reporting period."), "reportingMonth");
  assert.equal(resolveErrorField("ATC WC999 is not present in the BIR DAT validator ATC reference."), "atc");
  assert.equal(resolveErrorField("Enter a debit or credit amount."), null);
});

test("resolveErrorColumn maps a message to a column index, or -1", () => {
  assert.equal(resolveErrorColumn("Tax Amount must be a number.", { withheld: 7 }), 7);
  assert.equal(resolveErrorColumn("Tax Amount must be a number.", { withheld: -1 }), -1);
  assert.equal(resolveErrorColumn("Enter a debit or credit amount.", { debit: 3 }), -1);
  assert.equal(resolveErrorColumn("Tax Amount must be a number.", undefined), -1);
});

test("resolveErrorColumn finds the real column for a converter error", () => {
  const headers = ["Vendor TIN", "Branch Code", "Company Name", "Last Name", "First Name", "Middle Name", "ATC", "Income Payment", "Tax Rate", "Tax Amount"];
  const result = buildDat({
    headers,
    rows: [["12345", "0001", "TEST CO", "", "", "", "WC158", 100, 1, 1]],
    rowNumbers: [2],
    reportType: "1600VT",
    period: "2024-03",
    agent: { tin: "987654321", branch: "3333", rdo: "143", name: "AGENT" }
  });
  const parsed = parseConverterErrors(result.errors);
  const rowError = parsed.rows.get(2)[0];
  assert.equal(resolveErrorColumn(rowError.message, result.columns), 0);
});

test("extractTotals reads the totals a summary names", () => {
  assert.deepEqual(
    extractTotals("3 detail records · Total income 1,000.00 · Total tax withheld 20.00"),
    [
      { label: "income", value: "1,000.00" },
      { label: "tax withheld", value: "20.00" }
    ]
  );
  assert.deepEqual(extractTotals("2 detail records · Total debit 10.00 · Total credit -10.00"), [
    { label: "debit", value: "10.00" },
    { label: "credit", value: "-10.00" }
  ]);
  assert.deepEqual(extractTotals(""), []);
  assert.deepEqual(extractTotals(undefined), []);
  assert.deepEqual(extractTotals("4 detail records"), []);
});

test("countNonBlankRows ignores blank rows", () => {
  assert.equal(countNonBlankRows([["a"], ["", null], [], [" "], [0]]), 2);
  assert.equal(countNonBlankRows(undefined), 0);
});

test("toCsv quotes commas, quotes and newlines and uses CRLF", () => {
  assert.equal(toCsv([["a,b", "x\"y"]]), "\"a,b\",\"x\"\"y\"\r\n");
  assert.equal(toCsv([["plain", 12], ["line\nbreak", null]]), "plain,12\r\n\"line\nbreak\",\r\n");
});

test("buildReconciliationRows holds metadata only and ends with the certification note", () => {
  const rows = buildReconciliationRows({
    generatedAt: "2026-11-24T10:00:00.000Z",
    operator: "Operator One",
    reportType: "1600VT",
    reportTitle: "Monthly Alphalist of Payees (MAP)",
    period: "03/2024",
    sourceMode: "data-only",
    sourceName: "payees.xlsx",
    sheetName: "Sheet1",
    filename: "98765432133330320241600VT.DAT",
    sourceRows: 3,
    detailCount: 3,
    summary: "3 detail records · Total income 1,000.00 · Total tax withheld 20.00",
    reconciliation: "Source rows match DAT detail records."
  });
  const keys = rows.map(([key]) => key);
  assert.ok(keys.includes("DAT filename"));
  assert.ok(keys.includes("Total income"));
  assert.ok(keys.includes("Total tax withheld"));
  assert.ok(keys.every((key) => !/payee|tin\b/i.test(key)));
  assert.match(rows[rows.length - 1][1], /not a BIR compliance certification/i);
  assert.ok(rows.every((row) => row.length === 2 && row.every((cell) => typeof cell === "string")));
});
