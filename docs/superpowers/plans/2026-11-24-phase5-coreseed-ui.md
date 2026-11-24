# Phase 5 CoreSeed UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the converter to CoreSeed's look and add the pre-flight grid and the export center (Milestones Phase 5).

**Architecture:** Restyle in place. `index.html` gets a sidebar shell and a dark login, and keeps every existing ID. `styles.css` is rewritten on tokens. `app.js` remaps the wizard to 5 steps (form → upload → metadata → pre-flight → export). Pure logic goes in a new UMD `ui-helpers.js` with Node tests. The converter and server are untouched.

**Tech Stack:** Vanilla JS (UMD, as in `converter.js`), CSS custom properties, SheetJS (already vendored), `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-24-phase5-coreseed-ui-design.md`

## Global Constraints
- Do not modify `converter.js`, `source-adapters.js`, `sap-withholding.js`, `sap-connector.js`, `auth.js`, `audit.js` or `server.js`.
- Keep every existing element ID in `index.html`.
- No new npm dependencies; no external fonts, scripts or images.
- No payee TINs, names or row values in any network request or in the reconciliation summary.
- Generated DAT bytes and filenames must be identical to the baseline for the same inputs.
- No commits unless the user asks (the branch carries uncommitted work).

## Review Focus
- An error message without a `Row N:` prefix (missing columns, agent metadata) → goes to the general issues, never dropped. Test in Task 2.
- An error label that matches no column (e.g. "Enter a debit or credit amount") → the row is still flagged and the cell index is -1. Test in Task 2.
- A summary with no "Total …" segments → an empty totals list, not a crash. Test in Task 2.
- CSV values containing commas, quotes or newlines (file names) → quoted correctly. Test in Task 2.
- Leaving pre-flight twice in one visit → only one FAILED audit post. Covered by a visit flag in Task 4; checked manually in Task 5.

---

### Task 1: Baseline DAT snapshot
**Files:** Create `<scratchpad>/baseline.js` (outside the repo).
- [ ] Write a Node script that reads `test files/*.DAT`-matching sample workbooks and the converter test fixtures through `buildDat` and writes `{filename, sha256(text)}` per case to `<scratchpad>/baseline.json`.
- [ ] Run it before any edit. Expected: a JSON file with ≥ 1 case per report family (withholding, SAWT, BOA).

### Task 2: `ui-helpers.js` + tests
**Files:** Create `ui-helpers.js` and `test/ui-helpers.test.js`. Modify `index.html` (add `<script defer src="/ui-helpers.js">` before `app.js`).

**Produces** (global `DatUiHelpers` in the browser, `module.exports` in Node):
- `parseConverterErrors(errors: string[]) → { general: string[], rows: Map<number, {label: string|null, message: string}[]> }`, which parses the `/^Row (\d+): (.*)$/s` form.
- `resolveErrorField(message: string) → string|null`: the field key from the longest matching label prefix in `ERROR_LABEL_FIELDS` (the labels listed in the spec work, e.g. "Vendor TIN"→`tin`, "Branch Code"→`branch`, "Company Name"→`registeredName`, "ATC"→`atc`, "Income Payment"→`income`, "Tax Rate"→`rate`, "Tax Amount"→`withheld`, "Reporting Month"→`reportingMonth`, "Reporting Period"→`reportingPeriod`, the ledger labels → the `source.<field>` keys they read).
- `resolveErrorColumn(message, columns: object) → number` (−1 if unresolved).
- `extractTotals(summary: string) → {label: string, value: string}[]`, parsed from the `Total <label> <amount>` segments.
- `countNonBlankRows(rows: any[][]) → number`.
- `buildReconciliationRows(info) → [string, string][]`, where `info = {generatedAt, operator, reportType, reportTitle, period, sourceMode, sourceName, sheetName, filename, sourceRows, detailCount, summary, reconciliation}`. The last row is the "Not a BIR compliance certification" note.
- `toCsv(rows: string[][]) → string`: RFC 4180 quoting, CRLF line endings.

- [ ] Write the tests:
  - `parseConverterErrors(["Missing required Excel columns: ATC.", "Row 5: Vendor TIN must contain exactly 9 digits."])` → general length 1, `rows.get(5)[0].label === "Vendor TIN"`.
  - `resolveErrorField("Discount Amount must be a number")` → `"discount"`; `resolveErrorField("Enter a debit or credit amount.")` → `null`.
  - `resolveErrorColumn("Tax Amount must be …", {withheld: 7})` → 7.
  - `extractTotals("3 detail records · Total income 1,000.00 · Total tax withheld 20.00")` → two entries, the second `{label:"tax withheld", value:"20.00"}`; `extractTotals("")` → `[]`.
  - `toCsv([["a,b","x\"y"]])` → `"\"a,b\",\"x\"\"y\"\r\n"`.
  - `buildReconciliationRows` output contains no key named TIN/payee and ends with the certification note.
- [ ] Run `node --test test/ui-helpers.test.js`. Expected: FAIL (module missing).
- [ ] Implement it, then run `npm test`. Expected: all suites PASS.

### Task 3: Shell, login and view styling
**Files:** Modify `index.html`, `styles.css`, `auth-client.js`.
- [ ] Markup: `body.is-authenticated` toggles the `.app-shell` (aside sidebar + `.app-main` with top bar). The sidebar holds the logo SVG, the workspace card ("DAT File Converter · Standalone"), and nav groups (`data-nav-group`) containing the existing `nav-btn-*` buttons inside `#topbar-nav`. The user block holds `#account-status`, `#user-role-badge` and `#logout-button`. The top bar holds `#menu-toggle`, `#breadcrumb-current` and `#user-avatar`. The login becomes `.auth-screen` with `#auth-view` as the form panel plus a brand panel.
- [ ] `auth-client.js` (additive only): add `document.body.classList.add("is-authenticated")` in `setupUserSession`; set the initials in `#user-avatar`; in `switchView`, set the breadcrumb text from the nav button label and close the drawer; hide a `[data-nav-group]` whose buttons are all hidden; add the drawer toggle, backdrop and Esc handling.
- [ ] `styles.css`: tokens and the components from spec §5; admin/audit/exports/status restyle (§6.6); responsive breakpoints (§7); print rules (only `#reconciliation-print` when `body.printing-summary`).
- [ ] Manual check: log in as admin/standard/auditor; the nav groups and breadcrumb are correct; the drawer works below 1024 px.

### Task 4: Wizard — metadata merge, pre-flight, export center
**Files:** Modify `index.html`, `app.js`, `styles.css`.
- **Consumes:** all of Task 2's API.
- [ ] Markup: move the agent fields into stage 3 ("Metadata") and delete stage 4's section. Stage 4 = pre-flight: the `#preflight-cards` container; the grid toolbar (`#grid-filter` with all/errors, `#grid-pager`); `#preview-table` inside a sticky-header wrap; `#issues-list`; the existing `#column-status` kept as the reconciliation/notes line. Stage 5 = export center: it contains `#result-card` (IDs kept) plus `#export-facts`, `#download-summary-csv`, `#download-summary-xlsx`, `#print-summary` and the hidden `#reconciliation-print`. The step labels become: Select form / Upload & worksheet / Metadata / Pre-flight review / Export.
- [ ] `app.js`:
  - `advanceStep` validation for step 3 = period + all agent fields.
  - `showStep(4)` calls `runPreflight()`:
    - It builds `DatConverter.buildDat` with the current inputs.
    - For an SAP source with no errors, it adds the `DatSapWithholding.reconcileDat` problems as general errors.
    - It stores `preflight = {result, parsed, errorCount}` and renders the cards, the grid (50 rows/page, sticky row-number column, a row class `has-error`, a cell class `cell-error` with a `title`) and the issues (clicking one jumps to its page and row).
    - It disables `#convert-button` while `errorCount > 0`.
  - Re-run pre-flight on input change while on step 4.
  - The convert button lives on step 4. On success, `convertWorkbook` calls `showStep(5)` and fills the export facts. The existing auto-download, audit post and SAP guard stay.
  - Blocked-attempt audit: `preflightLogged` resets on entering step 4. On leaving step 4 (Back, nav switch away via a `dat:view-change` event that auth-client dispatches, or start over) with `errorCount > 0` and not yet logged, it posts FAILED with `details: "sourceMode=<mode>; preflight blocked"` and recordCounts only.
  - Summary downloads: CSV via `Blob(toCsv(rows))`; XLSX via `XLSX.utils.aoa_to_sheet` + `XLSX.writeFile`; PDF via filling `#reconciliation-print`, adding `body.printing-summary`, `window.print()`, then removing the class. The file base name is `<DAT filename without .DAT>-reconciliation`.
- [ ] Manual check: a clean sample reaches step 5 and the DAT downloads; a sample with a bad TIN shows the row and cell flagged, the counts match the issues list, and Generate is disabled.

### Task 5: Verification
- [ ] `npm test`. Expected: all PASS.
- [ ] Re-run the baseline script. Expected: hashes and filenames identical to `baseline.json`.
- [ ] Start `node server.js` and check the 1440/1024/820/390 px layouts, all four source modes, the role nav, the audit FAILED entry appearing once, and the CSV/XLSX contents containing no payee data.
- [ ] Update `Milestones.md` Phase 5 checkboxes to the verified state, and README if it documents the UI flow.
