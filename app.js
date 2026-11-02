(function () {
  const form = document.getElementById("converter-form");
  const fileInput = document.getElementById("workbook-file");
  const dropzone = document.getElementById("dropzone");
  const fileStatus = document.getElementById("file-status");
  const worksheetControl = document.getElementById("worksheet-control");
  const worksheetSelect = document.getElementById("worksheet");
  const reportType = document.getElementById("report-type");
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
  const errorMessage = document.getElementById("error-message");
  const resultCard = document.getElementById("result-card");
  const resultSummary = document.getElementById("result-summary");
  const resultFilename = document.getElementById("result-filename");
  const downloadResult = document.getElementById("download-result");

  let workbook = null;
  let selectedFile = null;
  let source = null;
  let outputUrl = null;

  fileInput.addEventListener("change", () => {
    const [file] = fileInput.files;
    if (file) {
      loadWorkbook(file);
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
      loadWorkbook(file);
    }
  });

  worksheetSelect.addEventListener("change", () => {
    renderWorksheet();
    clearResult();
  });

  form.addEventListener("input", handleFormChange);
  form.addEventListener("change", (event) => {
    if (event.target === reportType) {
      renderWorksheet();
    } else {
      handleFormChange();
    }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    convertWorkbook();
  });

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
    if (outputUrl) {
      URL.revokeObjectURL(outputUrl);
      outputUrl = null;
      downloadResult.removeAttribute("href");
    }
  }

  function handleFormChange() {
    clearResult();
    updateReadyState();
  }

  async function loadWorkbook(file) {
    clearResult();
    source = null;
    workbook = null;
    selectedFile = null;
    convertButton.disabled = true;
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
      return;
    }

    const head = document.createElement("thead");
    const headerRow = document.createElement("tr");
    source.headers.forEach((header) => {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = header || "(blank)";
      headerRow.append(cell);
    });
    head.append(headerRow);
    previewTable.append(head);

    const visibleRows = source.rows
      .filter((row) => row.some((value) => String(value ?? "").trim() !== ""))
      .slice(0, 5);
    const body = document.createElement("tbody");

    visibleRows.forEach((row) => {
      const tableRow = document.createElement("tr");
      source.headers.forEach((_, index) => {
        const cell = document.createElement("td");
        const value = row[index];
        cell.textContent = value instanceof Date
          ? value.toLocaleDateString()
          : String(value ?? "");
        tableRow.append(cell);
      });
      body.append(tableRow);
    });

    previewTable.append(body);
    previewSummary.textContent = `${source.sheetName} · ${visibleRows.length}${visibleRows.length === 5 ? "+" : ""} sample rows shown`;

    const missing = DatConverter.getMissingColumns(source.headers, reportType.value);

    columnStatus.classList.toggle("is-error", missing.length > 0);
    columnStatus.textContent = missing.length
      ? `Required columns not found: ${missing.join(", ")}. Use the column headings for the selected report.`
      : "Required columns found. You can now create the DAT file.";
    previewCard.classList.remove("hidden");
    updateReadyState();
  }

  function updateReadyState() {
    const hasSource = Boolean(selectedFile && source && source.headers.length);
    const isComplete = Object.values(agentInputs).every((input) => input.value.trim()) &&
      periodInput.value;
    const requiredColumnsPresent = hasSource &&
      DatConverter.getMissingColumns(source.headers, reportType.value).length === 0;

    convertButton.disabled = !(hasSource && isComplete && requiredColumnsPresent);
  }

  function convertWorkbook() {
    clearError();
    resultCard.classList.add("hidden");

    if (!source || !selectedFile) {
      showError("Choose a valid .xlsx workbook before converting.");
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

    if (result.errors.length) {
      showError(result.errors.join("\n"));
      return;
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
    downloadResult.click();
  }
})();
