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

  const LEDGER_COLUMNS = {
    AT: {
      datetime: ["dtime", "datetime", "generateddatetime", "dateandtime", "timestamp"],
      userCode: ["usercode", "userid", "userlogin"],
      username: ["username", "userloginname", "loginname"],
      module: ["mod", "module", "modulename"],
      action: ["act", "activity", "action", "activityperform", "activityperformed"],
      reference: ["refno", "refnumber", "referenceno", "referencenumber"],
      postingDate: ["postdate", "postingdate"],
      details: ["details", "description"],
      amount: ["amt", "amount"],
      reportingPeriod: ["retrnperiod", "returnperiod", "reportingperiod"]
    },
    CRB: {
      date: ["date", "receiptdate", "transactiondate"],
      customer: ["cstname", "custname", "customername", "customer"],
      reference: ["refno", "referenceno", "referencenumber"],
      journalEntry: ["jeno", "journalentryno", "journalentrynumber"],
      details: ["details", "description"],
      account: ["glacct", "glaccount", "glaccountcode"],
      accountName: ["glacctname", "glaccountname", "accountname"],
      debit: ["debit", "debitamount"],
      credit: ["credit", "creditamount"],
      reportingPeriod: ["retrnperiod", "returnperiod", "reportingperiod"]
    },
    CMJ: {
      date: ["dtime", "date", "documentdate"],
      tin: ["csttin", "customertin", "tin"],
      name: ["cstname", "customername", "name"],
      address: ["cstaddr", "customeraddress", "address"],
      description: ["desc", "description"],
      reference: ["refno", "referenceno", "referencenumber"],
      amount: ["amt", "amount"],
      discount: ["discnt", "discount"],
      vat: ["vatamt", "vatamount"],
      withholding: ["whtamt", "withholdingamount", "whtamount"],
      net: ["net", "netsales", "netsalesamount"],
      reportingPeriod: ["retrnperiod", "returnperiod", "reportingperiod"]
    },
    DMJ: {
      date: ["dtime", "date", "documentdate"],
      tin: ["vndtin", "vendortin", "suppliertin", "tin"],
      name: ["vndname", "vendorname", "suppliername", "name"],
      address: ["vndaddr", "vendoraddress", "supplieraddress", "address"],
      description: ["desc", "description"],
      reference: ["refno", "referenceno", "referencenumber"],
      amount: ["amt", "amount"],
      discount: ["discnt", "discount"],
      vat: ["vatamt", "vatamount"],
      withholding: ["whtamt", "withholdingamount", "whtamount"],
      net: ["net", "netsales", "netsalesamount"],
      reportingPeriod: ["retrnperiod", "returnperiod", "reportingperiod"]
    },
    DJ: {
      date: ["dtime", "date", "disbursementdate", "transactiondate"],
      supplier: ["splname", "suppliername", "vendorname", "payeename", "supplier", "vendor"],
      reference: ["refno", "referenceno", "referencenumber"],
      journalEntry: ["jeno", "journalentryno", "journalentrynumber"],
      checkNo: ["checkno", "checknumber", "chkno"],
      details: ["details", "description", "particulars"],
      account: ["glacct", "glaccount", "glaccountcode"],
      accountName: ["glacctname", "glaccountname", "accountname"],
      debit: ["debit", "debitamount"],
      credit: ["credit", "creditamount"],
      amount: ["amt", "amount", "gnamt"],
      discount: ["discnt", "discount", "gndisc"],
      vat: ["vatamt", "vatamount", "gnvatamt"],
      withholding: ["whtamt", "withholdingamount", "gnwhtamt"],
      net: ["net", "netsales", "gnnet"],
      reportingPeriod: ["retrnperiod", "returnperiod", "reportingperiod"]
    },
    CDJ: {
      date: ["dtime", "date", "disbursementdate", "transactiondate"],
      supplier: ["splname", "suppliername", "vendorname", "payeename", "supplier", "vendor"],
      reference: ["refno", "referenceno", "referencenumber"],
      journalEntry: ["jeno", "journalentryno", "journalentrynumber"],
      checkNo: ["checkno", "checknumber", "chkno"],
      details: ["details", "description", "particulars"],
      account: ["glacct", "glaccount", "glaccountcode"],
      accountName: ["glacctname", "glaccountname", "accountname"],
      debit: ["debit", "debitamount"],
      credit: ["credit", "creditamount"],
      amount: ["amt", "amount", "gnamt"],
      discount: ["discnt", "discount", "gndisc"],
      vat: ["vatamt", "vatamount", "gnvatamt"],
      withholding: ["whtamt", "withholdingamount", "gnwhtamt"],
      net: ["net", "netsales", "gnnet"],
      reportingPeriod: ["retrnperiod", "returnperiod", "reportingperiod"]
    },
    GJ: {
      date: ["dtime", "date", "journaldate", "transactiondate"],
      reference: ["refno", "referenceno", "referencenumber"],
      description: ["desc", "description", "particulars", "details"],
      account: ["acct", "account", "glacct", "glaccount", "glaccountcode", "accountcode"],
      debit: ["debit", "debitamount"],
      credit: ["credit", "creditamount"],
      reportingPeriod: ["retrnperiod", "returnperiod", "reportingperiod"]
    },
    GJB: {
      date: ["dtime", "date", "journaldate", "transactiondate"],
      reference: ["refno", "referenceno", "referencenumber"],
      description: ["desc", "description", "particulars", "details"],
      account: ["acct", "account", "glacct", "glaccount", "glaccountcode", "accountcode"],
      debit: ["debit", "debitamount"],
      credit: ["credit", "creditamount"],
      reportingPeriod: ["retrnperiod", "returnperiod", "reportingperiod"]
    },
    GL: {
      date: ["dtime", "date", "postingdate", "transactiondate"],
      docNo: ["docno", "documentno", "documentnumber"],
      transNo: ["transno", "transactionno", "transactionnumber"],
      description: ["desc", "description", "particulars", "details"],
      debit: ["debit", "debitamount"],
      credit: ["credit", "creditamount"],
      balance: ["bal", "balance", "runningbalance", "endingbalance"],
      reportingPeriod: ["retrnperiod", "returnperiod", "reportingperiod"]
    },
    GLB: {
      date: ["dtime", "date", "postingdate", "transactiondate"],
      docNo: ["docno", "documentno", "documentnumber"],
      transNo: ["transno", "transactionno", "transactionnumber"],
      description: ["desc", "description", "particulars", "details"],
      debit: ["debit", "debitamount"],
      credit: ["credit", "creditamount"],
      balance: ["bal", "balance", "runningbalance", "endingbalance"],
      reportingPeriod: ["retrnperiod", "returnperiod", "reportingperiod"]
    },
    IJ: {
      description: ["desc", "itemdescription", "description", "itemname", "item"],
      date: ["date", "inventorydate", "transactiondate"],
      reference: ["refno", "referenceno", "referencenumber"],
      warehouse: ["whse", "warehouse", "warehousename", "warehousecode"],
      quantity: ["qty", "quantity"],
      uom: ["uom", "unit", "unitofmeasurement", "unitofmeasure"],
      price: ["price", "unitprice", "cost", "unitcost"],
      total: ["total", "totalamount", "amt", "amount", "totalcost"],
      reportingPeriod: ["retrnperiod", "returnperiod", "reportingperiod"]
    },
    PJ: {
      date: ["date", "purchasedate", "transactiondate"],
      tin: ["vndtin", "vendortin", "suppliertin", "tin"],
      name: ["vndname", "vendorname", "suppliername", "name"],
      address: ["vndaddr", "vendoraddress", "supplieraddress", "address"],
      description: ["desc", "description", "particulars"],
      reference: ["refno", "referenceno", "referencenumber"],
      grossAmount: ["grsamt", "grossamount", "grossamt", "gross"],
      taxBase: ["taxbase", "vatablepurchase", "vatablepurchases", "vatableamount", "taxableamount", "taxablepurchases", "taxable"],
      vatExempt: ["vatexe", "vatexempt", "vatexemptamount", "vatexemptpurchase", "exempt"],
      vatZero: ["vatzero", "vatzerorated", "zeroratedamount", "zeroratedpurchase", "zerorated"],
      discount: ["discamt", "discount", "discountamount"],
      vat: ["vatamt", "vatamount", "inputvat", "vat"],
      net: ["netamt", "netamount", "net"],
      reportingPeriod: ["retrnperiod", "returnperiod", "reportingperiod"]
    },
    SJ: {
      date: ["date", "saledate", "salesdate", "transactiondate"],
      tin: ["csttin", "customertin", "tin"],
      name: ["cstname", "customername", "name"],
      address: ["cstaddr", "customeraddress", "address"],
      description: ["desc", "description", "particulars"],
      reference: ["refno", "referenceno", "referencenumber"],
      grossAmount: ["grsamt", "grossamount", "grossamt", "gross"],
      taxBase: ["taxbase", "vatablesales", "vatablesale", "vatableamount", "taxableamount", "taxablesales", "taxable"],
      vatExempt: ["vatexe", "vatexempt", "vatexemptamount", "vatexemptsales", "exempt"],
      vatZero: ["vatzero", "vatzerorated", "zeroratedamount", "zeroratedsales", "zerorated"],
      discount: ["discamt", "discount", "discountamount"],
      vat: ["vatamt", "vatamount", "outputvat", "vat"],
      net: ["netamt", "netamount", "net"],
      reportingPeriod: ["retrnperiod", "returnperiod", "reportingperiod"]
    }
  };

  const REPORT_COLUMNS = {
    "1600VT": REQUIRED_COLUMNS.map(([field]) => field),
    "1601EQ": REQUIRED_COLUMNS.map(([field]) => field),
    AT: ["datetime", "userCode", "username", "module", "action", "reference", "details", "amount"],
    CRB: ["date", "debit", "credit"],
    CMJ: ["date", "tin", "name", "amount", "net"],
    DMJ: ["date", "tin", "name", "amount", "net"],
    DJ: ["date", "debit", "credit"],
    CDJ: ["date", "debit", "credit"],
    GJ: ["date", "debit", "credit"],
    GJB: ["date", "debit", "credit"],
    GL: ["date", "debit", "credit"],
    GLB: ["date", "debit", "credit"],
    IJ: ["description", "date", "quantity", "total"],
    PJ: ["date", "tin", "name", "grossAmount", "net"],
    SJ: ["date", "tin", "name", "grossAmount", "net"]
  };

  const REPORT_COLUMN_LABELS = {
    ...Object.fromEntries(REQUIRED_COLUMNS),
    datetime: "Generated Date & Time",
    userCode: "User Code",
    username: "Username",
    module: "Module",
    action: "Activity",
    reference: "Reference No.",
    details: "Details",
    amount: "Amount",
    date: "Date",
    debit: "Debit",
    credit: "Credit",
    tin: "Customer/Vendor TIN",
    name: "Customer/Vendor Name",
    net: "Net Sales",
    supplier: "Supplier Name",
    customer: "Customer Name",
    journalEntry: "Journal Entry No.",
    checkNo: "Check No.",
    account: "Account Code",
    accountName: "Account Name",
    description: "Description",
    docNo: "Document No.",
    transNo: "Transaction No.",
    balance: "Balance",
    warehouse: "Warehouse",
    quantity: "Quantity",
    uom: "UOM",
    price: "Unit Price",
    total: "Total",
    grossAmount: "Gross Amount",
    taxBase: "Vatable Amount",
    vatExempt: "VAT Exempt Amount",
    vatZero: "Zero Rated Amount",
    discount: "Discount Amount",
    vat: "VAT Amount"
  };

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

  function parseAmount(value, label, errors, rowNumber, required, allowNegative = false) {
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

    if (!Number.isFinite(cleaned) || (!allowNegative && cleaned < 0)) {
      errors.push(`Row ${rowNumber}: ${label} must be ${allowNegative ? "a number" : "a non-negative number"}.`);
      return null;
    }

    const cents = Math.sign(cleaned) * Math.round((Math.abs(cleaned) + Number.EPSILON) * 100);
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

  function getRequiredColumns(reportType) {
    return REPORT_COLUMNS[reportType] ?? [];
  }

  function getMissingColumns(headers, reportType) {
    const aliases = LEDGER_COLUMNS[reportType];
    if (aliases) {
      const normalizedHeaders = headers.map(normalizeHeader);
      return getRequiredColumns(reportType)
        .filter((field) => !normalizedHeaders.some((header) => aliases[field].includes(header)))
        .map((field) => REPORT_COLUMN_LABELS[field] || field);
    }

    const columns = findColumns(headers);
    return REQUIRED_COLUMNS
      .filter(([field]) => getRequiredColumns(reportType).includes(field) && columns[field] < 0)
      .map(([, label]) => label);
  }

  function ledgerColumns(headers, reportType) {
    const normalizedHeaders = headers.map(normalizeHeader);
    return Object.fromEntries(
      Object.entries(LEDGER_COLUMNS[reportType]).map(([field, aliases]) => [
        field,
        normalizedHeaders.findIndex((header) => aliases.includes(header))
      ])
    );
  }

  function findColumnValues(columns, values, fields) {
    return Object.fromEntries(fields.map((field) => [
      field,
      columns[field] >= 0 ? values[columns[field]] : ""
    ]));
  }

  function cleanLedgerText(value, label, rowNumber, errors, required, maxLength) {
    const text = cleanText(value);
    if (required && !text) {
      errors.push(`Row ${rowNumber}: ${label} is required.`);
    }
    if (maxLength && text.length > maxLength) {
      errors.push(`Row ${rowNumber}: ${label} must be ${maxLength} characters or fewer.`);
    }
    return text;
  }

  function parseExcelDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      const wholeDays = Math.floor(value);
      const timeOfDay = Math.round((value - wholeDays) * 86400000);
      const date = new Date(1899, 11, 30 + wholeDays);
      date.setMilliseconds(timeOfDay);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const text = String(value ?? "").trim();
    const isoDateTime = /^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM))?$/i.exec(text);
    if (isoDateTime) {
      const normalized = text.replace(/\s+/, "T");
      const date = new Date(normalized);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i.exec(text);
    if (match) {
      const firstPart = Number(match[1]);
      const secondPart = Number(match[2]);
      const dayFirst = firstPart > 12;
      const month = dayFirst ? secondPart : firstPart;
      const day = dayFirst ? firstPart : secondPart;
      const year = Number(match[3]);
      let hour = Number(match[4] ?? 0);
      const minute = Number(match[5] ?? 0);
      const second = Number(match[6] ?? 0);
      const meridiem = match[7]?.toUpperCase();

      if (month < 1 || month > 12 || day < 1 || day > 31 || minute > 59 || second > 59) {
        return null;
      }
      if (meridiem) {
        if (hour < 1 || hour > 12) {
          return null;
        }
        hour = hour % 12 + (meridiem === "PM" ? 12 : 0);
      } else if (hour > 23) {
        return null;
      }

      const date = new Date(year, month - 1, day, hour, minute, second);
      return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
        ? date
        : null;
    }

    if (/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(text)) {
      const date = new Date(text);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    return null;
  }

  function formatLedgerDate(value, label, rowNumber, errors, includeTime) {
    const date = parseExcelDate(value);
    if (!date) {
      errors.push(`Row ${rowNumber}: ${label} must be a valid date${includeTime ? " and time" : ""}.`);
      return "";
    }

    const month = date.getMonth() + 1;
    const day = date.getDate();
    const year = date.getFullYear();
    if (!includeTime) {
      return `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}/${year}`;
    }

    const hours = date.getHours();
    const meridiem = hours >= 12 ? "PM" : "AM";
    const displayHour = hours % 12 || 12;
    return `${month}/${day}/${year} ${displayHour}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}${meridiem}`;
  }

  function checkLedgerPeriod(value, selectedPeriod, errors, rowNumber) {
    if (value === null || value === undefined || String(value).trim() === "") {
      return;
    }
    const rowPeriod = parseSourcePeriod(value);
    if (rowPeriod && rowPeriod !== selectedPeriod.formatted) {
      errors.push(`Row ${rowNumber}: Reporting Period does not match the selected reporting period.`);
    }
  }

  function buildLedgerDat({ headers, rows, rowNumbers, reportType, selectedPeriod, agentTin, agentBranch, agentRdo, agentName }) {
    const aliases = LEDGER_COLUMNS[reportType];
    const columns = ledgerColumns(headers, reportType);
    const missingColumns = getMissingColumns(headers, reportType);
    if (missingColumns.length) {
      return {
        errors: [`Missing required Excel columns: ${missingColumns.join(", ")}.`],
        filename: "",
        text: "",
        columns,
        missingColumns
      };
    }

    const errors = [];
    const detailRecords = [];

    let totalDebit = 0;
    let totalCredit = 0;
    let totalBal = 0;
    let totalAmount = 0;
    let totalDiscount = 0;
    let totalVat = 0;
    let totalWithholding = 0;
    let totalNet = 0;
    let totalGross = 0;
    let totalTaxBase = 0;
    let totalVatExe = 0;
    let totalVatZero = 0;

    rows.forEach((row, index) => {
      const rowNumber = rowNumbers[index] ?? index + 2;
      const values = Array.isArray(row) ? row : [];
      if (values.every((value) => value === null || value === undefined || String(value).trim() === "")) {
        return;
      }

      const rowErrorsBefore = errors.length;
      const source = findColumnValues(columns, values, Object.keys(aliases));
      checkLedgerPeriod(source.reportingPeriod, selectedPeriod, errors, rowNumber);

      if (reportType === "AT") {
        const datetime = formatLedgerDate(source.datetime, "Generated Date & Time", rowNumber, errors, true);
        const userCode = cleanLedgerText(source.userCode, "User Code", rowNumber, errors, true);
        const username = cleanLedgerText(source.username, "Username", rowNumber, errors, true);
        const module = cleanLedgerText(source.module, "Module", rowNumber, errors, true);
        const action = cleanLedgerText(source.action, "Activity", rowNumber, errors, true);
        const reference = cleanLedgerText(source.reference, "Reference No.", rowNumber, errors, true);
        const postingDate = source.postingDate
          ? formatLedgerDate(source.postingDate, "Posting Date", rowNumber, errors, false)
          : "";
        const particulars = cleanLedgerText(source.details, "Details", rowNumber, errors, false);
        const amount = parseAmount(source.amount, "Amount", errors, rowNumber, false, true);

        if (errors.length !== rowErrorsBefore) {
          return;
        }

        detailRecords.push([
          "D",
          "AT",
          datetime,
          userCode,
          username,
          module,
          action,
          reference,
          postingDate,
          particulars,
          formatCents(amount),
          selectedPeriod.formatted
        ]);
        totalAmount += amount;
      } else if (reportType === "CRB") {
        const date = formatLedgerDate(source.date, "Date", rowNumber, errors, false);
        const customer = cleanLedgerText(source.customer, "Customer Name", rowNumber, errors, false);
        const reference = cleanLedgerText(source.reference, "Reference No.", rowNumber, errors, false);
        const journalEntry = cleanLedgerText(source.journalEntry, "Journal Entry No.", rowNumber, errors, false);
        const particulars = cleanLedgerText(source.details, "Details", rowNumber, errors, false);
        const account = cleanLedgerText(source.account, "GL Account", rowNumber, errors, false);
        const accountName = cleanLedgerText(source.accountName, "GL Account Name", rowNumber, errors, false);
        const debit = parseAmount(source.debit, "Debit", errors, rowNumber, false);
        const credit = parseAmount(source.credit, "Credit", errors, rowNumber, false);

        if (debit === 0 && credit === 0) {
          errors.push(`Row ${rowNumber}: Enter a debit or credit amount.`);
        }

        if (errors.length !== rowErrorsBefore) {
          return;
        }

        detailRecords.push([
          "D",
          "DCRB",
          date,
          customer,
          reference,
          journalEntry,
          particulars,
          account,
          accountName,
          formatCents(debit),
          formatCents(credit),
          selectedPeriod.formatted
        ]);
        totalDebit += debit;
        totalCredit += credit;
      } else if (reportType === "CMJ" || reportType === "DMJ") {
        const date = formatLedgerDate(source.date, "Date", rowNumber, errors, false);
        const partyLabel = reportType === "CMJ" ? "Customer" : "Vendor";
        const tin = normalizeTin(source.tin, `${partyLabel} TIN`, errors, rowNumber);
        const name = cleanLedgerText(source.name, `${partyLabel} Name`, rowNumber, errors, true, 50);
        const address = cleanLedgerText(source.address, `${partyLabel} Address`, rowNumber, errors, false);
        const description = cleanLedgerText(source.description, "Description", rowNumber, errors, false);
        const reference = cleanLedgerText(source.reference, "Reference No.", rowNumber, errors, false);
        const amount = parseAmount(source.amount, "Amount", errors, rowNumber, false);
        const discount = parseAmount(source.discount, "Discount", errors, rowNumber, false);
        const vat = parseAmount(source.vat, "VAT Amount", errors, rowNumber, false);
        const withholding = parseAmount(source.withholding, "Withholding Amount", errors, rowNumber, false);
        const net = parseAmount(source.net, "Net Sales", errors, rowNumber, false);

        if (errors.length !== rowErrorsBefore) {
          return;
        }

        detailRecords.push([
          "D",
          reportType === "CMJ" ? "DCMJ" : "DDMJ",
          date,
          tin,
          name,
          address,
          description,
          reference,
          formatCents(amount),
          formatCents(discount),
          formatCents(vat),
          formatCents(withholding),
          formatCents(net),
          selectedPeriod.formatted
        ]);
        totalAmount += amount;
        totalDiscount += discount;
        totalVat += vat;
        totalWithholding += withholding;
        totalNet += net;
      } else if (reportType === "DJ" || reportType === "CDJ") {
        // Disbursement Journal: D, DDJ, DTIME, SPL_NAME, REF_NO, JE_NO, CHECK_NO, DETAILS, GL_ACCT, GL_ACCT_NAME, DEBIT, CREDIT, RETRN_PERIOD
        const date = formatLedgerDate(source.date, "Date", rowNumber, errors, false);
        const supplier = cleanLedgerText(source.supplier, "Supplier Name", rowNumber, errors, false);
        const reference = cleanLedgerText(source.reference, "Reference No.", rowNumber, errors, false);
        const journalEntry = cleanLedgerText(source.journalEntry, "Journal Entry No.", rowNumber, errors, false);
        const checkNo = cleanLedgerText(source.checkNo, "Check No.", rowNumber, errors, false);
        const particulars = cleanLedgerText(source.details, "Details", rowNumber, errors, false);
        const account = cleanLedgerText(source.account, "GL Account", rowNumber, errors, false);
        const accountName = cleanLedgerText(source.accountName, "GL Account Name", rowNumber, errors, false);
        const debit = parseAmount(source.debit, "Debit", errors, rowNumber, false);
        const credit = parseAmount(source.credit, "Credit", errors, rowNumber, false);
        const amount = parseAmount(source.amount, "Amount", errors, rowNumber, false);
        const discount = parseAmount(source.discount, "Discount", errors, rowNumber, false);
        const vat = parseAmount(source.vat, "VAT Amount", errors, rowNumber, false);
        const withholding = parseAmount(source.withholding, "Withholding Amount", errors, rowNumber, false);
        const net = parseAmount(source.net, "Net Sales", errors, rowNumber, false);

        if (debit === 0 && credit === 0 && amount === 0) {
          errors.push(`Row ${rowNumber}: Enter a debit, credit, or amount value.`);
        }

        if (errors.length !== rowErrorsBefore) {
          return;
        }

        detailRecords.push([
          "D",
          "DDJ",
          date,
          supplier,
          reference,
          journalEntry,
          checkNo,
          particulars,
          account,
          accountName,
          formatCents(debit),
          formatCents(credit),
          selectedPeriod.formatted
        ]);
        totalDebit += debit;
        totalCredit += credit;
        totalAmount += amount || debit || credit;
        totalDiscount += discount;
        totalVat += vat;
        totalWithholding += withholding;
        totalNet += net || (amount || debit || credit);
      } else if (reportType === "GJ" || reportType === "GJB") {
        // General Journal: D, DGJB, DTIME, REF_NO, DESC, ACCT, DEBIT, CREDIT, RETRN_PERIOD
        const date = formatLedgerDate(source.date, "Date", rowNumber, errors, false);
        const reference = cleanLedgerText(source.reference, "Reference No.", rowNumber, errors, false);
        const description = cleanLedgerText(source.description, "Description", rowNumber, errors, false);
        const account = cleanLedgerText(source.account, "Account", rowNumber, errors, false);
        const debit = parseAmount(source.debit, "Debit", errors, rowNumber, false);
        const credit = parseAmount(source.credit, "Credit", errors, rowNumber, false);

        if (debit === 0 && credit === 0) {
          errors.push(`Row ${rowNumber}: Enter a debit or credit amount.`);
        }

        if (errors.length !== rowErrorsBefore) {
          return;
        }

        detailRecords.push([
          "D",
          "DGJB",
          date,
          reference,
          description,
          account,
          formatCents(debit),
          formatCents(credit),
          selectedPeriod.formatted
        ]);
        totalDebit += debit;
        totalCredit += credit;
      } else if (reportType === "GL" || reportType === "GLB") {
        // General Ledger: D, DGLB, DTIME, DOC_NO, TRANS_NO, DESC, DEBIT, CREDIT, BAL, RETRN_PERIOD
        const date = formatLedgerDate(source.date, "Date", rowNumber, errors, false);
        const docNo = cleanLedgerText(source.docNo, "Document No.", rowNumber, errors, false);
        const transNo = cleanLedgerText(source.transNo, "Transaction No.", rowNumber, errors, false);
        const description = cleanLedgerText(source.description, "Description", rowNumber, errors, false);
        const debit = parseAmount(source.debit, "Debit", errors, rowNumber, false);
        const credit = parseAmount(source.credit, "Credit", errors, rowNumber, false);
        const balance = parseAmount(source.balance, "Balance", errors, rowNumber, false);

        if (errors.length !== rowErrorsBefore) {
          return;
        }

        detailRecords.push([
          "D",
          "DGLB",
          date,
          docNo,
          transNo,
          description,
          formatCents(debit),
          formatCents(credit),
          formatCents(balance),
          selectedPeriod.formatted
        ]);
        totalDebit += debit;
        totalCredit += credit;
        totalBal += balance;
      } else if (reportType === "IJ") {
        // Inventory Journal: D, DIJ, DESC, DATE, REF_NO, WHSE, QTY, UOM, PRICE, TOTAL, RETRN_PERIOD
        const description = cleanLedgerText(source.description, "Item Description", rowNumber, errors, false);
        const date = formatLedgerDate(source.date, "Date", rowNumber, errors, false);
        const reference = cleanLedgerText(source.reference, "Reference No.", rowNumber, errors, false);
        const warehouse = cleanLedgerText(source.warehouse, "Warehouse", rowNumber, errors, false);
        const quantity = parseAmount(source.quantity, "Quantity", errors, rowNumber, false);
        const uom = cleanLedgerText(source.uom, "UOM", rowNumber, errors, false);
        const price = parseAmount(source.price, "Price", errors, rowNumber, false);
        const total = parseAmount(source.total, "Total", errors, rowNumber, false);

        if (errors.length !== rowErrorsBefore) {
          return;
        }

        detailRecords.push([
          "D",
          "DIJ",
          description,
          date,
          reference,
          warehouse,
          formatCents(quantity),
          uom,
          formatCents(price),
          formatCents(total),
          selectedPeriod.formatted
        ]);
        totalAmount += total;
      } else if (reportType === "PJ" || reportType === "SJ") {
        // Purchase/Sales Journal: D, DPJ/DSJ, DATE, TIN, NAME, ADDR, DESC, REF_NO, GRS_AMT, TAX_BASE, VAT_EXE, VAT_ZERO, DISC_AMT, VAT_AMT, NET_AMT, RETRN_PERIOD
        const partyLabel = reportType === "SJ" ? "Customer" : "Vendor";
        const date = formatLedgerDate(source.date, "Date", rowNumber, errors, false);
        const tin = normalizeTin(source.tin, `${partyLabel} TIN`, errors, rowNumber);
        const name = cleanLedgerText(source.name, `${partyLabel} Name`, rowNumber, errors, true, 50);
        const address = cleanLedgerText(source.address, `${partyLabel} Address`, rowNumber, errors, false);
        const description = cleanLedgerText(source.description, "Description", rowNumber, errors, false);
        const reference = cleanLedgerText(source.reference, "Reference No.", rowNumber, errors, false);
        const grossAmount = parseAmount(source.grossAmount, "Gross Amount", errors, rowNumber, false);
        const taxBase = parseAmount(source.taxBase, "Vatable Amount", errors, rowNumber, false);
        const vatExempt = parseAmount(source.vatExempt, "VAT Exempt Amount", errors, rowNumber, false);
        const vatZero = parseAmount(source.vatZero, "Zero Rated Amount", errors, rowNumber, false);
        const discount = parseAmount(source.discount, "Discount Amount", errors, rowNumber, false);
        const vat = parseAmount(source.vat, "VAT Amount", errors, rowNumber, false);
        const net = parseAmount(source.net, "Net Amount", errors, rowNumber, false);

        if (errors.length !== rowErrorsBefore) {
          return;
        }

        const detailCode = reportType === "SJ" ? "DSJ" : "DPJ";
        detailRecords.push([
          "D",
          detailCode,
          date,
          tin,
          name,
          address,
          description,
          reference,
          formatCents(grossAmount),
          formatCents(taxBase),
          formatCents(vatExempt),
          formatCents(vatZero),
          formatCents(discount),
          formatCents(vat),
          formatCents(net),
          selectedPeriod.formatted
        ]);
        totalGross += grossAmount;
        totalTaxBase += taxBase;
        totalVatExe += vatExempt;
        totalVatZero += vatZero;
        totalDiscount += discount;
        totalVat += vat;
        totalNet += net;
      }
    });

    if (!detailRecords.length) {
      errors.push("No valid detail rows were found in the selected worksheet.");
    }
    if ([totalDebit, totalCredit, totalBal, totalAmount, totalDiscount, totalVat, totalWithholding, totalNet, totalGross, totalTaxBase, totalVatExe, totalVatZero]
      .some((total) => total > 9999999999999)) {
      errors.push("The report total exceeds the documented 11-digit amount limit.");
    }
    if (errors.length) {
      return { errors, filename: "", text: "", columns, missingColumns };
    }

    const formCode = {
      AT: "HAT",
      CRB: "HCRB",
      CMJ: "HCMJ",
      DMJ: "HDMJ",
      DJ: "HDJ",
      CDJ: "HDJ",
      GJ: "HGJB",
      GJB: "HGJB",
      GL: "HGLB",
      GLB: "HGLB",
      IJ: "HIJ",
      PJ: "HPJ",
      SJ: "HSJ"
    }[reportType];

    const header = ["H", formCode, agentTin, agentBranch, agentName, selectedPeriod.formatted, agentRdo];
    const records = [header, ...detailRecords];
    const recordLabel = detailRecords.length === 1 ? "record" : "records";
    let summary;

    if (reportType === "CRB") {
      records.push([
        "C",
        "CCRB",
        agentTin,
        agentBranch,
        selectedPeriod.formatted,
        formatCents(totalDebit),
        formatCents(totalCredit)
      ]);
      summary = `${detailRecords.length} detail ${recordLabel} · Total debit ${formatCents(totalDebit)} · Total credit ${formatCents(totalCredit)}`;
    } else if (reportType === "CMJ" || reportType === "DMJ") {
      const memoCode = reportType === "CMJ" ? "CMJ" : "DMJ";
      records.push([
        "C",
        `C${memoCode}`,
        agentTin,
        agentBranch,
        selectedPeriod.formatted,
        formatCents(totalAmount),
        formatCents(totalDiscount),
        formatCents(totalVat),
        formatCents(totalWithholding),
        formatCents(totalNet)
      ]);
      summary = `${detailRecords.length} detail ${recordLabel} · Total net sales ${formatCents(totalNet)}`;
    } else if (reportType === "DJ" || reportType === "CDJ") {
      records.push([
        "C",
        "CDJ",
        agentTin,
        agentBranch,
        selectedPeriod.formatted,
        formatCents(totalAmount),
        formatCents(totalDiscount),
        formatCents(totalVat),
        formatCents(totalWithholding),
        formatCents(totalNet)
      ]);
      summary = `${detailRecords.length} detail ${recordLabel} · Total debit ${formatCents(totalDebit)} · Total credit ${formatCents(totalCredit)}`;
    } else if (reportType === "GJ" || reportType === "GJB") {
      records.push([
        "C",
        "CGJB",
        agentTin,
        agentBranch,
        selectedPeriod.formatted,
        formatCents(totalDebit),
        formatCents(totalCredit)
      ]);
      summary = `${detailRecords.length} detail ${recordLabel} · Total debit ${formatCents(totalDebit)} · Total credit ${formatCents(totalCredit)}`;
    } else if (reportType === "GL" || reportType === "GLB") {
      records.push([
        "C",
        "CGLB",
        agentTin,
        agentBranch,
        selectedPeriod.formatted,
        formatCents(totalDebit),
        formatCents(totalCredit),
        formatCents(totalBal)
      ]);
      summary = `${detailRecords.length} detail ${recordLabel} · Total debit ${formatCents(totalDebit)} · Total credit ${formatCents(totalCredit)} · Total balance ${formatCents(totalBal)}`;
    } else if (reportType === "PJ") {
      records.push([
        "C",
        "CPJ",
        agentTin,
        agentBranch,
        selectedPeriod.formatted,
        formatCents(totalGross),
        formatCents(totalTaxBase),
        formatCents(totalVatExe),
        formatCents(totalVatZero),
        formatCents(totalDiscount),
        formatCents(totalVat),
        formatCents(totalNet)
      ]);
      summary = `${detailRecords.length} detail ${recordLabel} · Total net ${formatCents(totalNet)}`;
    } else if (reportType === "SJ") {
      records.push([
        "C",
        "CSJ",
        agentTin,
        agentBranch,
        selectedPeriod.formatted,
        formatCents(totalGross),
        formatCents(totalTaxBase),
        formatCents(totalVatExe),
        formatCents(totalVatZero),
        formatCents(totalDiscount),
        formatCents(totalVat),
        formatCents(totalNet)
      ]);
      summary = `${detailRecords.length} detail ${recordLabel} · Total net ${formatCents(totalNet)}`;
    } else if (reportType === "IJ") {
      summary = `${detailRecords.length} detail ${recordLabel} · Total amount ${formatCents(totalAmount)}`;
    } else {
      summary = `${detailRecords.length} audit trail ${recordLabel} · Total amount ${formatCents(totalAmount)}`;
    }

    const fileSuffix = {
      CDJ: "CDJ",
      DJ: "DJ",
      GJ: "GJ",
      GJB: "GJB",
      GL: "GL",
      GLB: "GLB"
    }[reportType] || reportType;

    return {
      errors: [],
      text: records.map((record) => record.join(",")).join("\r\n"),
      filename: `${agentTin}${agentBranch}${selectedPeriod.filename}${fileSuffix}.DAT`,
      columns,
      detailCount: detailRecords.length,
      totalDebit: formatCents(totalDebit),
      totalCredit: formatCents(totalCredit),
      totalAmount: formatCents(totalAmount),
      totalDiscount: formatCents(totalDiscount),
      totalVat: formatCents(totalVat),
      totalWithholding: formatCents(totalWithholding),
      totalNet: formatCents(totalNet),
      summary
    };
  }

  function buildDat({ headers, rows, rowNumbers = [], reportType, period, agent }) {
    const errors = [];
    const report = REPORTS[reportType];

    if (!report && !LEDGER_COLUMNS[reportType]) {
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

    if (LEDGER_COLUMNS[reportType]) {
      if (errors.length) {
        return { errors, filename: "", text: "" };
      }

      return buildLedgerDat({
        headers,
        rows,
        rowNumbers,
        reportType,
        selectedPeriod,
        agentTin,
        agentBranch,
        agentRdo,
        agentName
      });
    }

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
      summary: `${detailRows.length} detail ${detailRows.length === 1 ? "record" : "records"} · Total income ${formatCents(totalIncome)} · Total tax withheld ${formatCents(totalWithheld)}`,
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
    getMissingColumns,
    getRequiredColumns,
    normalizeHeader,
    parsePeriod
  };
});
