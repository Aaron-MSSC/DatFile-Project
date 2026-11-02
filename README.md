# Excel to DAT Converter

A browser-based converter for the BIR DAT formats documented in `Documentation/Documentation.pdf` and the Audit Trail and Cash Receipt Book layouts supplied with the project.

## Run locally

1. Install Node.js 18 or later.
2. Run `npm install`.
3. Run `npm start`.
4. Open `http://127.0.0.1:3000`.

The app reads `.xlsx` workbooks in the browser. Workbook contents are not uploaded or sent to a server.

## Supported report types

- **1600VT — MAP:** Monthly Alphalist of Payees.
- **1601EQ — QAP:** Quarterly Alphalist of Payees.
- **AT — Audit Trail:** Header and detail records; the supplied layout specifies no control record.
- **CRB — Cash Receipt Book:** Header, detail, and debit/credit control totals.
- **CMJ — Credit Memo Journal:** Customer memo details and amount, discount, VAT, withholding, and net-sales control totals.
- **DMJ — Debit Memo Journal:** Vendor memo details and amount, discount, VAT, withholding, and net-sales control totals.

Choose the report type that matches the worksheet. MAP and QAP expect `Vendor TIN`, `Branch Code`, `Company Name`, `Last Name`, `First Name`, `Middle Name`, `ATC`, `Income Payment`, `Tax Rate`, and `Tax Amount`. `Nature of Income` is optional for MAP.

Audit Trail expects `Generated Date & Time`, `User Code`, `Username`, `Module`, `Activity`, `Reference No.`, and `Amount`. `Posting Date`, `Details`, and `Return Period` are optional; when present, the return period is checked against the selected period.

Cash Receipt Book expects `Date`, `Debit`, and `Credit`. `Customer Name`, `Reference No.`, `Journal Entry No.`, `Details`, `GL Account`, `GL Account Name`, and `Return Period` are optional; when present, the return period is checked against the selected period. Each row must contain a debit or credit amount.

Credit Memo Journal expects `Date`, `Customer TIN`, `Customer Name`, `Amount`, and `Net Sales`. `Customer Address`, `Description`, `Reference No.`, `Discount`, `VAT Amount`, `Withholding Amount`, and `Return Period` are optional; when present, the return period is checked against the selected period. Debit Memo Journal uses the same fields with `Vendor TIN`, `Vendor Name`, and `Vendor Address` instead.

The generated `.DAT` file is comma-delimited and contains the report's documented records. Amounts have two decimal places and no thousands separators; blank amount cells are written as zero, and special characters are removed from text fields. The filename follows `TIN + branch code + MMYYYY + report type + .DAT`.

## Tests

Run `npm test` for conversion-format and validation tests.
