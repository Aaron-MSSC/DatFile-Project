// Pure, DOM-free helpers for the converter UI (pre-flight grid, totals cards,
// reconciliation summary). They only read converter output; they never change
// conversion results and never compute DAT totals themselves.
(function (root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.DatUiHelpers = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // Error labels used by converter.js, mapped to the column keys its
  // `columns` result uses (findColumns / ledgerColumns).
  const ERROR_LABEL_FIELDS = [
    ["Vendor TIN", "tin"],
    ["Taxpayer Identification No.", "tin"],
    ["Branch Code", "branch"],
    ["Company Name", "registeredName"],
    ["Last Name", "lastName"],
    ["First Name", "firstName"],
    ["Middle Name", "middleName"],
    ["ATC", "atc"],
    ["Nature of Income", "nature"],
    ["Income Payment", "income"],
    ["Tax Rate", "rate"],
    ["Tax Amount", "withheld"],
    ["Reporting Month", "reportingMonth"],
    ["Reporting Period", "reportingPeriod"],
    ["Account", "account"],
    ["GL Account", "account"],
    ["GL Account Name", "accountName"],
    ["Activity", "action"],
    ["Check No.", "checkNo"],
    ["Customer Name", "customer"],
    ["Description", "description"],
    ["Item Description", "description"],
    ["Details", "details"],
    ["Document No.", "docNo"],
    ["Journal Entry No.", "journalEntry"],
    ["Module", "module"],
    ["Reference No.", "reference"],
    ["Supplier Name", "supplier"],
    ["Transaction No.", "transNo"],
    ["UOM", "uom"],
    ["User Code", "userCode"],
    ["Username", "username"],
    ["Warehouse", "warehouse"],
    ["Date", "date"],
    ["Generated Date & Time", "datetime"],
    ["Posting Date", "postingDate"],
    ["Amount", "amount"],
    ["Balance", "balance"],
    ["Credit", "credit"],
    ["Debit", "debit"],
    ["Discount", "discount"],
    ["Discount Amount", "discount"],
    ["Gross Amount", "grossAmount"],
    ["Net Amount", "net"],
    ["Net Sales", "net"],
    ["Price", "price"],
    ["Quantity", "quantity"],
    ["Vatable Amount", "taxBase"],
    ["Total", "total"],
    ["VAT Amount", "vat"],
    ["VAT Exempt Amount", "vatExempt"],
    ["Zero Rated Amount", "vatZero"],
    ["Withholding Amount", "withholding"]
  ].sort((left, right) => right[0].length - left[0].length);

  const SOURCE_MODE_LABELS = {
    "data-only": "Excel · Data only",
    "bir-report": "Excel · BIR report layout",
    "sql-json": "Data pull · SQL→JSON",
    "sap-pull": "Data pull · SAP Business One"
  };

  function matchLabel(message) {
    const text = String(message ?? "");
    for (const [label, field] of ERROR_LABEL_FIELDS) {
      if (text === label || text.startsWith(`${label} `)) {
        return { label, field };
      }
    }
    return null;
  }

  function parseConverterErrors(errors) {
    const list = Array.isArray(errors) ? errors : [];
    const general = [];
    const rows = new Map();
    for (const raw of list) {
      const text = String(raw ?? "");
      const match = /^Row (\d+): ([\s\S]*)$/.exec(text);
      if (!match) {
        general.push(text);
        continue;
      }
      const row = Number(match[1]);
      const message = match[2];
      const matched = matchLabel(message);
      if (!rows.has(row)) rows.set(row, []);
      rows.get(row).push({ label: matched ? matched.label : null, message });
    }
    return { general, rows, total: list.length };
  }

  function resolveErrorField(message) {
    const matched = matchLabel(message);
    return matched ? matched.field : null;
  }

  function resolveErrorColumn(message, columns) {
    const field = resolveErrorField(message);
    if (!field || !columns || typeof columns[field] !== "number") return -1;
    return columns[field] >= 0 ? columns[field] : -1;
  }

  function extractTotals(summary) {
    const totals = [];
    const pattern = /Total\s+([A-Za-z][A-Za-z ]*?)\s+(-?[\d,]+\.\d{2})/g;
    for (const match of String(summary ?? "").matchAll(pattern)) {
      totals.push({ label: match[1].trim(), value: match[2] });
    }
    return totals;
  }

  function countNonBlankRows(rows) {
    if (!Array.isArray(rows)) return 0;
    return rows.filter((row) =>
      Array.isArray(row) && row.some((value) => value !== null && value !== undefined && String(value).trim() !== "")
    ).length;
  }

  function buildReconciliationRows(info) {
    const data = info || {};
    const text = (value) => (value === null || value === undefined ? "" : String(value));
    const rows = [
      ["Generated at", text(data.generatedAt)],
      ["Operator", text(data.operator)],
      ["Report type", text(data.reportType)],
      ["Report title", text(data.reportTitle)],
      ["Return period", text(data.period)],
      ["Source mode", SOURCE_MODE_LABELS[data.sourceMode] || text(data.sourceMode)],
      ["Source", text(data.sourceName)],
      ["Worksheet / dataset", text(data.sheetName)],
      ["DAT filename", text(data.filename)],
      ["Source records (non-blank rows)", text(data.sourceRows)],
      ["DAT detail records", text(data.detailCount)]
    ];
    for (const total of extractTotals(data.summary)) {
      rows.push([`Total ${total.label}`, total.value]);
    }
    if (data.reconciliation) {
      rows.push(["Reconciliation", text(data.reconciliation)]);
    }
    rows.push([
      "Note",
      "Generated by the DAT File Converter for accounting documentation. This is not a BIR compliance certification; validate the DAT file with the official BIR validation module."
    ]);
    return rows;
  }

  function toCsv(rows) {
    const escape = (value) => {
      const text = value === null || value === undefined ? "" : String(value);
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
    };
    return (Array.isArray(rows) ? rows : [])
      .map((row) => row.map(escape).join(",") + "\r\n")
      .join("");
  }

  return {
    ERROR_LABEL_FIELDS,
    parseConverterErrors,
    resolveErrorField,
    resolveErrorColumn,
    extractTotals,
    countNonBlankRows,
    buildReconciliationRows,
    toCsv
  };
});
