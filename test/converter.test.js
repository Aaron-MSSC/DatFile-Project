const test = require("node:test");
const assert = require("node:assert/strict");
const { buildDat, cleanText, findColumns, getJsonSchema } = require("../converter");

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

test("generates a 2550M SAWT DAT file with 10-field header, 15-field detail, 7-field control, and documented filename", () => {
  const result = buildDat({
    headers: [
      "Reporting Month",
      "Vendor TIN",
      "Branch Code",
      "Company Name",
      "Last Name",
      "First Name",
      "Middle Name",
      "Nature of Income",
      "ATC",
      "Income Payment",
      "Tax Rate",
      "Tax Amount"
    ],
    rows: [
      ["03/2024", "123456789", 1, "TPSC PHILIPPINES CORPORATION", "", "", "", "Rentals", "WC100", 45000, 5, 2250]
    ],
    reportType: "2550M",
    period: "2024-03",
    agent
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.filename, "98765432133330320242550M.DAT");
  assert.equal(result.detailCount, 1);
  assert.deepEqual(result.text.split("\r\n"), [
    "HSAWT,H2550M,987654321,3333,CONDE CRISTINA MONDELO,,,,03/2024,143",
    "DSAWT,D2550M,1,123456789,0001,TPSC PHILIPPINES CORPORATION,,,,03/2024,Rentals,WC100,5.00,45000.00,2250.00",
    "CSAWT,C2550M,987654321,3333,03/2024,45000.00,2250.00"
  ]);
  assert.equal(result.summary, "1 detail record · Total income 45000.00 · Total tax withheld 2250.00");
});

test("generates a 2550Q SAWT DAT file with multiple detail records and control totals", () => {
  const result = buildDat({
    headers,
    rows: [
      ["03/2024", "000111222", "0000", "", "KATINDIG", "ROBIN", "PADILLA", "WC051", 300000, 15, 45000],
      ["03/2024", "432222222", "0000", "ONE COMPANY", "", "", "", "WC010", 25000, 10, 2500]
    ],
    reportType: "2550Q",
    period: "2024-03",
    agent: {
      ...agent,
      lastName: "CONDE",
      firstName: "CRISTINA",
      middleName: "MONDELO"
    }
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.filename, "98765432133330320242550Q.DAT");
  assert.equal(result.detailCount, 2);
  assert.deepEqual(result.text.split("\r\n"), [
    "HSAWT,H2550Q,987654321,3333,CONDE CRISTINA MONDELO,CONDE,CRISTINA,MONDELO,03/2024,143",
    "DSAWT,D2550Q,1,000111222,0000,,KATINDIG,ROBIN,PADILLA,03/2024,,WC051,15.00,300000.00,45000.00",
    "DSAWT,D2550Q,2,432222222,0000,ONE COMPANY,,,,03/2024,,WC010,10.00,25000.00,2500.00",
    "CSAWT,C2550Q,987654321,3333,03/2024,325000.00,47500.00"
  ]);
  assert.equal(result.summary, "2 detail records · Total income 325000.00 · Total tax withheld 47500.00");
});

test("validates cleaned SAWT withholding-agent name parts against the 30-character limit", () => {
  const row = ["03/2024", "123456789", "0001", "PAYEE", "", "", "", "WC100", 100, 5, 5];

  for (const [field, label] of [
    ["lastName", "Last Name"],
    ["firstName", "First Name"],
    ["middleName", "Middle Name"]
  ]) {
    const valid = buildDat({
      headers,
      rows: [row],
      reportType: "2550Q",
      period: "2024-03",
      agent: { ...agent, [field]: "A".repeat(30) }
    });
    assert.deepEqual(valid.errors, []);

    const invalid = buildDat({
      headers,
      rows: [row],
      reportType: "2550Q",
      period: "2024-03",
      agent: { ...agent, [field]: "A".repeat(31) }
    });
    assert.ok(invalid.errors.some((error) => error.includes(`Withholding agent ${label}`)));
    assert.equal(invalid.text, "");
  }

  const cleaned = buildDat({
    headers,
    rows: [row],
    reportType: "2550Q",
    period: "2024-03",
    agent: { ...agent, lastName: `${"A".repeat(29)},!` }
  });
  assert.deepEqual(cleaned.errors, []);
  assert.equal(cleaned.text.split("\r\n")[0].split(",")[5], "A".repeat(29));
});

test("maps SAWT column headings from SAWT.xlsx", () => {
  const result = buildDat({
    headers: [
      "Taxpayer Identification No.",
      "Branch Code",
      "Corporation (Registered Name)",
      "Last Name",
      "First Name",
      "Middle Name",
      "ATC Code",
      "Nature of Income",
      "Amount of Income Payment",
      "Tax Rate",
      "Amount of Tax Withheld"
    ],
    rows: [
      ["009073361", "000", "TPSC PHILIPPINES CORPORATION", "", "", "", "WC100", "Rentals", 45000, 5, 2250]
    ],
    reportType: "2550M",
    period: "2024-03",
    agent
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.filename, "98765432133330320242550M.DAT");
  assert.match(result.text, /DSAWT,D2550M,1,009073361,0000,TPSC PHILIPPINES CORPORATION,,,,03\/2024,Rentals,WC100,5\.00,45000\.00,2250\.00/);
});

test("exposes 1601-EQ, 2550M, and 2550Q schemas separately from DAT report types", async () => {
  const expectedFormTypes = {
    "1601EQ-return": "1601-EQ",
    "2550M": "2550M",
    "2550Q": "2550Q"
  };
  for (const [schemaId, formType] of Object.entries(expectedFormTypes)) {
    const schema = await getJsonSchema(schemaId);
    assert.equal(schema.properties.formType.const, formType);
  }

  assert.equal((await getJsonSchema("1601EQ-return")).title, "BIR Form 1601-EQ return JSON");
  await assert.rejects(getJsonSchema("1601EQ"), /Unsupported JSON schema/);
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

test("maps common SAP Audit Trail worksheet headings", () => {
  const result = buildDat({
    headers: [
      "Generated Date & Time",
      "User Code",
      "User Login Name",
      "Module Name",
      "Activity Perform",
      "Ref Number",
      "Posting Date",
      "Details",
      "Amount"
    ],
    rows: [
      ["06/01/2026 1:11:00AM", "ACCTG/USER 1", "Jho Hokam", "A/P INVOICE", "CREATE", 406, "", "Invoice created", 125]
    ],
    reportType: "AT",
    period: "2026-06",
    agent
  });

  assert.deepEqual(result.errors, []);
  assert.match(result.text, /,AP INVOICE,CREATE,406,,Invoice created,125\.00,/);
});

test("parses day-first Audit Trail posting dates and rejects invalid calendar dates", () => {
  const headers = [
    "Generated Date & Time",
    "User Code",
    "User Login Name",
    "Module Name",
    "Activity Perform",
    "Ref Number",
    "Posting Date",
    "Details",
    "Amount"
  ];
  const row = [
    "06/01/2026 1:11:00AM",
    "ACCTG/USER 1",
    "Jho Hokam",
    "A/P INVOICE",
    "CREATE",
    406,
    "22/12/2025",
    "Invoice created",
    125
  ];
  const valid = buildDat({
    headers,
    rows: [row],
    reportType: "AT",
    period: "2026-06",
    agent
  });

  assert.deepEqual(valid.errors, []);
  assert.match(valid.text, /,406,12\/22\/2025,Invoice created,/);

  const invalid = buildDat({
    headers,
    rows: [[...row.slice(0, 6), "31/02/2025", ...row.slice(7)]],
    reportType: "AT",
    period: "2026-06",
    agent
  });
  assert.ok(invalid.errors.some((error) => error.includes("Posting Date must be a valid date")));
});

test("supports negative Audit Trail amounts but keeps other report amounts non-negative", () => {
  const auditTrail = buildDat({
    headers: [
      "Generated Date & Time",
      "User Code",
      "Username",
      "Module",
      "Activity",
      "Reference No.",
      "Details",
      "Amount"
    ],
    rows: [
      ["1/21/2013 11:28:00AM", "manager", "Jayson Butler", "ACCESS LOG", "ADJUST", 3920, "Adjustment", -125.5]
    ],
    reportType: "AT",
    period: "2024-03",
    agent
  });

  assert.deepEqual(auditTrail.errors, []);
  assert.match(auditTrail.text, /,3920,,Adjustment,-125\.50,03\/2024/);
  assert.equal(auditTrail.summary, "1 audit trail record · Total amount -125.50");

  const receiptBook = buildDat({
    headers: ["Date", "Debit", "Credit"],
    rows: [["03/05/2024", -125.5, ""]],
    reportType: "CRB",
    period: "2024-03",
    agent
  });
  assert.ok(receiptBook.errors.some((error) => error.includes("Debit must be a non-negative number")));
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

test("generates a Disbursement Journal with supplier, checks, and CDJ control totals", () => {
  const result = buildDat({
    headers: [
      "Date",
      "Supplier Name",
      "Reference No.",
      "Journal Entry No.",
      "Check No.",
      "Details",
      "GL Account",
      "GL Account Name",
      "Debit",
      "Credit",
      "Return Period"
    ],
    rows: [
      ["03/07/2024", "Supplier ABC", "PV-001", "2001", "CHK-101", "Payment for supplies", "2010", "Accounts Payable", 500, "", "03/2024"]
    ],
    reportType: "DJ",
    period: "2024-03",
    agent
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.filename, "9876543213333032024DJ.DAT");
  assert.deepEqual(result.text.split("\r\n"), [
    "H,HDJ,987654321,3333,CONDE CRISTINA MONDELO,03/2024,143",
    "D,DDJ,03/07/2024,Supplier ABC,PV001,2001,CHK101,Payment for supplies,2010,Accounts Payable,500.00,0.00,03/2024",
    "C,CDJ,987654321,3333,03/2024,500.00,0.00,0.00,0.00,500.00"
  ]);
});

test("generates a General Journal with reference, description, account, debit, credit", () => {
  const result = buildDat({
    headers: [
      "Date",
      "Reference No.",
      "Description",
      "Account",
      "Debit",
      "Credit",
      "Return Period"
    ],
    rows: [
      ["03/08/2024", "JV-001", "Depreciation expense", "5010", 250, "", "03/2024"],
      ["03/08/2024", "JV-001", "Accumulated depreciation", "1510", "", 250, "03/2024"]
    ],
    reportType: "GJ",
    period: "2024-03",
    agent
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.filename, "9876543213333032024GJ.DAT");
  assert.deepEqual(result.text.split("\r\n"), [
    "H,HGJB,987654321,3333,CONDE CRISTINA MONDELO,03/2024,143",
    "D,DGJB,03/08/2024,JV001,Depreciation expense,5010,250.00,0.00,03/2024",
    "D,DGJB,03/08/2024,JV001,Accumulated depreciation,1510,0.00,250.00,03/2024",
    "C,CGJB,987654321,3333,03/2024,250.00,250.00"
  ]);
});

test("generates a General Ledger with document, transaction, debit, credit, balance", () => {
  const result = buildDat({
    headers: [
      "Date",
      "Document No.",
      "Transaction No.",
      "Description",
      "Debit",
      "Credit",
      "Balance",
      "Return Period"
    ],
    rows: [
      ["03/09/2024", "DOC-001", "TR-100", "Initial balance", 1000, "", 1000, "03/2024"]
    ],
    reportType: "GL",
    period: "2024-03",
    agent
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.filename, "9876543213333032024GL.DAT");
  assert.deepEqual(result.text.split("\r\n"), [
    "H,HGLB,987654321,3333,CONDE CRISTINA MONDELO,03/2024,143",
    "D,DGLB,03/09/2024,DOC001,TR100,Initial balance,1000.00,0.00,1000.00,03/2024",
    "C,CGLB,987654321,3333,03/2024,1000.00,0.00,1000.00"
  ]);
});

test("generates an Inventory Journal without control records", () => {
  const result = buildDat({
    headers: [
      "Item Description",
      "Date",
      "Reference No.",
      "Warehouse",
      "Quantity",
      "UOM",
      "Price",
      "Total",
      "Return Period"
    ],
    rows: [
      ["Widget A", "03/10/2024", "REC-001", "WH-01", 10, "PCS", 50, 500, "03/2024"]
    ],
    reportType: "IJ",
    period: "2024-03",
    agent
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.filename, "9876543213333032024IJ.DAT");
  assert.deepEqual(result.text.split("\r\n"), [
    "H,HIJ,987654321,3333,CONDE CRISTINA MONDELO,03/2024,143",
    "D,DIJ,Widget A,03/10/2024,REC001,WH01,10.00,PCS,50.00,500.00,03/2024"
  ]);
});

test("generates a Purchase Journal with tax breakdown and CPJ control totals", () => {
  const result = buildDat({
    headers: [
      "Date",
      "Vendor TIN",
      "Vendor Name",
      "Vendor Address",
      "Description",
      "Reference No.",
      "Gross Amount",
      "Vatable Amount",
      "VAT Exempt Amount",
      "Zero Rated Amount",
      "Discount Amount",
      "VAT Amount",
      "Net Amount",
      "Return Period"
    ],
    rows: [
      ["03/11/2024", "111222333", "Vendor X", "Quezon City", "Inventory purchase", "INV-100", 1120, 1000, 25, 10, 0, 120, 1120, "03/2024"]
    ],
    reportType: "PJ",
    period: "2024-03",
    agent
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.filename, "9876543213333032024PJ.DAT");
  assert.deepEqual(result.text.split("\r\n"), [
    "H,HPJ,987654321,3333,CONDE CRISTINA MONDELO,03/2024,143",
    "D,DPJ,03/11/2024,111222333,Vendor X,Quezon City,Inventory purchase,INV100,1120.00,1000.00,25.00,10.00,0.00,120.00,1120.00,03/2024",
    "C,CPJ,987654321,3333,03/2024,1120.00,1000.00,25.00,10.00,0.00,120.00,1120.00"
  ]);
});

test("generates a Sales Journal with tax breakdown and CSJ control totals", () => {
  const result = buildDat({
    headers: [
      "Date",
      "Customer TIN",
      "Customer Name",
      "Customer Address",
      "Description",
      "Reference No.",
      "Gross Amount",
      "Vatable Amount",
      "VAT Exempt Amount",
      "Zero Rated Amount",
      "Discount Amount",
      "VAT Amount",
      "Net Amount",
      "Return Period"
    ],
    rows: [
      ["03/12/2024", "444555666", "Customer Y", "Makati City", "Product sales", "SI-200", 2240, 2000, 35, 15, 0, 240, 2240, "03/2024"]
    ],
    reportType: "SJ",
    period: "2024-03",
    agent
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.filename, "9876543213333032024SJ.DAT");
  assert.deepEqual(result.text.split("\r\n"), [
    "H,HSJ,987654321,3333,CONDE CRISTINA MONDELO,03/2024,143",
    "D,DSJ,03/12/2024,444555666,Customer Y,Makati City,Product sales,SI200,2240.00,2000.00,35.00,15.00,0.00,240.00,2240.00,03/2024",
    "C,CSJ,987654321,3333,03/2024,2240.00,2000.00,35.00,15.00,0.00,240.00,2240.00"
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
