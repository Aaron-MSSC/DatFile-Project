(function () {
  const form = document.getElementById("converter-form");
  const fileInput = document.getElementById("workbook-file");
  const dropzone = document.getElementById("dropzone");
  const fileStatus = document.getElementById("file-status");
  const worksheetControl = document.getElementById("worksheet-control");
  const worksheetSelect = document.getElementById("worksheet");
  const reportType = document.getElementById("report-type");
  const reportTypeChoices = [...document.querySelectorAll('input[name="report-type-choice"]')];
  const sourceModeChoices = [...document.querySelectorAll('input[name="source-mode"]')];
  const uploadHint = document.getElementById("upload-hint");
  const dropTitle = document.getElementById("drop-title");
  const periodInput = document.getElementById("reporting-period");
  const agentInputs = {
    tin: document.getElementById("agent-tin"),
    branch: document.getElementById("agent-branch"),
    rdo: document.getElementById("agent-rdo"),
    name: document.getElementById("agent-name")
  };
  const previewCard = document.getElementById("preview-card");
  const previewSummary = document.getElementById("preview-summary");
  const previewTable = document.getElementById("preview-table");
  const columnStatus = document.getElementById("column-status");
  const convertButton = document.getElementById("convert-button");
  const convertAgainButton = document.getElementById("convert-again-button");
  const nextButton = document.getElementById("next-button");
  const backButton = document.getElementById("back-button");
  const wizardProgress = document.getElementById("wizard-progress");
  const wizardStages = [...document.querySelectorAll("[data-wizard-stage]")];
  const wizardIndicators = [...document.querySelectorAll("[data-wizard-indicator]")];
  const errorMessage = document.getElementById("error-message");
  const resultCard = document.getElementById("result-card");
  const resultSummary = document.getElementById("result-summary");
  const resultFilename = document.getElementById("result-filename");
  const downloadResult = document.getElementById("download-result");
  const sapPanel = document.getElementById("sap-pull-panel");
  const sapStatus = document.getElementById("sap-connection-status");
  const sapPeriod = document.getElementById("sap-pull-period");
  const sapPullButton = document.getElementById("sap-pull-button");
  const sapDocuments = document.getElementById("sap-documents");
  const sapDocumentsSummary = document.getElementById("sap-documents-summary");
  const sapDocumentsTable = document.getElementById("sap-documents-table");
  const wizardCompactLabel = document.getElementById("wizard-compact-label");
  const wizardCompactFill = document.getElementById("wizard-compact-fill");
  const statTotalRows = document.getElementById("stat-total-rows");
  const statValidRecords = document.getElementById("stat-valid-records");
  const statValidCaption = document.getElementById("stat-valid-caption");
  const statErrors = document.getElementById("stat-errors");
  const statErrorsCard = document.getElementById("stat-errors-card");
  const statTotals = document.getElementById("stat-totals");
  const statTotalsCaption = document.getElementById("stat-totals-caption");
  const gridFilterButtons = [...document.querySelectorAll("[data-grid-filter]")];
  const gridErrorRows = document.getElementById("grid-error-rows");
  const gridPrev = document.getElementById("grid-prev");
  const gridNext = document.getElementById("grid-next");
  const gridPageLabel = document.getElementById("grid-page-label");
  const issuesList = document.getElementById("issues-list");
  const issuesCount = document.getElementById("issues-count");
  const exportFacts = document.getElementById("export-facts");
  const summaryCsvButton = document.getElementById("download-summary-csv");
  const summaryXlsxButton = document.getElementById("download-summary-xlsx");
  const printSummaryButton = document.getElementById("print-summary");
  const reconciliationPrint = document.getElementById("reconciliation-print");

  const STEP_LABELS = ["Select form", "Upload & worksheet", "Metadata", "Pre-flight review", "Export"];
  const PREFLIGHT_STEP = 4;
  const EXPORT_STEP = 5;
  const GRID_PAGE_SIZE = 50;
  const NO_DETAIL_ROWS_ERROR = "No valid detail rows were found in the selected worksheet.";

  let workbook = null;
  let selectedFile = null;
  let source = null;
  let outputUrl = null;
  let currentStep = 1;
  let sourceMode = "data-only";
  let loadedJson = null;
  let sapPull = null;
  let sapConnection = null;
  const sapExcluded = new Set();
  // Pre-flight dry-run state: { result, parsed, errorCount, entries, errorRowSet }
  let preflight = null;
  let preflightLogged = false;
  let gridFilter = "all";
  let gridPage = 0;
  // Last successful conversion, for the export center and the reconciliation summary.
  let lastExport = null;

  const SOURCE_MODES = {
    "data-only": {
      accept: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      hint: "Use an <strong>.xlsx</strong> file with one header row followed by data rows. Legacy .xls files are not supported.",
      drop: "Drop your workbook here",
      empty: "No workbook selected"
    },
    "bir-report": {
      accept: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      hint: "Use the formatted BIR alphalist <strong>.xlsx</strong> (MAP, QAP or SAWT) with its title rows, numbered column headings and Grand Total.",
      drop: "Drop your BIR report workbook here",
      empty: "No workbook selected"
    },
    "sql-json": {
      accept: ".json,application/json",
      hint: "Use the <strong>.json</strong> result produced by the SQL-to-JSON contract (<code>{ formType, details }</code>). No live database connection is made.",
      drop: "Drop your SQL\u2192JSON result here",
      empty: "No JSON file selected"
    },
    "sap-pull": {
      accept: "",
      hint: "Pull AP or AR invoices and credit memos with withholding tax from <strong>SAP Business One</strong> through the BIR API Integration service. The pull only starts when you select it.",
      drop: "",
      empty: "No SAP documents pulled"
    }
  };

  fileInput.addEventListener("change", () => {
    const [file] = fileInput.files;
    if (file) {
      loadSourceFile(file);
    }
  });

  for (const eventName of ["dragenter", "dragover"]) {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add("drag-over");
    });
  }

  for (const eventName of ["dragleave", "drop"]) {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove("drag-over");
    });
  }

  dropzone.addEventListener("drop", (event) => {
    const [file] = event.dataTransfer.files;
    if (file) {
      loadSourceFile(file);
    }
  });

  worksheetSelect.addEventListener("change", () => {
    renderWorksheet();
    clearResult();
  });

  form.addEventListener("input", (event) => {
    if (event.target === sapPeriod) {
      updateSapPullButton();
      return;
    }
    if (event.target.dataset && event.target.dataset.documentKey) {
      return;
    }
    handleFormChange();
  });
  sapPullButton.addEventListener("click", pullFromSap);
  sapDocumentsTable.addEventListener("change", (event) => {
    const key = event.target.dataset && event.target.dataset.documentKey;
    if (!key) return;
    if (event.target.checked) sapExcluded.delete(key);
    else sapExcluded.add(key);
    renderWorksheet();
  });
  nextButton.addEventListener("click", advanceStep);
  convertAgainButton.addEventListener("click", startNewConversion);
  backButton.addEventListener("click", () => {
    if (currentStep > 1) {
      showStep(currentStep - 1);
    }
  });
  gridFilterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      gridFilter = button.dataset.gridFilter;
      gridPage = 0;
      gridFilterButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      renderGrid();
    });
  });
  gridPrev.addEventListener("click", () => {
    if (gridPage > 0) {
      gridPage -= 1;
      renderGrid();
    }
  });
  gridNext.addEventListener("click", () => {
    gridPage += 1;
    renderGrid();
  });
  issuesList.addEventListener("click", (event) => {
    const item = event.target.closest("[data-jump-row]");
    if (item) jumpToRow(Number(item.dataset.jumpRow));
  });
  summaryCsvButton.addEventListener("click", downloadSummaryCsv);
  summaryXlsxButton.addEventListener("click", downloadSummaryXlsx);
  printSummaryButton.addEventListener("click", printSummary);
  // Leaving the converter view while pre-flight still flags errors counts as a blocked attempt.
  document.addEventListener("dat:view-change", (event) => {
    if (event.detail && event.detail.targetId !== "converter-view" && currentStep === PREFLIGHT_STEP) {
      logBlockedAttempt();
    }
  });
  form.addEventListener("change", (event) => {
    if (event.target.matches('input[name="report-type-choice"]')) {
      reportType.value = event.target.value;
      reportTypeChoices.forEach((choice) => {
        choice.closest(".report-option").classList.toggle("is-selected", choice.checked);
      });
      clearResult();
      updateSapPullButton();
      if (selectedFile) {
        renderWorksheet();
      } else {
        updateReadyState();
      }
    } else if (event.target.matches('input[name="source-mode"]')) {
      setSourceMode(event.target.value);
    } else if (event.target === sapPeriod || event.target.dataset.documentKey) {
      return;
    } else {
      handleFormChange();
    }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    // Generate only from the pre-flight step. Enter in a field on an earlier
    // step would otherwise submit through the hidden Generate button.
    if (currentStep !== PREFLIGHT_STEP || !preflight || preflight.errorCount > 0) {
      return;
    }
    convertWorkbook();
  });
  showStep(currentStep);

  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove("hidden");
    resultCard.classList.add("hidden");
  }

  function clearError() {
    errorMessage.textContent = "";
    errorMessage.classList.add("hidden");
  }

  function clearResult() {
    resultCard.classList.add("hidden");
    clearError();
    lastExport = null;
    // Inputs changed: a previous pre-flight no longer describes them.
    // Re-entering step 4 runs a fresh dry run.
    if (currentStep !== PREFLIGHT_STEP) preflight = null;
    if (outputUrl) {
      URL.revokeObjectURL(outputUrl);
      outputUrl = null;
      downloadResult.removeAttribute("href");
    }
  }

  function startNewConversion() {
    if (currentStep === PREFLIGHT_STEP) logBlockedAttempt();
    clearResult();
    form.reset();
    resetLoadedFile();
    setSourceMode("data-only");
    previewTable.replaceChildren();
    preflight = null;
    gridFilter = "all";
    gridPage = 0;
    gridFilterButtons.forEach((item) => item.classList.toggle("is-active", item.dataset.gridFilter === "all"));
    exportFacts.replaceChildren();
    previewSummary.textContent = "Review the worksheet before creating the DAT file.";
    columnStatus.textContent = "";
    columnStatus.classList.remove("is-error");
    reportTypeChoices.forEach((choice) => {
      choice.checked = false;
      choice.closest(".report-option").classList.remove("is-selected");
    });
    reportType.value = "";
    showStep(1);
  }

  function resetLoadedFile() {
    workbook = null;
    loadedJson = null;
    sapPull = null;
    sapExcluded.clear();
    sapDocuments.classList.add("hidden");
    sapDocumentsTable.replaceChildren();
    selectedFile = null;
    source = null;
    fileInput.value = "";
    worksheetSelect.replaceChildren();
    worksheetSelect.disabled = true;
    worksheetControl.classList.add("hidden");
    previewCard.classList.add("hidden");
    fileStatus.textContent = SOURCE_MODES[sourceMode].empty;
  }

  function setSourceMode(mode) {
    if (!SOURCE_MODES[mode]) return;
    const changed = mode !== sourceMode;
    sourceMode = mode;
    sourceModeChoices.forEach((choice) => {
      choice.checked = choice.value === mode;
      choice.closest(".report-option").classList.toggle("is-selected", choice.checked);
    });
    fileInput.accept = SOURCE_MODES[mode].accept;
    uploadHint.innerHTML = SOURCE_MODES[mode].hint;
    dropTitle.textContent = SOURCE_MODES[mode].drop;
    const isSap = mode === "sap-pull";
    dropzone.classList.toggle("hidden", isSap);
    sapPanel.classList.toggle("hidden", !isSap);
    if (isSap) {
      if (!sapPeriod.value && periodInput.value) sapPeriod.value = periodInput.value;
      loadSapStatus();
    }
    if (changed) {
      clearResult();
      resetLoadedFile();
      updateReadyState();
    }
  }

  function handleFormChange() {
    clearResult();
    updateReadyState();
  }

  function advanceStep() {
    clearError();
    if (currentStep === 1 && !reportType.value) {
      showError("Select the BIR report you want to create before continuing.");
      return;
    }
    if (currentStep === 2 && (!selectedFile || !source || !source.headers.length)) {
      showError(sourceMode === "sql-json"
        ? "Choose a valid SQL\u2192JSON result file before continuing."
        : sourceMode === "sap-pull"
          ? "Pull the SAP Business One documents for the report period before continuing."
          : "Choose a valid .xlsx workbook with a recognisable header row before continuing.");
      return;
    }
    if (currentStep === 3 && !periodInput.value) {
      showError("Choose a report period before continuing.");
      return;
    }
    if (currentStep === 3 && !Object.values(agentInputs).every((input) => input.value.trim())) {
      showError("Complete all withholding agent details before continuing.");
      return;
    }
    if (currentStep < PREFLIGHT_STEP) {
      showStep(currentStep + 1);
    }
  }

  function showStep(step) {
    const previousStep = currentStep;
    if (previousStep === PREFLIGHT_STEP && step !== PREFLIGHT_STEP) {
      logBlockedAttempt();
    }
    currentStep = step;
    clearError();
    if (currentStep === PREFLIGHT_STEP) {
      if (previousStep !== PREFLIGHT_STEP) {
        preflightLogged = false;
        gridPage = 0;
      }
      runPreflight();
    }
    wizardStages.forEach((stage) => {
      const stageNumber = Number(stage.dataset.wizardStage);
      const ready = stageNumber === PREFLIGHT_STEP
        ? Boolean(source && source.headers.length)
        : stageNumber === EXPORT_STEP
          ? Boolean(lastExport)
          : true;
      stage.classList.toggle("hidden", !(stageNumber === currentStep && ready));
    });
    wizardCompactLabel.textContent = `Step ${currentStep} of ${wizardStages.length} · ${STEP_LABELS[currentStep - 1]}`;
    wizardCompactFill.style.width = `${(currentStep / wizardStages.length) * 100}%`;
    wizardIndicators.forEach((indicator) => {
      const indicatorStep = Number(indicator.dataset.wizardIndicator);
      const isCurrent = indicatorStep === currentStep;
      const isComplete = indicatorStep < currentStep;
      indicator.classList.toggle("is-current", isCurrent);
      indicator.classList.toggle("is-complete", isComplete);
      if (isCurrent) {
        indicator.setAttribute("aria-current", "step");
      } else {
        indicator.removeAttribute("aria-current");
      }
    });
    wizardProgress.textContent = `Step ${currentStep} of ${wizardStages.length}`;
    backButton.classList.toggle("hidden", currentStep === 1 || currentStep === EXPORT_STEP);
    nextButton.classList.toggle("hidden", currentStep >= PREFLIGHT_STEP);
    convertButton.classList.toggle("hidden", currentStep !== PREFLIGHT_STEP);
    updateReadyState();
  }

  function loadSourceFile(file) {
    if (sourceMode === "sql-json") {
      loadJsonFile(file);
    } else {
      loadWorkbook(file);
    }
  }

  async function loadJsonFile(file) {
    clearResult();
    resetLoadedFile();
    convertButton.disabled = true;
    updateReadyState();
    fileStatus.textContent = file.name;

    if (!file.name.toLowerCase().endsWith(".json")) {
      fileStatus.textContent = "Unsupported file type";
      showError("Choose the .json result file produced by the SQL-to-JSON contract.");
      return;
    }

    try {
      const parsed = await DatSourceAdapters.parseSqlJson(await file.text());
      if (parsed.errors.length) {
        fileStatus.textContent = "JSON does not match the SQL-to-JSON contract";
        showError(parsed.errors.join("\n"));
        return;
      }
      loadedJson = parsed.json;
      selectedFile = file;
      fileStatus.textContent = `${file.name} \u00b7 ${parsed.formType} \u00b7 ${parsed.json.details.length} detail record(s)`;
      renderWorksheet();
      updateReadyState();
    } catch (error) {
      fileStatus.textContent = "Could not read JSON file";
      showError(`Unable to read this JSON file: ${error.message}`);
    }
  }

  async function loadWorkbook(file) {
    clearResult();
    resetLoadedFile();
    convertButton.disabled = true;
    updateReadyState();
    previewCard.classList.add("hidden");
    worksheetControl.classList.add("hidden");
    fileStatus.textContent = file.name;

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      fileStatus.textContent = "Unsupported file type";
      showError("Choose an .xlsx workbook. Legacy .xls files are not supported by the documented converter.");
      return;
    }

    try {
      const bytes = await file.arrayBuffer();
      const parsed = XLSX.read(bytes, { type: "array", cellDates: true });
      if (!parsed.SheetNames.length) {
        throw new Error("The workbook does not contain any worksheets.");
      }

      workbook = parsed;
      selectedFile = file;
      worksheetSelect.replaceChildren();
      for (const [index, name] of parsed.SheetNames.entries()) {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = name;
        worksheetSelect.append(option);
      }

      worksheetSelect.disabled = false;
      worksheetSelect.value = "0";
      worksheetControl.classList.remove("hidden");
      fileStatus.textContent = `${file.name} · ${(file.size / 1024).toFixed(0)} KB`;
      renderWorksheet();
      clearError();
      updateReadyState();
    } catch (error) {
      fileStatus.textContent = "Could not read workbook";
      showError(`Unable to open this .xlsx file: ${error.message}`);
    }
  }

  function getWorksheetSource() {
    if (sourceMode === "sap-pull") {
      if (!sapPull) return null;
      const adapted = DatSapWithholding.toSource(sapPull, {
        reportType: reportType.value,
        excluded: sapExcluded
      });
      renderSapDocuments(adapted);
      return {
        headers: adapted.headers,
        rows: adapted.rows,
        rowNumbers: adapted.rowNumbers,
        sheetName: `${sapPull.connection.name} pull`,
        metadata: adapted.metadata,
        blockingErrors: adapted.errors,
        warnings: adapted.warnings,
        notes: adapted.notes,
        sapAdapted: adapted
      };
    }

    if (sourceMode === "sql-json") {
      if (!loadedJson) return null;
      const adapted = DatSourceAdapters.toSource(loadedJson, reportType.value);
      return {
        headers: adapted.headers,
        rows: adapted.rows,
        rowNumbers: adapted.rowNumbers,
        sheetName: `${loadedJson.formType} JSON`,
        metadata: adapted.metadata,
        blockingErrors: adapted.errors,
        warnings: adapted.warnings,
        notes: adapted.notes
      };
    }

    if (!workbook) {
      return null;
    }

    const sheetName = workbook.SheetNames[Number(worksheetSelect.value)];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return null;
    }

    const matrix = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: "",
      blankrows: true
    });

    if (sourceMode === "bir-report") {
      const range = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : { s: { r: 0, c: 0 } };
      const merges = (sheet["!merges"] || []).map((merge) => ({
        s: { r: merge.s.r - range.s.r, c: merge.s.c - range.s.c },
        e: { r: merge.e.r - range.s.r, c: merge.e.c - range.s.c }
      }));
      const layout = DatConverter.extractReportLayout(matrix, {
        merges,
        rowOffset: range.s.r,
        reportType: reportType.value
      });
      return {
        headers: layout.headers,
        rows: layout.rows,
        rowNumbers: layout.rowNumbers,
        sheetName,
        metadata: layout.metadata,
        blockingErrors: layout.errors,
        warnings: layout.warnings,
        notes: layout.notes,
        reconciliation: layout.reconciliation
      };
    }
    const headerIndex = matrix.findIndex((values) =>
      Array.isArray(values) && values.some((value) => String(value ?? "").trim() !== "")
    );
    if (headerIndex < 0) {
      return { headers: [], rows: [], rowNumbers: [], sheetName };
    }

    const headers = matrix[headerIndex].map((value) => String(value ?? "").trim());
    const dataRows = matrix.slice(headerIndex + 1);
    return {
      headers,
      rows: dataRows,
      rowNumbers: dataRows.map((_, index) => headerIndex + index + 2),
      sheetName
    };
  }

  function renderWorksheet() {
    source = getWorksheetSource();
    previewTable.replaceChildren();
    clearResult();

    if (!source || !source.headers.length) {
      previewCard.classList.add("hidden");
      previewSummary.textContent = "This worksheet is empty.";
      columnStatus.textContent = "Select a worksheet with a header row and payee records.";
      if (source && source.blockingErrors && source.blockingErrors.length) {
        showError(source.blockingErrors.join("\n"));
      }
      updateReadyState();
      return;
    }

    prefillAgentDetails(source.metadata);

    // The full data grid is rendered by the pre-flight step (runPreflight / renderGrid).
    previewSummary.textContent = `${source.sheetName} · ${source.headers.length} column(s) · ${DatUiHelpers.countNonBlankRows(source.rows)} non-blank row(s)`;

    const missing = DatConverter.getMissingColumns(source.headers, reportType.value);
    const suggestions = DatConverter.getColumnSuggestions(source.headers, reportType.value);
    const blocking = source.blockingErrors || [];
    const advisories = [...(source.warnings || []), ...(source.notes || [])];
    const sapReconciliation = source.sapAdapted && source.sapAdapted.reconciliation;
    const reconciliationText = source.reconciliation && source.reconciliation.matches
      ? ` Grand Total reconciled: income ${source.reconciliation.reportIncome}, tax withheld ${source.reconciliation.reportWithheld}.`
      : sapReconciliation && sapReconciliation.matches
        ? ` ${sapReconciliation.includedDocuments} SAP document(s), ${sapReconciliation.withholdingLines} withholding line(s) consolidated into ${sapReconciliation.detailRows} row(s): income ${sapReconciliation.totalIncome}, tax withheld ${sapReconciliation.totalWithheld}.`
        : "";

    columnStatus.classList.toggle("is-error", missing.length > 0 || blocking.length > 0);
    if (blocking.length) {
      columnStatus.textContent = `Fix these issues before conversion:\n${blocking.join("\n")}` +
        (advisories.length ? `\n\nNotes:\n${advisories.join("\n")}` : "");
      fileStatus.textContent = `${selectedFile ? selectedFile.name : "Source"} \u00b7 ${blocking.length} issue(s) to fix (see preview)`;
    } else if (sourceMode !== "data-only") {
      columnStatus.textContent = `Source read successfully.${reconciliationText}` +
        (advisories.length ? `\n${advisories.join("\n")}` : "");
    } else if (missing.length) {
      const suggestionText = suggestions.length
        ? ` Possible matches: ${suggestions.map((item) =>
            `${item.sourceHeader} \u2192 ${item.field}`
          ).join(", ")}.`
        : "";
      columnStatus.textContent =
        `Required columns not found: ${missing.join(", ")}. Use the column headings for the selected report.${suggestionText}`;
    } else if (suggestions.length) {
      columnStatus.textContent =
        `Possible ambiguous column matches: ${suggestions.map((item) =>
          `${item.sourceHeader} \u2192 ${item.field}`
        ).join(", ")}. Review these before conversion.`;
    } else {
      columnStatus.textContent = "Required columns found. Review the pre-flight results below.";
    }
    previewCard.classList.remove("hidden");
    showStep(currentStep);
  }

  function updateReadyState() {
    const hasSource = Boolean(selectedFile && source && source.headers.length);
    const hasAgentDetails = Object.values(agentInputs).every((input) => input.value.trim());
    const hasReportType = Boolean(reportType.value);
    const hasReportPeriod = Boolean(periodInput.value);
    const requiredColumnsPresent = hasSource &&
      DatConverter.getMissingColumns(source.headers, reportType.value).length === 0 &&
      !(source.blockingErrors && source.blockingErrors.length);

    const preflightClean = Boolean(preflight && preflight.errorCount === 0);

    nextButton.disabled = currentStep === 1
      ? !hasReportType
      : currentStep === 2
        ? !hasSource
        : currentStep === 3
          ? !(hasReportPeriod && hasAgentDetails)
          : true;
    convertButton.disabled = !(hasReportType && hasSource && hasReportPeriod &&
      hasAgentDetails && requiredColumnsPresent && preflightClean);
  }

  function convertWorkbook() {
    clearError();
    resultCard.classList.add("hidden");

    if (!source || !selectedFile) {
      showError("Choose a valid source file before converting.");
      return;
    }

    if (source.blockingErrors && source.blockingErrors.length) {
      showError(source.blockingErrors.join("\n"));
      return;
    }

    const suggestions = DatConverter.getColumnSuggestions(source.headers, reportType.value);
    if (suggestions.length) {
      const confirmed = window.confirm(
        `Review possible column matches:\n${suggestions.map((item) =>
          `${item.sourceHeader} \u2192 ${item.field}`
        ).join("\n")}\n\nContinue only if these mappings are correct?`
      );
      if (!confirmed) {
        showError("Conversion stopped. Confirm or rename the ambiguous worksheet column headings.");
        return;
      }
    }

    const result = DatConverter.buildDat({
      headers: source.headers,
      rows: source.rows,
      rowNumbers: source.rowNumbers,
      reportType: reportType.value,
      period: periodInput.value,
      agent: {
        tin: agentInputs.tin.value,
        branch: agentInputs.branch.value,
        rdo: agentInputs.rdo.value,
        name: agentInputs.name.value
      }
    });

    if (result.errors.length) {
      showError(result.errors.join("\n"));
      fetch("/api/audit/conversion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportType: reportType.value,
          recordCounts: {
            totalRows: source ? source.rows.length : 0,
            validRecords: 0,
            errorCount: result.errors.length
          },
          status: "FAILED",
          details: `sourceMode=${sourceMode}`
        })
      }).then(() => {
        if (window.DatAuth && window.DatAuth.refreshRecentExports) {
          window.DatAuth.refreshRecentExports();
        }
      }).catch(() => {});
      return;
    }

    if (source.sapAdapted) {
      const problems = DatSapWithholding.reconcileDat(source.sapAdapted, result);
      if (problems.length) {
        showError(`The DAT file was not created because it does not reconcile with the SAP documents:\n${problems.join("\n")}`);
        fetch("/api/audit/conversion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reportType: reportType.value,
            recordCounts: { totalRows: source.rows.length, validRecords: 0, errorCount: problems.length },
            status: "FAILED",
            details: "sourceMode=sap-pull; reconciliation failed"
          })
        }).catch(() => {});
        return;
      }
    }

    const blob = new Blob([result.text], { type: "text/plain;charset=us-ascii" });
    if (outputUrl) {
      URL.revokeObjectURL(outputUrl);
    }
    outputUrl = URL.createObjectURL(blob);
    downloadResult.href = outputUrl;
    downloadResult.download = result.filename;

    resultSummary.textContent = result.summary;
    resultFilename.textContent = result.filename;
    resultCard.classList.remove("hidden");
    lastExport = buildExportRecord(result, blob.size);
    renderExportFacts(lastExport);
    showStep(EXPORT_STEP);
    downloadResult.click();

    // Log conversion audit trail (Strictly metadata & control totals - No taxpayer identifiers)
    fetch("/api/audit/conversion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportType: reportType.value,
        recordCounts: {
          totalRows: source ? source.rows.length : 0,
          validRecords: source ? source.rows.length : 0,
          errorCount: 0
        },
        controlTotals: parseControlTotals(result.summary),
        status: "SUCCESS",
        details: `sourceMode=${sourceMode}`
      })
    }).then(() => {
      if (window.DatAuth && window.DatAuth.refreshRecentExports) {
        window.DatAuth.refreshRecentExports();
      }
    }).catch(() => {});
  }

  // Pre-fills empty withholding-agent fields from the source file; never
  // overwrites values the user has already typed. The user still confirms them.
  function prefillAgentDetails(metadata) {
    if (!metadata) return;
    const values = {
      tin: metadata.agentTin,
      branch: metadata.agentBranch,
      rdo: metadata.agentRdo,
      name: metadata.agentName
    };
    for (const [key, value] of Object.entries(values)) {
      if (value && !agentInputs[key].value.trim()) {
        agentInputs[key].value = value;
      }
    }
  }

  async function loadSapStatus() {
    if (sapConnection) {
      updateSapPullButton();
      return;
    }
    sapStatus.textContent = "Checking the SAP Business One connection\u2026";
    try {
      const response = await fetch("/api/connectors/sap/status", { headers: { Accept: "application/json" } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        sapStatus.textContent = body.error || "The SAP Business One connection is not available to your account.";
        sapConnection = { configured: false };
      } else {
        sapConnection = body;
        sapStatus.textContent = body.configured
          ? `Connection: ${body.connectionName}. Choose the reporting month, then pull.`
          : `SAP Business One is not configured: ${(body.problems || []).join(" ")}`;
      }
    } catch {
      sapStatus.textContent = "Could not check the SAP Business One connection.";
      sapConnection = null;
    }
    updateSapPullButton();
  }

  function updateSapPullButton() {
    const supported = Boolean(DatSapWithholding.PULL_REPORTS[reportType.value]);
    sapPullButton.disabled = !(sapConnection && sapConnection.configured && sapPeriod.value && supported);
    if (sapConnection && sapConnection.configured && reportType.value && !supported) {
      sapStatus.textContent = `SAP pulls are available for ${Object.keys(DatSapWithholding.PULL_REPORTS).join(", ")} only. Choose another source mode for ${reportType.value}.`;
    }
  }

  async function pullFromSap() {
    clearResult();
    resetLoadedFile();
    updateReadyState();
    sapPullButton.disabled = true;
    const period = sapPeriod.value;
    const plan = DatSapWithholding.pullPlan(reportType.value, period);
    if (plan.errors.length) {
      showError(plan.errors.join("\n"));
      updateSapPullButton();
      return;
    }
    fileStatus.textContent = `Pulling ${reportType.value} documents for ${plan.from} to ${plan.to}\u2026`;
    try {
      const response = await fetch("/api/connectors/sap/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ reportType: reportType.value, period })
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body) {
        fileStatus.textContent = "SAP pull failed; no data was loaded";
        showError((body && body.error) || `The SAP pull failed (HTTP ${response.status}).`);
        return;
      }
      sapPull = body;
      selectedFile = { name: `${body.connection.name} pull` };
      const documentCount = body.listings.reduce((sum, listing) => sum + listing.documents.length, 0);
      fileStatus.textContent = `${body.connection.name} \u00b7 ${body.from} to ${body.to} \u00b7 ${documentCount} document(s) with withholding tax`;
      if (periodInput.value !== period) {
        periodInput.value = period;
      }
      renderWorksheet();
      updateReadyState();
    } catch (error) {
      fileStatus.textContent = "SAP pull failed; no data was loaded";
      showError(`Unable to reach the converter server: ${error.message}`);
    } finally {
      updateSapPullButton();
    }
  }

  function renderSapDocuments(adapted) {
    sapDocumentsTable.replaceChildren();
    const documents = adapted.documents || [];
    sapDocuments.classList.toggle("hidden", !documents.length);
    if (!documents.length) return;

    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const label of ["Include", "Document", "Date", "Business partner", "TIN", "Withheld", "Issues"]) {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = label;
      headRow.append(cell);
    }
    head.append(headRow);

    const body = document.createElement("tbody");
    for (const item of documents) {
      const row = document.createElement("tr");
      row.classList.toggle("is-excluded", !item.included);
      const includeCell = document.createElement("td");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = item.included;
      checkbox.dataset.documentKey = item.key;
      checkbox.setAttribute("aria-label", `Include ${item.label}`);
      includeCell.append(checkbox);
      row.append(includeCell);
      for (const value of [item.label, item.docDate, item.cardName, item.tin, item.withheld]) {
        const cell = document.createElement("td");
        cell.textContent = value || "";
        row.append(cell);
      }
      const issues = document.createElement("td");
      issues.className = "sap-issues";
      issues.textContent = item.issues.join(" ");
      row.append(issues);
      body.append(row);
    }
    sapDocumentsTable.append(head, body);

    const excludedCount = documents.filter((item) => !item.included).length;
    const issueCount = documents.filter((item) => item.included && item.issues.length).length;
    sapDocumentsSummary.textContent = `${documents.length} document(s) \u00b7 ${excludedCount} excluded \u00b7 ${issueCount} included document(s) with issues. Untick a document to exclude it.`;
  }

  // ---------------------------------------------------------------------
  // Pre-flight review (step 4): a dry run of the same buildDat call that
  // conversion makes. Nothing is downloaded and nothing is audited here.
  // ---------------------------------------------------------------------

  function isNonBlankRow(row) {
    return Array.isArray(row) && row.some((value) => value !== null && value !== undefined && String(value).trim() !== "");
  }

  function runPreflight() {
    preflight = null;
    if (!source || !source.headers.length) {
      renderPreflight();
      return;
    }

    const result = DatConverter.buildDat({
      headers: source.headers,
      rows: source.rows,
      rowNumbers: source.rowNumbers,
      reportType: reportType.value,
      period: periodInput.value,
      agent: {
        tin: agentInputs.tin.value,
        branch: agentInputs.branch.value,
        rdo: agentInputs.rdo.value,
        name: agentInputs.name.value
      }
    });

    const errors = [...(source.blockingErrors || [])];
    // A SAP or JSON source that already explains why it has no rows (for
    // example "SAP returned no documents") makes the converter's generic
    // worksheet message redundant and misleading.
    const sourceExplainsNoRows = source.rows.length === 0 && errors.length > 0 &&
      (sourceMode === "sap-pull" || sourceMode === "sql-json");
    for (const error of result.errors) {
      if (sourceExplainsNoRows && error === NO_DETAIL_ROWS_ERROR) continue;
      if (!errors.includes(error)) errors.push(error);
    }
    if (!errors.length && source.sapAdapted) {
      for (const problem of DatSapWithholding.reconcileDat(source.sapAdapted, result)) {
        errors.push(`SAP reconciliation: ${problem}`);
      }
    }

    const parsed = DatUiHelpers.parseConverterErrors(errors);
    const entries = [];
    source.rows.forEach((row, index) => {
      if (isNonBlankRow(row)) {
        const rowNumbers = source.rowNumbers || [];
        entries.push({ rowNumber: rowNumbers[index] ?? index + 2, values: row });
      }
    });
    const errorRowSet = new Set(parsed.rows.keys());
    const rowsWithErrors = entries.filter((entry) => errorRowSet.has(entry.rowNumber)).length;
    preflight = { result, parsed, errorCount: parsed.total, entries, errorRowSet, rowsWithErrors };
    renderPreflight();
  }

  function renderPreflight() {
    renderPreflightCards();
    renderGrid();
    renderIssues();
  }

  function renderPreflightCards() {
    statTotals.replaceChildren();
    if (!preflight) {
      statTotalRows.textContent = "0";
      statValidRecords.textContent = "0";
      statErrors.textContent = "0";
      statErrorsCard.classList.remove("has-errors");
      gridErrorRows.textContent = "0";
      return;
    }

    const { entries, parsed, errorCount, rowsWithErrors, result } = preflight;
    statTotalRows.textContent = entries.length.toLocaleString();
    if (parsed.general.length) {
      statValidRecords.textContent = "—";
      statValidCaption.textContent = "Valid Records · fix general issues first";
    } else {
      statValidRecords.textContent = (entries.length - rowsWithErrors).toLocaleString();
      statValidCaption.textContent = "Valid Records";
    }
    statErrors.textContent = errorCount.toLocaleString();
    statErrorsCard.classList.toggle("has-errors", errorCount > 0);
    gridErrorRows.textContent = rowsWithErrors.toLocaleString();

    const totals = errorCount === 0 ? DatUiHelpers.extractTotals(result.summary) : [];
    if (totals.length) {
      for (const total of totals) {
        const row = document.createElement("div");
        const term = document.createElement("dt");
        const value = document.createElement("dd");
        term.textContent = `Total ${total.label}`;
        value.textContent = total.value;
        row.append(term, value);
        statTotals.append(row);
      }
      statTotalsCaption.textContent = "Control Totals";
    } else {
      const empty = document.createElement("div");
      empty.className = "stat-totals-empty";
      empty.textContent = "—";
      statTotals.append(empty);
      statTotalsCaption.textContent = errorCount > 0
        ? "Control Totals · available once errors are fixed"
        : "Control Totals";
    }
  }

  function filteredEntries() {
    if (!preflight) return [];
    return gridFilter === "errors"
      ? preflight.entries.filter((entry) => preflight.errorRowSet.has(entry.rowNumber))
      : preflight.entries;
  }

  function formatCell(value) {
    return value instanceof Date ? value.toLocaleDateString() : String(value ?? "");
  }

  function renderGrid() {
    previewTable.replaceChildren();
    if (!preflight || !source) {
      gridPageLabel.textContent = "Page 1 of 1";
      gridPrev.disabled = true;
      gridNext.disabled = true;
      return;
    }

    const list = filteredEntries();
    const pageCount = Math.max(1, Math.ceil(list.length / GRID_PAGE_SIZE));
    gridPage = Math.min(Math.max(gridPage, 0), pageCount - 1);

    const head = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const numberHeader = document.createElement("th");
    numberHeader.scope = "col";
    numberHeader.className = "row-number";
    numberHeader.textContent = "Row";
    headerRow.append(numberHeader);
    source.headers.forEach((header) => {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = header || "(blank)";
      headerRow.append(cell);
    });
    head.append(headerRow);

    const body = document.createElement("tbody");
    const pageEntries = list.slice(gridPage * GRID_PAGE_SIZE, (gridPage + 1) * GRID_PAGE_SIZE);
    if (!pageEntries.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = source.headers.length + 1;
      cell.className = "grid-empty";
      cell.textContent = gridFilter === "errors" ? "No rows have errors." : "No data rows found in this source.";
      row.append(cell);
      body.append(row);
    }

    for (const entry of pageEntries) {
      const row = document.createElement("tr");
      row.dataset.row = String(entry.rowNumber);
      const rowErrors = preflight.parsed.rows.get(entry.rowNumber) || [];
      const cellErrors = new Map();
      for (const error of rowErrors) {
        const column = DatUiHelpers.resolveErrorColumn(error.message, preflight.result.columns);
        if (column >= 0) {
          if (!cellErrors.has(column)) cellErrors.set(column, []);
          cellErrors.get(column).push(error.message);
        }
      }

      const numberCell = document.createElement("td");
      numberCell.className = "row-number";
      numberCell.textContent = String(entry.rowNumber);
      if (rowErrors.length) {
        row.classList.add("has-error");
        numberCell.title = rowErrors.map((error) => error.message).join("\n");
      }
      row.append(numberCell);

      source.headers.forEach((_, index) => {
        const cell = document.createElement("td");
        const text = formatCell(entry.values[index]);
        cell.textContent = text;
        if (cellErrors.has(index)) {
          cell.classList.add("cell-error");
          cell.title = cellErrors.get(index).join("\n");
        } else if (text) {
          cell.title = text;
        }
        row.append(cell);
      });
      body.append(row);
    }

    previewTable.append(head, body);
    gridPageLabel.textContent = `Page ${gridPage + 1} of ${pageCount} · ${list.length.toLocaleString()} row(s)`;
    gridPrev.disabled = gridPage === 0;
    gridNext.disabled = gridPage >= pageCount - 1;
  }

  function renderIssues() {
    issuesList.replaceChildren();
    const count = preflight ? preflight.errorCount : 0;
    issuesCount.textContent = count.toLocaleString();
    issuesCount.classList.toggle("pill-red", count > 0);
    issuesCount.classList.toggle("pill-green", Boolean(preflight) && count === 0);
    if (!preflight) return;

    if (count === 0) {
      const item = document.createElement("li");
      item.className = "issues-empty";
      item.textContent = "No issues found. The DAT file is ready to generate.";
      issuesList.append(item);
      return;
    }

    for (const message of preflight.parsed.general) {
      const item = document.createElement("li");
      const content = document.createElement("div");
      content.className = "issue-item";
      const tag = document.createElement("span");
      tag.className = "issue-tag is-general";
      tag.textContent = "General";
      const text = document.createElement("span");
      text.textContent = message;
      content.append(tag, text);
      item.append(content);
      issuesList.append(item);
    }

    const rowNumbers = [...preflight.parsed.rows.keys()].sort((left, right) => left - right);
    for (const rowNumber of rowNumbers) {
      for (const error of preflight.parsed.rows.get(rowNumber)) {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "issue-item";
        button.dataset.jumpRow = String(rowNumber);
        const tag = document.createElement("span");
        tag.className = "issue-tag";
        tag.textContent = `Row ${rowNumber}`;
        const text = document.createElement("span");
        text.textContent = error.message;
        button.append(tag, text);
        item.append(button);
        issuesList.append(item);
      }
    }
  }

  function jumpToRow(rowNumber) {
    if (!preflight) return;
    let index = filteredEntries().findIndex((entry) => entry.rowNumber === rowNumber);
    if (index < 0 && gridFilter !== "all") {
      gridFilter = "all";
      gridFilterButtons.forEach((item) => item.classList.toggle("is-active", item.dataset.gridFilter === "all"));
      index = filteredEntries().findIndex((entry) => entry.rowNumber === rowNumber);
    }
    if (index < 0) return;
    gridPage = Math.floor(index / GRID_PAGE_SIZE);
    renderGrid();
    const row = previewTable.querySelector(`tr[data-row="${rowNumber}"]`);
    if (row) {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
      row.classList.add("is-flash");
      setTimeout(() => row.classList.remove("is-flash"), 1300);
    }
  }

  // Records one FAILED audit entry when the operator leaves pre-flight with
  // errors still flagged. Metadata and counts only — no taxpayer data.
  function logBlockedAttempt() {
    if (!preflight || preflight.errorCount === 0 || preflightLogged) return;
    preflightLogged = true;
    const validRecords = preflight.parsed.general.length
      ? 0
      : preflight.entries.length - preflight.rowsWithErrors;
    fetch("/api/audit/conversion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportType: reportType.value,
        recordCounts: {
          totalRows: preflight.entries.length,
          validRecords,
          errorCount: preflight.errorCount
        },
        status: "FAILED",
        details: `sourceMode=${sourceMode}; preflight blocked`
      })
    }).then(() => {
      if (window.DatAuth && window.DatAuth.refreshRecentExports) {
        window.DatAuth.refreshRecentExports();
      }
    }).catch(() => {});
  }

  // ---------------------------------------------------------------------
  // Export & delivery center (step 5)
  // ---------------------------------------------------------------------

  function selectedReportTitle() {
    const checked = reportTypeChoices.find((choice) => choice.checked);
    const title = checked && checked.closest(".report-option").querySelector("strong");
    return title ? title.textContent.trim() : "";
  }

  function formatPeriod(value) {
    const match = /^(\d{4})-(\d{2})$/.exec(value || "");
    return match ? `${match[2]}/${match[1]}` : value || "";
  }

  function reconciliationText(result) {
    const sourceRows = DatUiHelpers.countNonBlankRows(source.rows);
    const parts = [
      sourceRows === result.detailCount
        ? `Source records (${sourceRows}) match DAT detail records (${result.detailCount}).`
        : `Source records (${sourceRows}) differ from DAT detail records (${result.detailCount}); review before filing.`
    ];
    if (source.reconciliation && source.reconciliation.matches) {
      parts.push(`Grand Total reconciled: income ${source.reconciliation.reportIncome}, tax withheld ${source.reconciliation.reportWithheld}.`);
    }
    const sap = source.sapAdapted && source.sapAdapted.reconciliation;
    if (sap && sap.matches) {
      parts.push(`${sap.includedDocuments} SAP document(s), ${sap.withholdingLines} withholding line(s) consolidated into ${sap.detailRows} row(s).`);
    }
    return parts.join(" ");
  }

  function buildExportRecord(result, bytes) {
    const user = window.DatAuth && window.DatAuth.getCurrentUser ? window.DatAuth.getCurrentUser() : null;
    return {
      generatedAt: new Date().toISOString(),
      operator: user ? user.name : "",
      reportType: reportType.value,
      reportTitle: selectedReportTitle(),
      period: formatPeriod(periodInput.value),
      sourceMode,
      sourceName: selectedFile ? selectedFile.name : "",
      sheetName: source ? source.sheetName : "",
      filename: result.filename,
      sourceRows: DatUiHelpers.countNonBlankRows(source.rows),
      detailCount: result.detailCount,
      summary: result.summary,
      reconciliation: reconciliationText(result),
      bytes
    };
  }

  function renderExportFacts(record) {
    exportFacts.replaceChildren();
    const facts = [
      ["Report", `${record.reportType} · ${record.reportTitle}`],
      ["Return period", record.period],
      ["DAT detail records", String(record.detailCount)],
      ["Source records", String(record.sourceRows)],
      ["File size", `${record.bytes.toLocaleString()} bytes`],
      ["Line endings", "CRLF"],
      ["Source", record.sourceName]
    ];
    for (const [label, value] of facts) {
      const wrap = document.createElement("div");
      const term = document.createElement("dt");
      const detail = document.createElement("dd");
      term.textContent = label;
      detail.textContent = value;
      wrap.append(term, detail);
      exportFacts.append(wrap);
    }
  }

  function summaryRows() {
    return [["Field", "Value"], ...DatUiHelpers.buildReconciliationRows(lastExport)];
  }

  function summaryBaseName() {
    return `${lastExport.filename.replace(/\.DAT$/i, "")}-reconciliation`;
  }

  function downloadSummaryCsv() {
    if (!lastExport) return;
    const blob = new Blob([DatUiHelpers.toCsv(summaryRows())], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${summaryBaseName()}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadSummaryXlsx() {
    if (!lastExport) return;
    const sheet = XLSX.utils.aoa_to_sheet(summaryRows());
    sheet["!cols"] = [{ wch: 34 }, { wch: 90 }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Reconciliation");
    XLSX.writeFile(book, `${summaryBaseName()}.xlsx`);
  }

  function printSummary() {
    if (!lastExport) return;
    reconciliationPrint.replaceChildren();
    const title = document.createElement("h1");
    title.textContent = "DAT Reconciliation Summary";
    const subtitle = document.createElement("p");
    subtitle.textContent = `${lastExport.filename} · generated ${new Date(lastExport.generatedAt).toLocaleString()}`;
    const table = document.createElement("table");
    const body = document.createElement("tbody");
    for (const [label, value] of DatUiHelpers.buildReconciliationRows(lastExport)) {
      const row = document.createElement("tr");
      const head = document.createElement("th");
      const cell = document.createElement("td");
      head.scope = "row";
      head.textContent = label;
      cell.textContent = value;
      row.append(head, cell);
      body.append(row);
    }
    table.append(body);
    reconciliationPrint.append(title, subtitle, table);
    document.body.classList.add("printing-summary");
    window.addEventListener("afterprint", () => {
      document.body.classList.remove("printing-summary");
    }, { once: true });
    window.print();
  }

  function parseControlTotals(summary) {
    if (!summary) return null;
    const totals = {};
    const matches = summary.matchAll(/Total\s+([A-Za-z\s]+?)\s+([\d,]+\.\d{2})/g);
    for (const m of matches) {
      const key = m[1].trim().toLowerCase().replace(/\s+/g, "_");
      const val = parseFloat(m[2].replace(/,/g, ""));
      if (!Number.isNaN(val)) {
        totals[key] = val;
      }
    }
    return Object.keys(totals).length ? totals : null;
  }
})();
