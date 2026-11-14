# AGENTS.md
# BIR Excel-to-DAT File Converter

## 1. Project Overview

Develop and maintain a converter that transforms BIR forms and reports prepared in Microsoft Excel into DAT files following the applicable BIR technical specifications.

The application must ensure that the generated DAT files accurately represent the source Excel data and comply with the approved file structure, formatting, and validation requirements.

**Primary Objective:**
Provide a reliable and verifiable conversion process from Excel to DAT without changing, omitting, or incorrectly transforming source data.

## 2. General Development Instructions

All coding agents working on this project must:

1. Review the existing project structure before modifying files.
2. Understand the existing conversion logic before introducing changes.
3. Follow the established programming language, architecture, and coding conventions.
4. Avoid unnecessary changes to existing working functionality.
5. Never assume BIR field definitions, delimiters, or file structures.
6. Refer to approved BIR documentation and sample DAT files as the authoritative specifications.
7. Keep conversion, validation, and file-generation logic separate whenever practical.
8. Preserve the original Excel source file.
9. Document significant changes and assumptions.
10. Never report a successful conversion without verifying the generated output.

## 3. Excel Source Verification

Before processing an Excel file, verify:

- The uploaded file is a supported Excel format.
- The required worksheet exists.
- Required column headers are present.
- Column names match the approved mapping.
- Mandatory fields are populated.
- Data types are valid.
- Date and amount fields follow the expected format.
- Empty rows are handled correctly.
- Duplicate records are identified according to the applicable business rules.
- Formulas and calculated values are read correctly.

Do not silently discard invalid or unmapped fields.

## 4. Field Mapping Verification

Every Excel field must be mapped to its corresponding DAT field based on the approved mapping document.

For each field, verify:

- Source Excel column.
- Destination DAT field.
- Field sequence.
- Data type.
- Maximum field length.
- Required or optional status.
- Formatting rules.
- Default values, if applicable.
- Transformation rules.

If a field has no confirmed mapping, flag it for review instead of inventing a mapping.

## 5. DAT File Generation Verification

The generated DAT file must be checked against the approved BIR specifications.

Verify the following:

### File Structure
- Correct file extension (.DAT).
- Correct record sequence.
- Correct field sequence.
- Correct delimiter or fixed-width structure.
- Correct header and trailer records, if required.
- Correct line endings.
- Correct character encoding.

### Data Formatting
- Dates use the required format.
- Decimal values follow the required precision.
- Negative values follow the specified representation.
- Special characters are handled correctly.
- Blank and null values follow the approved rules.
- Text fields do not exceed permitted lengths.
- Numeric fields contain valid numeric values.

### File Integrity
- No unintended missing records.
- No unintended duplicate records.
- No additional or unexpected fields.
- No truncated values.
- No corrupted characters.
- No unexpected blank lines.

Do not assume that a DAT file is valid merely because it was successfully generated.

## 6. Data Reconciliation

Every conversion must undergo source-to-output reconciliation.

Verify:

1. Source Excel record count against generated DAT record count.
2. Field-by-field value consistency.
3. Correct handling of decimal and date conversions.
4. Correct treatment of blank and optional fields.
5. Correct totals, where applicable.
6. Correct record ordering, where required.

Any discrepancy must be documented and investigated.

The original Excel values must remain unchanged.

## 7. Error Handling

The application must provide meaningful error messages for:

- Unsupported Excel files.
- Missing worksheets.
- Missing required columns.
- Invalid data types.
- Missing mandatory values.
- Invalid date formats.
- Invalid numeric values.
- Field length violations.
- Unmapped fields.
- DAT generation failures.
- File access and permission errors.

Errors should identify the affected worksheet, row, column, and field whenever possible.

Do not silently skip invalid records.

## 8. Testing Requirements

All major development changes must undergo testing.

### Unit Testing
Test individual functions for:
- Excel reading.
- Worksheet selection.
- Field mapping.
- Data conversion.
- Date formatting.
- Numeric formatting.
- DAT writing.
- Validation rules.

### Functional Testing
Test the complete conversion process using representative Excel files.

### Negative Testing
Test invalid and incomplete Excel files, including:
- Missing columns.
- Empty worksheets.
- Incorrect data types.
- Invalid dates.
- Invalid amounts.
- Duplicate records.
- Unexpected characters.

### Regression Testing
Ensure that modifications do not break previously working BIR form and report conversions.

### Reconciliation Testing
Compare the generated DAT output against approved reference files.

## 9. Verification Rules for AI Agents

Before declaring a task complete, the agent must:

1. Review all modified files.
2. Check for syntax and compilation errors.
3. Execute applicable automated tests.
4. Verify that the conversion logic follows the approved mapping.
5. Generate a sample DAT file when test data is available.
6. Inspect the generated DAT file.
7. Compare source and output records.
8. Report all failed or incomplete tests.
9. Identify assumptions and unresolved requirements.
10. Provide a concise summary of the changes.

**Important:** Passing application tests does not automatically establish BIR compliance. Actual compliance must be verified against the applicable official BIR specifications and, where available, an accepted reference DAT file or validation process.

## 10. Security and Data Protection

- Do not expose taxpayer information in application logs.
- Do not upload confidential BIR files to external services without authorization.
- Do not modify original Excel files.
- Store generated DAT files in the designated output directory.
- Avoid embedding credentials or sensitive configuration values in source code.
- Do not overwrite existing output files without explicit handling.

## 11. Development Completion Report

After completing a task, provide the following report:

### Implementation Summary
- Changes implemented.
- Files modified or added.
- Functions or modules affected.

### Verification Results
- Compilation status.
- Unit test results.
- Functional test results.
- DAT structure validation.
- Data reconciliation results.

### Outstanding Issues
- Failed tests.
- Unverified requirements.
- Missing reference files.
- Assumptions requiring confirmation.

### Final Assessment
Classify the task as one of the following:

- **PASS** – All applicable verification checks passed.
- **PARTIAL PASS** – Implementation works, but some verification checks remain incomplete.
- **FAIL** – One or more critical checks failed.

Never classify an implementation as PASS if critical validation or reconciliation checks remain unresolved.

## 12. Priority of Requirements

When requirements conflict, follow this order:

1. Official applicable BIR technical specifications.
2. Approved BIR Excel templates.
3. Approved field mapping documentation.
4. Accepted DAT reference files.
5. Project-specific technical decisions.
6. Existing application implementation.

Do not override an official specification based solely on assumptions or existing code behavior.