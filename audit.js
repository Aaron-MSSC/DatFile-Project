const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

class AuditStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.logs = [];
    this.writeQueue = Promise.resolve();
  }

  async initialize() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    let contents;
    try {
      contents = await fs.readFile(this.filePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        return;
      }
      throw error;
    }

    try {
      const records = JSON.parse(contents);
      if (Array.isArray(records)) {
        this.logs = records;
      }
    } catch {
      this.logs = [];
    }
  }

  logEvent({
    userId = null,
    userEmail = null,
    action,
    reportType = null,
    recordCounts = null,
    controlTotals = null,
    status = "SUCCESS",
    details = null
  }) {
    return this.serialize(async () => {
      // Strictly sanitize: Never log taxpayer TIN, names, addresses, or record data
      const entry = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        userId: typeof userId === "string" ? userId : null,
        userEmail: typeof userEmail === "string" ? userEmail : null,
        action: String(action || "UNKNOWN"),
        reportType: typeof reportType === "string" ? reportType : null,
        recordCounts: sanitizeRecordCounts(recordCounts),
        controlTotals: sanitizeControlTotals(controlTotals),
        status: status === "FAILED" ? "FAILED" : "SUCCESS",
        details: typeof details === "string" ? details.slice(0, 200) : null
      };

      this.logs.unshift(entry);
      // Keep up to 2000 log entries in file
      if (this.logs.length > 2000) {
        this.logs = this.logs.slice(0, 2000);
      }

      await this.persist();
      return entry;
    });
  }

  getLogs({ limit = 100, userId = null } = {}) {
    let result = this.logs;
    if (userId) {
      result = result.filter((entry) => entry.userId === userId);
    }
    const max = Math.min(Math.max(1, Number(limit) || 100), 500);
    return result.slice(0, max);
  }

  serialize(operation) {
    const result = this.writeQueue.then(operation);
    this.writeQueue = result.catch(() => {});
    return result;
  }

  async persist() {
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporaryPath, `${JSON.stringify(this.logs, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600
      });
      await fs.rename(temporaryPath, this.filePath);
    } catch (error) {
      await fs.rm(temporaryPath, { force: true });
      throw error;
    }
  }
}

function sanitizeRecordCounts(counts) {
  if (!counts || typeof counts !== "object") {
    return null;
  }
  return {
    totalRows: Number.isFinite(Number(counts.totalRows)) ? Number(counts.totalRows) : 0,
    validRecords: Number.isFinite(Number(counts.validRecords)) ? Number(counts.validRecords) : 0,
    errorCount: Number.isFinite(Number(counts.errorCount)) ? Number(counts.errorCount) : 0
  };
}

function sanitizeControlTotals(totals) {
  if (!totals || typeof totals !== "object") {
    return null;
  }
  const clean = {};
  for (const [key, val] of Object.entries(totals)) {
    // Only accept numeric control totals, never strings, names, or identifiers
    if (Number.isFinite(Number(val))) {
      clean[key] = Number(Number(val).toFixed(2));
    }
  }
  return Object.keys(clean).length > 0 ? clean : null;
}

function createAuditStore(filePath) {
  return new AuditStore(filePath);
}

module.exports = { createAuditStore, AuditStore };
