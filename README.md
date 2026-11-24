# Excel to DAT Converter

A browser-based converter for the BIR DAT formats documented in `Documentation/Documentation.pdf` and the Books of Accounts layouts supplied with the project.

## Run locally

1. Install Node.js 18 or later.
2. Run `npm install`.
3. Run `npm start`.
4. Open `http://127.0.0.1:3000`.

## Accounts

Create an account with your name, email address, and a password of at least 12 characters, then sign in to use the converter. Account records are stored in `data/users.json` with scrypt password hashes; the `data` directory is excluded from Git. Sign-in sessions expire after 8 hours and are cleared when the server restarts. Set `DAT_AUTH_FILE` to choose another account-file location.

The included server binds to localhost. If you expose it beyond your machine, use HTTPS and a production-ready persistent session store.

The app reads `.xlsx` workbooks and SQL→JSON result files in the browser. File contents are not uploaded or sent to a server.

## Conversion workflow

The interface follows the CoreSeed look (sidebar navigation, breadcrumb top bar, stat cards). The converter is a five-step wizard:

1. **Select form**: choose the BIR report or book of accounts.
2. **Upload & worksheet**: choose the source mode and file (or pull from SAP) and the worksheet.
3. **Metadata**: the return period and the withholding agent's TIN, branch, RDO and registered name.
4. **Pre-flight review**: a dry run of the same `buildDat` call that conversion uses. Summary cards show total rows, valid records, errors flagged and control totals. Control totals appear only once there are no errors. The data grid shows every row, 50 per page, with error rows and cells highlighted. The Issues list shows every error; click an issue to jump to its row. **Generate DAT file** stays disabled while any error remains. Leaving this step with errors still flagged writes one `FAILED` audit entry per visit (counts only, `details: preflight blocked`).
5. **Export**: the DAT file, named `<TIN><Branch><MMYYYY><Form>.DAT`, plus a reconciliation summary as CSV, Excel, or PDF (via the browser's print dialog). The summary holds record counts, control totals and file details only, with no payee data. It is not a BIR compliance certification.

Display-only helpers (error parsing, totals extraction, summary rows) live in `ui-helpers.js` and do not change conversion output.

## Source modes

Step 2 of the wizard lets the operator choose how the source data is supplied. All four modes produce the same canonical rows and go through the same validation and DAT generation (`buildDat`).

| Mode | File | Reports | Notes |
| --- | --- | --- | --- |
| **Excel · Data only** (default) | `.xlsx` | All | One header row, then data rows. Columns are matched by heading name and aliases. |
| **Excel · BIR report layout** | `.xlsx` | MAP (1600VT), QAP (1601EQ), SAWT (2550M/2550Q) | Formatted alphalist with title rows, numbered column headings, Grand Total and footer. |
| **Data pull · SQL→JSON** | `.json` | Only where an approved mapping profile exists | The `{ formType, details }` result from `Documentation/SQL_to_JSON`. No live database connection is made. |
| **Data pull · SAP Business One** | none (server pull) | 1601EQ, 2550M, 2550Q, once the SAP mapping profile is approved | Operator-initiated pull through the BIR API Integration service (`SAPB1-EIS-API`). |

### Excel workbook requirements (data-only mode)

Upload an `.xlsx` workbook in data-only form: use one header row followed by the report data rows. Do not include report titles, summaries, subtotals, or other non-data rows in the worksheet. Cell formatting is fine; the converter reads cell values. The first non-empty row is treated as the header row, so make sure it contains the column names expected for the selected report.

### BIR report layout mode

`DatConverter.extractReportLayout` reads the printed alphalist layout used by the samples in `Documentation/BIR/BIR REPORTS`:

- The header row is the first row that names all of these headings (the `(n)` column numbers and dash rules are ignored): Taxpayer Identification No., Corporation (Registered Name), Individual (Last Name, First Name, Middle Name), ATC Code, Amount of Income Payment, Tax Rate and Amount of Tax Withheld. Merged heading cells are supported.
- Detail rows run from below the header to the first `Grand Total`, `END OF REPORT` or `Printed:` row. Blank rows are ignored and counted; footer rows are not treated as data.
- The withholding agent TIN, branch and name in the title block pre-fill the Metadata step (step 3). The operator still confirms them, and values already typed are never overwritten.
- The detail income and tax withheld totals must equal the report's Grand Total, or conversion is blocked.
- Conversion is blocked, never guessed, when:
  - a TIN is not in the form `XXX-XXX-XXX-BBB(B)` (9-digit TIN plus a 3–4 digit branch code), or has no branch suffix;
  - an Individual payee name is present (the single combined column is not split into Last, First and Middle names; use data-only mode with separate name columns);
  - a row has neither a corporation nor an individual name;
  - detail values sit in columns that have no heading, which means the headings do not line up with the data.

### SQL→JSON data pull mode

`source-adapters.js` (`DatSourceAdapters`) validates the uploaded JSON against the matching schema (0619F, 1601FQ, 2306, 2550M or 2550Q) and maps `details[]` to canonical fields through a mapping profile. `docmonth`/`docyear` are checked against the selected period by the existing reporting-month validation. Branch codes are taken only from a TIN written with a branch suffix. Missing branch codes and individual payee names are reported as errors, never defaulted.

**All shipped mapping profiles are `pending-approval`.** The JSON can be loaded and previewed, but conversion is refused until an approved mapping document confirms the profile (see `MAPPING_PROFILES` in `source-adapters.js`). The current candidates are 1601FQ → 1601EQ and 0619F → 1601EQ, based on the README withholding mapping table in `Documentation/SQL_to_JSON`. No profile exists for 2306, 2550M or 2550Q.

The audit trail records the source mode (`details: "sourceMode=..."`) with no taxpayer data.

### SAP Business One pull mode (Milestone 7.3)

The converter never calls SAP directly. The server (`sap-connector.js`) gets an OAuth 2.0 client-credentials token with the `documents.read` scope and calls the BIR API Integration service (`SAPB1-EIS-API`) over HTTPS:

- `GET /api/v2/withholding-tax/documents?source=…&from=YYYY-MM-DD&to=YYYY-MM-DD` lists documents dated in the range (by `DocDate`, at most 92 days) that carry withholding-tax lines. `source` is `purchase-invoices`, `purchase-credit-memos`, `sales-invoices` or `sales-credit-memos`.
- `GET /api/v2/withholding-tax/codes` lists withholding-tax codes with their `OfficialCode` (BIR ATC).

| Report | SAP documents | Period pulled |
| --- | --- | --- |
| 1601EQ (QAP) | AP invoices and AP credit memos | Calendar quarter of the selected month |
| 2550M (SAWT) | AR invoices and AR credit memos | Selected month |
| 2550Q (SAWT) | AR invoices and AR credit memos | Calendar quarter of the selected month |

Workflow: choose the report (step 1), choose **Data pull · SAP Business One** and the reporting month, then **Pull from SAP** (step 2). Review the retrieved documents, untick any to exclude, and continue. The pull fills in the period in the Metadata step (step 3).

`sap-withholding.js` (`DatSapWithholding`) consolidates withholding-tax lines into one row per payee TIN, branch, ATC and rate, and subtracts credit memos. It blocks conversion and names the SAP document when any of these is true:

- a TIN or branch code is missing;
- a withholding code has no Official Code;
- an amount or rate is missing;
- a document is cancelled or dated outside the period;
- withholding is payment-category;
- one TIN has several business-partner names;
- a payee's credit memos exceed its invoices.

Groups that net to zero are listed in the notes and not written. After `buildDat`, the DAT detail count and control totals are reconciled against the SAP lines; on a mismatch, no file is downloaded.

**All shipped SAP mapping profiles are `pending-approval`**, so documents can be pulled, reviewed and previewed, but conversion is refused until the mapping is confirmed (see `MAPPING_PROFILES` in `sap-withholding.js`).

Every pull is audited as `SAP_PULL`. The record holds the user, report, period, connection name and document counts, and contains no taxpayer data. A pull is all-or-nothing: if any source fails, nothing is loaded.

Server configuration (environment variables; never commit them):

| Variable | Purpose |
| --- | --- |
| `SAP_BIR_API_BASE_URL` | HTTPS base URL of the BIR API Integration service |
| `SAP_BIR_API_TOKEN_URL` | HTTPS OAuth 2.0 token endpoint |
| `SAP_BIR_API_CLIENT_ID` / `SAP_BIR_API_CLIENT_SECRET` | Client credentials |
| `SAP_BIR_API_SCOPE` | Optional, default `documents.read` |
| `SAP_BIR_API_AUDIENCE` | Optional, if the identity provider requires it |
| `SAP_BIR_API_CONNECTION` | Optional BU label shown to operators and in the audit trail |
| `SAP_BIR_API_DEV_NO_AUTH=1` | Testing only: skips the token request, so no token URL, client id or client secret is needed, for a pre-production service that does not yet validate tokens. Refused when `NODE_ENV=production`. In this mode a loopback base URL may use plain HTTP (e.g. `http://localhost:5234`, a Development-mode EIS API). If the service uses the .NET dev certificate, set `NODE_EXTRA_CA_CERTS` to it. |

For testing, put these in a `.env` file (git-ignored) and run `npm run start:dev`.

## Supported report types

### Withholding Tax
- **1600VT — MAP:** Monthly Alphalist of Payees.
- **1601EQ — QAP:** Quarterly Alphalist of Payees.

### Value-Added Tax (VAT)
- **2550M — SAWT:** Monthly Value-Added Tax Declaration Summary Alphalist of Withholding Taxes.
- **2550Q — SAWT:** Quarterly Value-Added Tax Return Summary Alphalist of Withholding Taxes.

### Books of Accounts
- **AT — Audit Trail:** Header and detail records; the supplied layout specifies no control record.
- **CRB — Cash Receipt Book:** Header, detail, and debit/credit control totals.
- **DJ — Disbursement Journal:** Supplier disbursement details, check numbers, G/L accounts, debit/credit entries, and CDJ control totals.
- **CMJ — Credit Memo Journal:** Customer memo details and amount, discount, VAT, withholding, and net-sales control totals.
- **DMJ — Debit Memo Journal:** Vendor memo details and amount, discount, VAT, withholding, and net-sales control totals.
- **GJ — General Journal Book:** General journal entries with reference numbers, descriptions, account codes, and debit/credit control totals.
- **GL — General Ledger Book:** Account ledger movements with document numbers, transaction numbers, descriptions, debit, credit, balance, and control totals.
- **IJ — Inventory Journal:** Item descriptions, dates, warehouse codes, quantities, units of measure, unit prices, and totals; the specification defines no control record.
- **PJ — Purchase Journal:** Vendor purchase details with VAT breakdown and control totals.
- **SJ — Sales Journal:** Customer sales details with VAT breakdown and control totals.

## Expected Worksheet Columns

Choose the report type that matches the worksheet:

- **MAP, QAP, and SAWT (2550M, 2550Q)** expect `Vendor TIN` (or `Taxpayer Identification No.`), `Branch Code`, `Company Name` (or `Corporation Registered Name`), `Last Name`, `First Name`, `Middle Name`, `ATC`, `Income Payment` (or `Amount of Income Payment`), `Tax Rate`, and `Tax Amount` (or `Amount of Tax Withheld`). `Nature of Income` is optional; when present, it is mapped to the DAT detail record.

- **Audit Trail** expects `Generated Date & Time`, `User Code`, `Username`, `Module`, `Activity`, `Reference No.`, and `Amount`. `Posting Date`, `Details`, and `Return Period` are optional; when present, the return period is checked against the selected period.

- **Cash Receipt Book** expects `Date`, `Debit`, and `Credit`. `Customer Name`, `Reference No.`, `Journal Entry No.`, `Details`, `GL Account`, `GL Account Name`, and `Return Period` are optional; when present, the return period is checked against the selected period. Each row must contain a debit or credit amount.

- **Disbursement Journal** expects `Date`, `Debit`, and `Credit` (or `Amount`). `Supplier Name`, `Reference No.', `Journal Entry No.`, `Check No.`, `Details`, `GL Account`, `GL Account Name`, `Discount`, `VAT Amount`, `Withholding Amount`, `Net Sales`, and `Return Period` are optional; when present, the return period is checked against the selected period. Each row must contain a debit, credit, or amount value.

- **Credit Memo Journal** expects `Date`, `Customer TIN`, `Customer Name`, `Amount`, and `Net Sales`. `Customer Address`, `Description`, `Reference No.`, `Discount`, `VAT Amount`, `Withholding Amount`, and `Return Period` are optional; when present, the return period is checked against the selected period. 

- **Debit Memo Journal** uses the same fields as Credit Memo Journal with `Vendor TIN`, `Vendor Name`, and `Vendor Address` instead.

- **General Journal Book** expects `Date`, `Debit`, and `Credit`. `Reference No.`, `Description`, `Account`, and `Return Period` are optional; when present, the return period is checked against the selected period. Each row must contain a debit or credit amount.

- **General Ledger Book** expects `Date`, `Debit`, and `Credit`. `Document No.`, `Transaction No.`, `Description`, `Balance`, and `Return Period` are optional; when present, the return period is checked against the selected period. Each row must contain a debit or credit amount.

- **Inventory Journal** expects `Item Description`, `Date`, `Quantity`, and `Total`. `Reference No.`, `Warehouse`, `UOM`, `Unit Price`, and `Return Period` are optional; when present, the return period is checked against the selected period.

- **Purchase Journal** expects `Date`, `Vendor TIN`, `Vendor Name`, `Gross Amount`, and `Net Amount`. `Vendor Address`, `Description`, `Reference No.`, `Vatable Amount`, `VAT Exempt Amount`, `Zero Rated Amount`, `Discount Amount`, `VAT Amount`, and `Return Period` provide the remaining transaction details; when `Return Period` is present, it is checked against the selected period.

- **Sales Journal** expects `Date`, `Customer TIN`, `Customer Name`, `Gross Amount`, and `Net Amount`. `Customer Address`, `Description`, `Reference No.`, `Vatable Amount`, `VAT Exempt Amount`, `Zero Rated Amount`, `Discount Amount`, `VAT Amount`, and `Return Period` provide the remaining transaction details; when `Return Period` is present, it is checked against the selected period.

## DAT File Format

The generated `.DAT` file is comma-delimited and contains the report's documented records. Amounts have two decimal places and no thousands separators; blank amount cells are written as zero, and special characters are removed from text fields. The filename follows `TIN + branch code + MMYYYY + report type + .DAT`.

TINs must contain exactly 9 digits, branch codes 3 or 4 digits, and RDO codes exactly 3 digits. The converter validates these identifiers without adding leading zeros; preserve leading zeros in Excel by storing identifiers as text.

## Pre-Conversion Validation

- Text fields are ASCII-cleaned and checked against documented length limits.
- ATC codes are validated against the 521 unique codes embedded from the BIR DAT validator's `Documentation/regatc.dbf` reference. Unknown codes block conversion.
- Reporting dates support `MM/DD/YYYY`, day-first `DD/MM/YYYY`, `YYYY-MM-DD`, and Excel serial dates. Quarterly reports validate source periods against the selected tax quarter.
- ERP-style column headings use extended aliases and fuzzy-match suggestions. Ambiguous matches require operator confirmation in the browser before conversion.

## SQL-to-JSON Schemas

The application exposes the supplied 0619-F SQL-result contract through `DatConverter.getJsonSchema("0619F")` and `/schemas/0619F.schema.json`. This is an application integration schema only: it does not add a verified 0619-F DAT layout or file-generation behavior. DAT generation for 0619-F remains blocked until an official field-level layout and accepted reference file are available.

## Tests

Run `npm test` for conversion-format, validation, and account-flow tests.
