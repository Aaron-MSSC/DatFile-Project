# Excel to DAT Converter

A browser-based converter for the BIR withholding-tax alphalist DAT formats documented in `Documentation/Documentation.pdf`.

## Run locally

1. Install Node.js 18 or later.
2. Run `npm install`.
3. Run `npm start`.
4. Open `http://127.0.0.1:3000`.

The app reads `.xlsx` workbooks in the browser. Workbook contents are not uploaded or sent to a server.

## Supported report types

- **1600VT — MAP:** Monthly Alphalist of Payees.
- **1601EQ — QAP:** Quarterly Alphalist of Payees.

Choose the worksheet with the payee table and a header row using the documented columns: `Vendor TIN`, `Branch Code`, `Company Name`, `Last Name`, `First Name`, `Middle Name`, `ATC`, `Income Payment`, `Tax Rate`, and `Tax Amount`. `Nature of Income` is optional for MAP. The reporting month is selected in the form and written to every record.

The generated `.DAT` file is comma-delimited and contains the documented header, detail, and control records. Amounts are written without thousands separators, blank amount cells are written as zero, and special characters are removed from text fields. The filename follows `TIN + branch code + MMYYYY + report type + .DAT`.

Other report categories visible in the SAP Business One screenshots (such as Audit Trail and Books of Accounts) are not implemented by these two documented alphalist mappings.

## Tests

Run `npm test` for conversion-format and validation tests.
