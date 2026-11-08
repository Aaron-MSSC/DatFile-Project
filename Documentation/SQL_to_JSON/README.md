# SAP Business One SQL-to-JSON contract

Based on the five uploaded SQL files and Documentation(1).pdf (28 pages).

## Deliverables and use

- `0619F`, `1601FQ`, `2306`, `2550M`, `2550Q` schemas describe each SQL result as `{ "formType": "...", "details": [...] }` using JSON Schema Draft 2020-12.
- Matching examples are structural, all-null examples, not completed tax returns. An empty result is `details: []`.
- `SQL_to_JSON_mapping.csv` lists every projected SQL field, exact JSON path, and inferred type. SQL aliases, including spaces and hyphens, remain unchanged.
- `PDF_QAP_1601EQ`, `PDF_Sales`, and `PDF_Purchases` schemas describe the PDF's separate Header/Details/Control export structures. Their field order is retained in `x-column-order`; JSON object order itself is not validation.
- `SQL_Server_JSON_pattern.sql` is an integration template requiring a populated #Result staging table; it does not directly execute the supplied procedures or modify SAP.

The PDF specifies Excel (.xlsx) input and DAT output, not a JSON API. These JSON contracts are application designs derived from that source. Do not send them directly to a BIR validator as a documented JSON filing format.

## Documentation boundaries

The PDF's QAP field table explicitly describes 1601EQ (Expanded). The filename convention also lists 1601FQ, but a dedicated 1601FQ layout is not supplied. The QAP schema therefore retains 1601EQ constants; it must not be relabeled as a verified final-tax layout. 0619F and 2306 appear in the module list without field-level schemas. VAT 2550M/2550Q return box layouts are not supplied; the Sales/Purchase transaction sections are separate export layouts. SAWT is another withholding report, not a direct mapping of input/output VAT data.

## Withholding mapping to the documented QAP fields

| SQL output | PDF field | Rule or gap |
|---|---|---|
| taxidnum | header/control TIN_WA | Normalize identifier; require exactly 9 TIN digits |
| coname | REGISTERED_NAME_WA | Validate max 50 characters |
| rdo | RDO_CODE_WA | Require 3 digits; left-pad only after validation |
| tin | TIN_PAYEE | Normalize separately from branch code |
| vendname | REGISTERED_NAME_PAYEE | Use for registered entity name; do not split an individual's name heuristically |
| wtcode | ATC_CODE | Source uses OWHT.OffclCode; confirm configured values |
| taxrate_owht | TAX_RATE | Rate in percentage units, e.g. 5 means 5 percent |
| taxableamt | INCOME_PAYMENT | Sum accepted detail amounts after grain validation |
| taxamt | ACTUAL_AMT_WTHLD | Preserve signs; do not replace with a recomputed tax |
| run parameters | RETRN_PERIOD | MM/YYYY; quarter-end reporting month must follow configured fiscal calendar |
| generated | SEQ_NUM | 1-based deterministic numbering after aggregation |
| missing from result | BRANCH_CODE_WA/PAYEE | Read configured company/payee branch; never silently assume 0000 |
| missing from result | LAST/FIRST/MIDDLE_NAME_PAYEE | Read maintained separate identity fields |
| literal | ALPHA_TYPE / SCHEDULE_NUM / FTYPE_CODE | Use the exact applicable documented layout constants |
| aggregate detail amounts | control INCOME_PAYMENT / ACTUAL_AMT_WTHLD | Control must equal detail totals |

QAP remarks require consolidation per vendor TIN. Preserve separate ATC/rate groups within each TIN so different tax categories are not merged. This grouping refinement is an application design; validate the final export rule with the receiving integration.

## VAT mapping to Sales/Purchases layouts

| SQL output | PDF target | Status |
|---|---|---|
| taxidnum, coname, rdo | TIN_A, REGISTERED_NAME_A, RDO_CODE_A | Direct identity mapping with validation |
| tin, vendname | TIN_PAYEE, REGISTERED_NAME_PAYEE | Counterparty mapping; Q output uses vendor-named aliases also for sales |
| Amount_Of_Purchase_Of_Capital_Goods | CAP_GOODS | Candidate purchase mapping; confirm configured VAT codes |
| Amount_Of_Purchase_Of_Goods_Other_Than_Capital_Goods | OTHER_CAP_GOODS | Candidate mapping; preserve PDF's literal target name |
| TOTAL IVAT-S | SERVICES | Candidate purchase base |
| InputVAT | INPUT_VAT | Candidate input VAT; confirm currency and creditability |
| total OVAT-E | EXEMPT (Sales) | Candidate exempt sales base |
| total OVAT-Z | ZERO_RATED (Sales) | Candidate zero-rated sales base |
| total OVAT-NG / OVAT-NG | TAX_BASE / OUTPUT_VAT | Candidate pair; reconcile government-specific categories before totaling |
| TOTAL IVAT-EZ | EXEMPT and ZERO_RATED (Purchases) | Not independently mappable: combined base must be split by Actual_VatGroup and verified OVTG configuration |
| coaddr1 / addr1 | address components | One street string cannot reconstruct separate city/province/address lines |
| missing | TOTAL_CREDIT / TOTAL_NONCREDIT | Requires separate creditability rule; do not default as a factual classification |

PDF Sales header RETRN_PERIOD explicitly says MM/DD/YYYY while its width says 7; Sales details and Purchase header/details say MM/YYYY. The schemas preserve those stated formats and flag the conflict rather than silently correcting the source. Calendar date validity still needs application validation.

## SQL findings affecting serialization and accuracy

1. 0619F and 1601FQ project docmonth twice. Remove the repeated final projection before serializing named objects; the JSON schemas represent it once.
2. Uploaded 2550M is a standalone, nondeferred AP invoice query filtered to DocEntry = 303, not a complete monthly stored procedure. It has no active month/year parameters, no sales branches and no LineNum output. Do not treat it as a full monthly return extract.
3. 2550Q contains SELECT * and grouped detail output with repeated summary values (PrevInputVAT, 21A, 21M). Do not SUM those repeated summaries across output rows. Check their source period predicates independently before use.
4. 1601FQ groups by taxamt and uses calendar month numbers for month1/2/3 while fiscal quarter selection uses OACP/OFPR. Validate fiscal-year behavior and totals before filing.
5. Source expressions mix local amounts with system currency amounts (e.g. TxblAmntSC, WTAmntSC, TotalSumSy). JSON serialization preserves values; it does not reconcile currencies.
6. Result types and nullability are inferred from SQL text, not a connected SAP database. All raw fields are required keys with nullable values to match INCLUDE_NULL_VALUES. Preserve SQL decimal precision through a decimal-aware serializer. Raw schemas do not force two-decimal rounding.
7. Header identity/configuration must remain available even for no-transaction periods; do not derive the company solely from the first result row.

## Export validation

Keep TIN/branch/RDO as strings and validate lengths before zero-padding. Do not truncate long names or overflow identifiers. Split TIN/branch using an explicit source-format rule, not by blindly removing digits. Missing required identity/configuration blocks filing export; it is not a zero amount. Blank monetary amounts become zero only at the documented export layer. Monetary values use decimals without currency symbols or grouping commas. Preserve negative adjustments. Round export detail amounts consistently to two decimals and derive control totals from those exported details. Schema validation alone cannot enforce cross-row totals, correct tax classification, aggregation grain, or fiscal-period selection.

The PDF says information must not contain special characters but does not define a full allowed character set. Enforce the receiver's confirmed character rule without silently altering legal names. Its introductory branch example uses 3 digits while QAP tables use 4; the QAP schema follows the specific table. Other layouts such as SAWT use 3-digit branches and require their own schema.

## Validation performed

All schemas checked against Draft 2020-12; all five structural examples validated against their matching schemas. No SQL Server connection was available, so SQL was not executed and no tax totals were certified. Original SQL files remain unchanged.
