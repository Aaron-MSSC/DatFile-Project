# Phase 5 — CoreSeed UI & Operator Experience: Design

Date: 2026-11-24 · Branch: `xlxs-data-only` · Milestone: Phase 5 in `Milestones.md`

## 1. Intent

The DAT converter is being delivered as a feature of CoreSeed (Milestones Phase 7). Phase 5 gives it CoreSeed's look so that it reads as part of the same product, and it delivers the three Phase 5 milestone items:

1. Adaptive, responsive layout with a multi-step conversion wizard.
2. Interactive pre-conversion data grid with inline error highlighting and summary cards.
3. Export & delivery center: DAT download with the BIR filename, plus a downloadable reconciliation summary.

The reference designs are `reference/image.jpg` (login) and `reference/image.png` (app shell / dashboard).

## 2. Goals, non-goals, anti-goals

**Goals**
- Match the CoreSeed visual language in the two reference images (details in §5).
- Deliver the three Phase 5 items above.
- Work on desktop, laptop and tablet widths (≥ 768 px). Phones only need to stay usable (no horizontal page scroll).

**Non-goals**
- No change to the DAT conversion, validation, reconciliation, SAP, SQL→JSON, auth or audit logic (`converter.js`, `source-adapters.js`, `sap-withholding.js`, `sap-connector.js`, `auth.js`, `audit.js`, `server.js`).
- No new front-end framework, build step or npm dependency.
- No dark mode for the app shell. Only the login screen is dark, as in the reference.
- No new server endpoints.

**Anti-goals** (failure even if it looks right)
- Any change in a generated DAT file's content or filename for the same input.
- Hiding errors: every converter error must still be shown. The grid adds highlighting; it does not replace the error list.
- Taxpayer data (payee TINs, names, row values) reaching logs, the audit trail or any network request. The reconciliation summary is a local download only.
- A broken existing flow: login/register/recover, report selection, all four source modes, SAP document exclusion, admin user management, audit, exports, status.
- Loading fonts, scripts or images from external hosts. Taxpayer files are processed locally, and the app must not depend on third-party hosts.

## 3. Constraints

- Plain HTML/CSS/vanilla JS served by `server.js`. Scripts load with `defer` from the site root; SheetJS is at `/vendor/xlsx.full.min.js`.
- `app.js` and `auth-client.js` find elements by ID and toggle the `.hidden` class. **Every existing ID must be kept** (they can move within the markup and get new classes). New elements get new IDs.
- `auth-client.js` drives navigation through `[data-nav-target]` buttons and the `#topbar-nav` container. The sidebar nav must reuse those attributes and IDs (`nav-btn-*`, `topbar-nav`, `user-role-badge`, `account-status`, `logout-button`) so the RBAC visibility logic works unchanged.
- AGENTS.md: conversion and UI logic stay separate; no silent discarding of errors; no taxpayer data in logs; generated output verified before success is reported.
- No UI tests exist today (`node --test` covers converter, auth, server, adapters). Existing tests must keep passing.

## 4. Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | Restyle in place: new shell markup in `index.html` keeping all IDs, rewrite `styles.css` with CoreSeed tokens, extend the wizard in `app.js` with the pre-flight grid and export center. | Big CSS rewrite and HTML restructure; zero new tooling; conversion logic untouched and still covered by tests. |
| B | Rebuild the front end in React + Tailwind. | Closest to a likely CoreSeed stack, but adds a build step and rewrites every flow, risking working SAP/admin/wizard behaviour for a visual goal. |
| C | Theme override stylesheet on top of current CSS. | Smallest diff, but a top-bar layout cannot become a sidebar shell without HTML changes, and overrides on 1,700 lines of CSS become unmaintainable. |

The user chose **A**. A port to CoreSeed's actual stack, if needed, belongs to Phase 7.

## 5. Visual language (from the reference images)

**App shell (`image.png`)**
- Light background `#f5f7fb`-ish; white cards with a 1 px `#e4e8f0` border, ~12 px radius, very soft shadow.
- Left sidebar (~256 px, white, right border): logo at the top; a "Workspace" selector card; section labels in small uppercase grey (`OVERVIEW`, `MANAGE`, `OPERATE`); nav items with a line icon and label; the active item has a pale indigo background and navy text; the user (avatar initials, name, role) is pinned at the bottom.
- Top bar: breadcrumb (`DAT File Converter / <current view>`) on the left; icon buttons and an avatar circle on the right.
- Page header: small uppercase eyebrow with a short leading rule (`— CONTROL PLANE · …`), then a large bold heading in deep indigo/navy (`#283593`-ish, ~40 px).
- Primary button: solid navy/indigo, white text, icon left. Secondary: white with a border. Segmented control for small option sets.
- Stat cards: tinted rounded-square icon chip (indigo, green, teal, amber), large bold number, grey caption. Status cards: icon chip on the left, number, label, small grey sub-caption.
- Section eyebrow labels in indigo uppercase (`COMPLIANCE & TELEMETRY`) with a title under them, and a "View all →" link on the right.
- Small amber "Mock" pill badges, which signal state (used here for "Sample"/"Not configured" style states where needed).
- Font: Inter-like sans. Use the system stack `Inter, "Segoe UI", system-ui, sans-serif` with no web-font download.

**Login (`image.jpg`)**
- Full-viewport dark navy background with soft teal/green and blue radial glows.
- Two glass panels side by side: left form panel (logo, "Welcome back", subtitle, inputs with leading icons and inline labels, a full-width teal→blue gradient button, a help link in amber/yellow, a footer strip with the copyright); right brand panel (large logo, tagline, divider, "A PRODUCT OF Mustard Seed Systems Corporation").
- Below 900 px the brand panel hides and the form panel centres.

**Logo**: no CoreSeed logo file is in the repo. Build an inline SVG leaf mark plus a "CORESEED" text wordmark with "DAT Converter" as the sub-label, in one place so it can be swapped for the official asset. *(Builder's call; flagged as a placeholder.)*

## 6. Layout & screens

### 6.1 Login (`#auth-view`)
Keep the three modes (Sign in / Create account / Recover account) and all field IDs. Restyle it to the dark two-panel layout. The mode tabs stay as tabs (styled as a segmented control) because register/recover are standalone features (Phase 1). While logged out, the app shell (sidebar, top bar) is hidden and the login fills the viewport.

### 6.2 App shell
- Sidebar groups:
  - **OVERVIEW**: Converter (`nav-btn-converter`)
  - **HISTORY**: Recent Exports (`nav-btn-exports`)
  - **ADMINISTRATION**: Users (`nav-btn-admin`), Audit Trail (`nav-btn-audit`), System Status (`nav-btn-status`)
  - A group label hides when all its items are hidden for the user's role.
- Workspace card: shows "DAT File Converter" plus a "Standalone" badge (CoreSeed workspace switching is Phase 7). Non-interactive.
- User block at the bottom: initials avatar, name (`#account-status`), role (`#user-role-badge`), and a sign-out button (`#logout-button`).
- Top bar: breadcrumb that updates on view switch; the user initials avatar on the right. Below 1024 px a hamburger button opens the sidebar as an overlay drawer (closed by the backdrop, Esc, or picking a nav item).
- `auth-client.js` gets small additive changes: update the breadcrumb and page title on `switchView`, fill the avatar initials, hide empty nav groups, close the drawer. Its RBAC rules stay as they are.

### 6.3 Converter wizard (`#converter-view`)
Page header: eyebrow `BIR COMPLIANCE · DAT EXPORT`, heading "DAT File Converter", one-line description.

Steps (step 1 stays first because SAP pull and BIR-layout reading need the form type before reading data):

| # | Label | Content (existing stage) |
|---|---|---|
| 1 | Select form | report cards (stage 1) |
| 2 | Upload & worksheet | source mode, dropzone/SAP/JSON, worksheet select (stage 2) |
| 3 | Metadata | report period (stage 3) **and** withholding agent fields (stage 4), merged into one step |
| 4 | Pre-flight review | new data grid + summary cards (replaces stage 5 preview) |
| 5 | Export | new export & delivery center (replaces `#result-card`) |

- The stepper is a horizontal track on wide screens and becomes a compact "Step n of 5 · Label" bar with a progress line below 768 px.
- Step navigation stays as today (Back / Next; Next is disabled until the step is valid). The submit button ("Generate DAT file") is on step 4 and is disabled while errors exist. A successful conversion moves to step 5.
- Validation messages for steps 1–3 stay as they are.

### 6.4 Pre-flight review (step 4)
Entering step 4 runs a **dry run**: `DatConverter.buildDat(...)` with the current inputs. This is the same call conversion makes, with no download. The result drives:

**Summary cards** (four stat cards in the reference style):
- **Total Rows**: non-blank source rows.
- **Valid Records**: non-blank rows with no row-level error.
- **Errors Flagged**: total error messages (row-level + general), shown in red when > 0.
- **Totals**: for withholding/SAWT reports, *Total Tax Base* (`totalIncome`) and *Total Tax Withheld* (`totalWithheld`). For Books of Accounts, the totals each report's own `buildLedgerDat` summary line names: debit/credit for CRB, DJ, CDJ, GJ, GJB, GL and GLB; net/VAT figures for CMJ, DMJ, PJ and SJ; total amount for IJ and AT. Show no 0.00 placeholders for totals a report doesn't produce. *(Builder's call: the per-report mapping lives in `ui-helpers.js` with tests, derived from `converter.js`.)* `buildDat` returns totals only when there are no errors; with errors the card shows "—" and the note "Available once errors are fixed". No totals are computed in the UI.
- For BIR-layout and SAP sources, a reconciliation status line shows the existing Grand Total / SAP reconciliation text.
- **SAP reconciliation in the dry run:** when the source is an SAP pull and the dry run succeeds, the dry run also runs `DatSapWithholding.reconcileDat`. A failure appears as a general error in the Issues panel and disables Generate. The conversion-time check stays as a second guard. *(Builder's call.)*

**Data grid**
- Shows the source headers and all non-blank rows, with the source row number as the first, sticky column, and a sticky header row. It renders 50 rows per page with pager controls.
- Filter toggle: "All rows" / "Rows with errors".
- Row-level highlighting: converter errors use the form `Row N: <Label> …`. They are parsed into `{ row, label, message }`. Rows with errors get a red left border and a tinted background, and the row number cell shows an error icon.
- Cell-level highlighting: a UI-side map from error label (e.g. "Vendor TIN", "Tax Amount", "ATC", "Branch Code") to the converter field key, then via `result.columns[field]` to the column index. A matched cell gets a red outline and a `title` tooltip with the message. Labels that don't resolve still highlight the row. *(The builder writes the map from the labels in `converter.js`.)*
- An "Issues" panel below the grid lists every error (general errors first, then by row). Clicking a row error jumps to that row's page and scrolls it into view.
- Missing-column, ambiguous-column and source blocking errors/warnings/notes (today's `#column-status` text) appear in the Issues panel as general items. Ambiguous-column confirmation (`window.confirm`) stays as is at conversion time.
- SAP document review/exclusion stays in step 2, unchanged.

**Audit of blocked attempts (user decision: option A).** The dry run itself never writes to the audit trail. When the user leaves step 4 while errors are still flagged (Back, a nav switch away from the converter, or Start new conversion), the app posts one `status: "FAILED"` record to `/api/audit/conversion`, with the same metadata-only payload as today: report type, `recordCounts` (total rows, valid records, error count) and `details: sourceMode=<mode>; preflight blocked`. Each visit to step 4 logs at most once, and nothing is logged if the errors were fixed before leaving. No taxpayer identifiers or row values are sent. The existing FAILED logging inside `convertWorkbook` (build errors, SAP reconciliation failure) stays as a guard.

### 6.5 Export & delivery center (step 5)
Shown after `convertWorkbook` succeeds (and after the SAP reconciliation check passes). It replaces `#result-card`; `#result-summary`, `#result-filename`, `#download-result` and `#convert-again-button` keep their IDs.
- Success header with the DAT filename exactly as `buildDat` returns it (`<TIN><Branch><MMYYYY><Form>.DAT`; BOA suffixes as today). Filename logic is not changed.
- File facts: report type and title, period, record count, file size in bytes, line-ending note (CRLF), and the summary text.
- **Download DAT file** (primary). The automatic download on conversion stays as today.
- **Reconciliation summary** downloads: **CSV** and **Excel (.xlsx via SheetJS, already loaded)**, plus **PDF via the browser's print dialog** using a print stylesheet that shows only the summary. *(Builder's call: no PDF library is added, to keep §2's no-new-dependency rule.)*
- Summary content: generated timestamp, operator name, report type/title, period, source mode, source file name and worksheet, DAT filename, source non-blank row count, DAT detail record count, control totals from the `buildDat` result, reconciliation status (BIR-layout Grand Total / SAP reconciliation when present), and a "Not a BIR compliance certification" note (AGENTS.md §9). **No payee rows, payee TINs or names.** The agent TIN appears only as it already appears in the DAT filename.
- "Start new conversion" (existing `#convert-again-button` behaviour).

### 6.6 Other views
Recent Exports, Users (admin), Audit Trail, System Status: same data and behaviour, restyled with the page-header pattern (eyebrow + large heading), white table cards, pill status badges, and the reference stat-card style for the System Status metrics. The admin create/reset sub-cards keep their IDs.

## 7. Responsive rules
- ≥ 1280: sidebar fixed, content max-width ~1200 px, 4-up stat cards.
- 1024–1279: sidebar fixed, 2–4-up cards.
- 768–1023 (tablet): sidebar becomes a drawer; 2-up cards; the grid scrolls horizontally inside its card.
- < 768: 1-up cards, compact stepper, 16 px side gutters, no horizontal page scroll.

## 8. Files touched
- `index.html`: restructured markup (shell, login, wizard steps 3–5, export center). All existing IDs kept.
- `styles.css`: rewritten around CSS custom-property tokens (colour, radius, shadow, spacing, type scale), plus a print stylesheet.
- `app.js`: step re-mapping (4 → 3 merged metadata, preview → pre-flight, result → export step), dry-run pre-flight, grid rendering/paging/filtering, error parsing, summary cards, reconciliation-summary export. All existing conversion paths stay.
- `auth-client.js`: additive shell updates only (§6.2).
- New pure helpers that need no DOM: error parsing, label→field map and the reconciliation-summary rows can live in a small `ui-helpers.js` that also exports for Node, with unit tests in `test/ui-helpers.test.js`. *(Builder's call.)*

## 9. Verification
- `npm test`: all existing suites pass; new helper tests pass.
- Manual run of the app (`node server.js`), checking each source mode with the files in `test files/` and the docs samples: the generated DAT is byte-identical to the pre-change output for the same inputs. The baseline is a set of DAT files generated from **today's working tree before any Phase 5 edit**, because `HEAD` lacks the BIR-layout, SQL→JSON and SAP modes. Since `converter.js` is not modified, generate the baseline with a Node script that calls `buildDat` directly, and keep it in the scratchpad. *(Builder's call.)*
- Pre-flight: a workbook with known bad TIN/ATC/amount rows shows the right rows and cells flagged and the counts match the error list.
- Reconciliation CSV/XLSX: contains no payee identifiers.
- Layout checked at 1440, 1024, 820 and 390 px widths.
- Roles: admin, standard and auditor each see the correct nav groups.

## 10. Left to the builder
- Exact token values, icon set (inline SVG line icons, no icon library), spacing.
- The label→field error map contents.
- Grid page size, as long as large sheets stay responsive.
- Where helper code lives (§8).

## 11. Open / to confirm
- The official CoreSeed logo asset (placeholder used until provided).
