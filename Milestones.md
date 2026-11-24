# Project Milestones: BIR Excel-to-DAT File Converter

This document outlines the phased roadmap, technical specifications, and milestones for the BIR Excel-to-DAT File Converter. It reflects completed capabilities, active developments, and planned enhancements aligned with official Bureau of Internal Revenue (BIR) specifications and [AGENTS.md](file:///c:/Users/MSSC/OneDrive%20-%20mseedsystems.com/Documents/GitHub/DatFile%20Project/AGENTS.md).

The converter is being delivered as a **feature of CoreSeed**. Alongside Excel upload, operators can manually pull source data from multiple Business Unit (BU) ERPs: SAP Business One, Microsoft Dynamics 365 Business Central, Oracle NetSuite, Odoo and others.

---

## Progress Overview

| Phase | Description | Status |
|---|---|---|
| **Phase 1** | Security, Identity & User Management | Completed (standalone; identity to be delegated to CoreSeed — see Phase 7) |
| **Phase 2** | Schema Structure & BIR Form Coverage | In Progress (VAT SAWT & BOA Complete; WHT/Final WHT Expanding) |
| **Phase 3** | Pre-Conversion Validation & Smart Normalization | Completed |
| **Phase 4** | Downloadable Excel Templates & Batch Engine | Planned |
| **Phase 5** | Adaptive UI & Operator Experience | Completed (official CoreSeed logo asset pending) |
| **Phase 6** | Data Reconciliation & BIR Compliance Verification | Planned |
| **Phase 7** | CoreSeed Integration & Multi-BU Data Connectors | Planned |

---

## Phase 1: Security, Identity & User Management

Enhance application access control and user management to safeguard taxpayer information and prevent unauthorized configuration changes.

*These items cover the standalone application only: local accounts, Argon2id hashing, recovery tokens and the admin user panel. As a CoreSeed feature, they are replaced by CoreSeed identity and role mapping (Phase 7.1).*

- [x] **Password Security Upgrade**
  - [x] Migrate credential hashing from `scrypt` to `Argon2id` with unique salt per user.
  - [x] Enforce strong password complexity rules (minimum 12 characters, mixed case, numbers, and symbols).
- [x] **Role-Based Access Control (RBAC)**
  - [x] Implement user roles: `Administrator`, `Standard User`, and `Auditor`.
  - [x] Restrict template editing, system configurations, and user management to Administrators.
- [x] **User & Admin Dashboards**
  - [x] Separate dashboard views for Standard Users (conversion workflow, recent exports) and Administrators.
  - [x] Admin management panel: view user list, enable/disable accounts, reset credentials, and view system status.
- [x] **Account Recovery & Lifecycle**
  - [x] Implement recovery-token validation/expiry and administrative password reset; production token delivery is superseded by CoreSeed identity in Phase 7.
  - [x] Session management enhancements (configurable timeout, forced invalidation on password change).
- [x] **Privacy & Audit Logging**
  - [x] Maintain an audit trail of conversion activities (timestamp, user ID, report type, record counts, control totals).
  - [x] Ensure taxpayer identification numbers and sensitive personal data are never logged to console or disk.

---

## Phase 2: Schema Structure & BIR Form / Report Coverage

Implement and verify exact BIR data structures, file formats (.DAT), and field mappings.

### 2.1 Final Withholding Tax (Final WHT)
- [ ] **0619-F**: Monthly Remittance Return of Final Income Taxes Withheld.
  - [x] SQL-result JSON contract exposed for browser and server consumers.
  - [ ] DAT record layout pending official field-level specification and accepted reference file.
- [ ] **1601-FQ**: Quarterly Remittance Return of Final Income Taxes Withheld.
- [ ] **EWT 2306**: Certificate of Final Tax Withheld At Source (data extraction and attachment generation).

### 2.2 Expanded Withholding Tax (WHT)
- [ ] **0619-E**: Monthly Remittance Form of Creditable Income Taxes Withheld.
- [ ] **1601-EQ**: Quarterly Remittance Return of Creditable Income Taxes Withheld.
  - [x] QAP (Quarterly Alphalist of Payees) DAT detail and control record generation.
  - [ ] Integration of complete 1601-EQ return schema with payment/remittance data.
- [ ] **EWT 2307**: Certificate of Creditable Tax Withheld At Source:
  - [ ] EWT 2307 Monthly consolidation.
  - [ ] EWT 2307 Quarterly consolidation.
  - [ ] EWT 2307 Per-Transaction granularity.

### 2.3 Value-Added Tax (VAT) - SAWT
- [x] **2550M**: Monthly Value-Added Tax Declaration (SAWT 2550M) — *Completed with 10-field header, 15-field detail, 7-field control structure*.
- [x] **2550Q**: Quarterly Value-Added Tax Return (SAWT 2550Q) — *Completed with multi-detail summation and control totals*.

### 2.4 BIR Reports / SLSP (Summary List of Sales and Purchases)
- [ ] **Input VAT Summary / Purchase Transactions** (`SLSP Purchases`):
  - Segregation of Taxable Purchases, Exempt Purchases, Zero-Rated Purchases, Capital Goods, and Goods Other Than Capital Goods.
  - Supplier TIN, branch, name, address, and VAT amounts.
- [ ] **Output VAT Summary / Sales Transactions** (`SLSP Sales`):
  - Segregation of Taxable Sales, Exempt Sales, and Zero-Rated Sales.
  - Customer TIN, branch, registered name, and output VAT.
- [ ] **Sales Report**: Transaction-level sales reconciliation report.
- [ ] **Purchase Report**: Transaction-level purchase reconciliation report.

### 2.5 Books of Accounts (BOA)
- [x] **AT — Audit Trail**: Header and detail record formatting.
- [x] **CRB — Cash Receipt Book**: Debit/credit balancing and control records.
- [x] **DJ — Disbursement Journal**: Supplier disbursements, check numbers, and CDJ controls.
- [x] **CMJ — Credit Memo Journal**: Customer credit memo details and control totals.
- [x] **DMJ — Debit Memo Journal**: Vendor debit memo details and control totals.
- [x] **GJ — General Journal Book**: Journal entries with reference numbers and control totals.
- [x] **GL — General Ledger Book**: Account movements, debit/credit entries, and balances.
- [x] **IJ — Inventory Journal**: Inventory movements, warehouse codes, quantities, and totals.
- [x] **PJ — Purchase Journal**: Vendor purchases with VAT breakdown and CPJ controls.
- [x] **SJ — Sales Journal**: Customer sales with VAT breakdown and CSJ controls.

---

## Phase 3: Pre-Conversion Validation & Smart Normalization Engine

Guarantee input data integrity prior to DAT generation to eliminate malformed filings.

- [x] **Tax Identifier & Identity Validation**
  - [x] Strict 9-digit TIN format verification + 3 to 4-digit branch code validation (no blind zero padding).
  - [x] 3-digit RDO code verification.
  - [x] Name cleansing: remove invalid special characters while preserving registered legal business names.
  - [x] Enforce field length limits (e.g., 30 characters for SAWT individual name parts, 50 characters for entity names).
- [x] **ATC & Tax Rate Cross-Validation**
  - [x] Built-in validation reference generated from the BIR DAT validator [regatc.dbf](file:///c:/Users/MSSC/OneDrive%20-%20mseedsystems.com/Documents/GitHub/DatFile%20Project/Documentation/regatc.dbf), including 521 unique ATC codes and their validator tax/form metadata.
  - [x] Verification that assigned ATC codes exist in the authoritative validator reference. Tax-rate cross-validation remains dependent on an official ATC/rate source because `regatc.dbf` does not contain tax-rate values.
- [x] **Date & Period Normalization**
  - [x] Support flexible input date formats (`MM/DD/YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD`, and Excel serial dates).
  - [x] Validate reporting periods against the selected reporting month and tax quarter.
- [x] **Intelligent Column Mapping**
  - [x] Extended synonym dictionary for ERP exports (SAP Business One, Oracle NetSuite, Microsoft Dynamics, QuickBooks).
  - [x] Fuzzy matching for common column variations with user-confirmation prompts for ambiguous fields.

---

## Phase 4: Downloadable Excel Templates & Batch Processing Engine

Provide standard inputs and multi-file processing efficiency for accounting teams.

- [ ] **Downloadable Official Excel Templates**
  - [ ] Provide ready-to-use `.xlsx` templates for each supported form (1601-EQ, 2550M, 2550Q, 2307, SLSP, BOA).
  - [ ] Embed Excel data validation (dropdowns for ATC codes, text format enforcement for TINs/Branches).
  - [ ] Include clear sample rows, required header indicators, and instructions tab.
- [x] **Selectable Source Mode** (wizard step 2)
  - [x] Excel data-only mode (existing header/alias matching).
  - [x] Excel BIR report-layout mode for formatted MAP / QAP / SAWT alphalists, with Grand Total reconciliation and agent pre-fill.
  - [ ] Confirm the rule for individual payee names printed in the combined "INDIVIDUAL (Last Name, First Name, Middle Name)" column (currently blocked, not split).
  - [ ] Obtain a QAP export whose headings line up with its data columns (the sample `QAP.xlsx` has 12 data columns under 9 headings and is refused).
- [ ] **Batch Conversion Engine**
  - [ ] Multi-file queue for batch processing across different branches or reporting periods.
  - [ ] Multi-sheet workbook processing (convert multiple periods or schedules from a single workbook).
  - [ ] Batch conversion dashboard displaying per-file conversion status, row counts, and specific error reports.

---

## Phase 5: Adaptive UI & Modern Operator Experience

Create a responsive, user-friendly interface based on reference designs (`reference/image.png`, `reference/image.jpg`). Design: `docs/superpowers/specs/2026-11-24-phase5-coreseed-ui-design.md`.

- [x] **Adaptive Responsive Layout**
  - [x] Modern CoreSeed-style layout (sidebar, breadcrumb top bar, dark sign-in) responsive across desktop, laptop and tablet displays, with a drawer below 1024 px. Checked at 1440, 1024, 820 and 390 px.
  - [x] Multi-step conversion wizard: Select form -> Upload & worksheet -> Metadata -> Pre-flight review -> Export. *Form selection stays first because the SAP pull and BIR report-layout modes need the form before reading data.*
  - [ ] Replace the placeholder leaf mark with the official CoreSeed logo asset.
- [x] **Interactive Pre-Conversion Data Grid**
  - [x] Full worksheet grid (50 rows per page, errors-only filter) with inline error highlighting of rows and cells, and an Issues list that jumps to the row.
    - [ ] Cell highlighting for the Books of Accounts labels `Customer TIN`, `Vendor Name` and `Customer/Vendor Address`, and `Customer Name` in CMJ/SJ. These rows are flagged, but no cell is marked yet.
  - [x] Summary cards: Total Rows, Valid Records, Errors Flagged, and the report's own control totals (Total Tax Base / Tax Withheld for withholding and SAWT reports; debit/credit, net or amount for Books of Accounts). Totals show only when there are no errors.
  - [x] Generate stays disabled until pre-flight is clean. Leaving pre-flight with errors records one `FAILED` audit entry per visit.
- [x] **Export & Delivery Center**
  - [x] DAT file download using the BIR filename rule (`<TIN><Branch><MMYYYY><Form>.DAT`), with file facts (records, size, CRLF).
  - [x] One-click reconciliation summary as CSV, Excel, or PDF (print dialog), with no payee data.

---

## Phase 6: Data Reconciliation & Official BIR Verification

Ensure absolute mathematical consistency and compliance with BIR filing utilities.

- [ ] **Automated Source-to-DAT Reconciliation**
  - [ ] Reconcile record counts: Source Excel rows = Detail DAT lines = Control Record count.
  - [ ] Reconcile control totals: Sum of Detail amounts = Control Record total (Tax Base, Tax Withheld, Net Sales).
  - [ ] Strict blocking: Prevent file generation if discrepancies exist between detail rows and control records.
- [ ] **Compliance Verification with BIR Validators**
  - [ ] Automated regression testing against accepted DAT reference files.
  - [ ] Integration validation with official BIR testing utilities:
    - *Alphalist Data Entry and Validation (v7.4)* for 1600VT, 1601EQ, 2550M, 2550Q.
    - *BIR RELIEF System* for SLSP Sales and Purchases.
- [ ] **Versioned BIR Layout Profiles**
  - [ ] Support format profiles for legacy vs. amended BIR layouts (e.g., TRAIN law and EOPT amendments).
  - [ ] Regression test fixtures for each supported layout version.

---

## Phase 7: CoreSeed Integration & Multi-BU Data Connectors

The converter runs as a feature of CoreSeed, which provides hosting, identity and access control. Source data comes from either an Excel upload or a manual, operator-initiated pull from a configured Business Unit (BU) connection. Both paths feed the same validation, DAT generation and reconciliation engine.

### 7.1 CoreSeed Feature Integration
- [ ] Package the converter as a CoreSeed module or feature: route, navigation entry, and shared layout and styling.
- [ ] Delegate authentication and sessions to CoreSeed. Map CoreSeed roles to converter permissions (`Administrator`, `Standard User`, `Auditor`). In CoreSeed mode, retire local `data/users.json` accounts, self-registration and the recovery-token flow.
- [ ] Write conversion audit records to CoreSeed's audit store, still excluding taxpayer identifiers and source-row data.
- [ ] Store audit records, BU connection configurations and generated-DAT history in CoreSeed's persistent storage. This replaces the earlier standalone PostgreSQL plan.
- [ ] Add a Doc Control No. to generated outputs and reconciliation reports.
- [ ] Prepare wireframes for the workflow embedded in CoreSeed, including the client-facing UI.

### 7.2 Multi-BU Connector Framework
- [ ] **Connector registry**: Administrators manage one connection per BU or client (ERP type, company database, endpoint, credential reference). Credentials are kept in CoreSeed secret storage, never in source code or logs.
- [ ] **Common connector contract**: every connector returns records using the converter's canonical field names, the same keys the Excel column mapping produces. Existing validation and DAT generation (`buildDat`) are reused unchanged.
  - [x] First adapter: SQL→JSON result import (`source-adapters.js`), with schema validation and `pending-approval` mapping profiles.
  - [ ] Approve mapping profiles (candidates: 1601FQ → 1601EQ, 0619F → 1601EQ). Define sources for payee branch codes and individual Last/First/Middle names, which the SQL results do not provide.
- [ ] **Per-ERP field-mapping profiles** (e.g., ERP tax code → BIR ATC), maintained as approved mapping documents. Unmapped fields are flagged for review, never guessed (AGENTS.md §4).
- [ ] Planned connectors:
  - [ ] SAP Business One (see 7.3).
  - [ ] Microsoft Dynamics 365 Business Central.
  - [ ] Oracle NetSuite.
  - [ ] Odoo.

### 7.3 SAP Business One via the BIR API Integration Project
- [ ] The DAT File project pulls SAP B1 data through the BIR API Integration service (`SAPB1-EIS-API`), which reads the SAP Service Layer. The converter never calls SAP directly.
- [ ] Required additions in the BIR API Integration project:
  - [x] Period / date-range document listing endpoints: `GET /api/v2/withholding-tax/documents?source=…&from=…&to=…` (by `DocDate`, max 92 days, follows Service Layer paging, all-or-nothing with a 10,000-document cap) and `GET /api/v2/withholding-tax/codes` (WTCode → `OfficialCode`).
  - [ ] Withholding-tax extraction (withholding-tax lines, business partner TIN and branch, withholding-tax code):
    - [x] from AP invoices and AP credit memos (invoice-category withholding) for 1601-EQ;
    - [x] from AR invoices and AR credit memos for SAWT 2550M and 2550Q;
    - [ ] from outgoing and incoming payments (payment-category withholding codes). These lines are currently flagged and block conversion;
    - [ ] 1600VT and 0619-E report mappings.
  - [ ] Document and journal feeds for Books of Accounts and SLSP.
- [x] Service-to-service authentication: the converter obtains a JWT with the `documents.read` scope through the OAuth 2.0 client-credentials grant, over HTTPS only (`sap-connector.js`, `SAP_BIR_API_*` settings).
- [x] Converter side: SAP pull source mode with document review and exclusion, consolidation per payee TIN, branch, ATC and rate with credit memos netted, source-to-DAT reconciliation before download, and `SAP_PULL` audit records (`sap-withholding.js`, `/api/connectors/sap/*`).
- [ ] Approve the `SAPB1-WTAX-to-1601EQ`, `-2550M` and `-2550Q` mapping profiles (currently `pending-approval`; conversion is refused until they are approved).
- [ ] Confirm the SAP withholding-tax code → BIR ATC mapping (`OfficialCode` assumed), and where individual payees' last, first and middle names come from (standard SAP B1 provides only `CardName`).
- [ ] Confirm the Service Layer field names against the client's SAP version (`WithholdingTaxDataCollection`, `OfficialCode`, `BPL_IDAssignedToInvoice`, `Cancelled`), how cancelled documents should be reported, the fiscal calendar (quarters are calendar quarters), and that local currency is PHP.
- [ ] Verify against a live or UAT SAP company, then against the BIR Alphalist Data Entry and Validation module.
- *Decision:* the data flow is a **manual pull initiated from the DAT File project**. No SAP add-on will push documents to the converter.

### 7.4 Manual Pull Workflow (Operator-Initiated)
- [ ] Guided pull steps:
  1. Choose the BU connection.
  2. Choose the BIR form or report and the reporting month or quarter.
  3. Review the retrieved source documents and select or exclude individual documents.
  4. Inspect the payload in the preview grid, with existing pre-conversion validation and inline errors.
  5. Generate the DAT file and the reconciliation summary.
- [ ] No automatic or scheduled pulls. Every pull is started by a user and audited: who, when, connection, form, period and record counts, with no taxpayer data.
- [ ] Treat pulled data as read-only source. Record each document's source identity (company database, object type, `DocEntry`, source hash) for reconciliation back to the ERP.

### 7.5 Security & Verification
- [ ] Keep secrets outside source control, rotate credentials, and prevent secrets or taxpayer data from entering logs or diagnostics.
- [ ] Apply CSRF and Origin validation to state-changing endpoints, rate limits to sensitive endpoints, and appropriate security headers.
- [ ] Establish dependency vulnerability scanning, supported Node.js runtime updates, patching, and an incident-response process.
- [ ] Test CoreSeed role mapping and access boundaries, including disabled users and role changes.
- [ ] Test connector failures: authentication errors and an unavailable ERP or BIR API service must produce meaningful error messages, with no partial DAT output.
- [ ] Reconcile every pull: selected source documents = DAT detail records = control record count.
- [ ] Run regression tests on the Excel-upload path so that existing conversions keep working.
