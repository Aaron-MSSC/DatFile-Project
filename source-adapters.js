(function (root, factory) {
  const converter = typeof module !== "undefined" && module.exports
    ? require("./converter")
    : root.DatConverter;
  const api = factory(converter);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.DatSourceAdapters = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (DatConverter) {
  // Forms covered by the SQL-to-JSON contract in Documentation/SQL_to_JSON.
  const SQL_JSON_FORMS = ["0619F", "1601FQ", "2306", "2550M", "2550Q"];
  const MAX_REPORTED_ERRORS = 50;

  /*
   * Mapping profiles: SQL result field -> canonical converter field.
   *
   * Field choices follow "Withholding mapping to the documented QAP fields" in
   * Documentation/SQL_to_JSON/README.md. Every profile starts as
   * "pending-approval": the README states that these SQL results must not be
   * relabeled as the QAP layout without confirmation, so conversion is refused
   * until an approved mapping document changes the status (AGENTS.md section 4).
   *
   * Fields the SQL results do not provide (branch code, individual payee
   * Last/First/Middle names) are never defaulted.
   */
  const MAPPING_PROFILES = [
    {
      id: "1601FQ-to-1601EQ",
      formType: "1601FQ",
      reportType: "1601EQ",
      status: "pending-approval",
      reason: "The SQL_to_JSON README states that the 1601FQ result must not be relabeled as the 1601EQ QAP layout without confirmation.",
      fields: {
        tin: "tin",
        registeredName: "vendname",
        atc: "wtcode",
        nature: "WTName",
        income: "taxableamt",
        rate: "taxrate_owht",
        withheld: "taxamt"
      }
    },
    {
      id: "0619F-to-1601EQ",
      formType: "0619F",
      reportType: "1601EQ",
      status: "pending-approval",
      reason: "0619F is a monthly remittance form; using its SQL result as QAP detail data needs an approved mapping.",
      fields: {
        tin: "tin",
        registeredName: "vendname",
        atc: "wtcode",
        nature: "WTName",
        income: "taxableamt",
        rate: "taxrate_owht",
        withheld: "taxamt"
      }
    }
  ];

  const AGENT_FIELDS = { tin: "taxidnum", name: "coname", rdo: "rdo" };

  function typeMatches(value, type) {
    switch (type) {
      case "null": return value === null;
      case "string": return typeof value === "string";
      case "integer": return Number.isInteger(value);
      case "number": return typeof value === "number" && Number.isFinite(value);
      case "boolean": return typeof value === "boolean";
      case "object": return value !== null && typeof value === "object" && !Array.isArray(value);
      case "array": return Array.isArray(value);
      default: return true;
    }
  }

  // Validates the subset of JSON Schema used by the SQL_to_JSON contracts:
  // formType const, details array of objects, required keys, no extra keys, types.
  function validateSqlJson(json, schema) {
    const errors = [];
    const push = (message) => {
      if (errors.length < MAX_REPORTED_ERRORS) errors.push(message);
      else if (errors.length === MAX_REPORTED_ERRORS) errors.push("Further schema errors were not listed.");
    };

    if (!typeMatches(json, "object")) {
      return ["The JSON file must contain an object with formType and details."];
    }
    const expectedForm = schema?.properties?.formType?.const;
    if (expectedForm && json.formType !== expectedForm) {
      push(`formType must be "${expectedForm}".`);
    }
    for (const key of Object.keys(json)) {
      if (schema.additionalProperties === false && !schema.properties?.[key]) {
        push(`Unexpected top-level field "${key}".`);
      }
    }
    if (!Array.isArray(json.details)) {
      push("details must be an array.");
      return errors;
    }

    const itemSchema = schema?.properties?.details?.items || {};
    const properties = itemSchema.properties || {};
    const required = itemSchema.required || [];
    json.details.forEach((item, index) => {
      const at = `details[${index + 1}]`;
      if (!typeMatches(item, "object")) {
        push(`${at}: each detail must be an object.`);
        return;
      }
      for (const key of required) {
        if (!Object.prototype.hasOwnProperty.call(item, key)) push(`${at}: missing field "${key}".`);
      }
      for (const [key, value] of Object.entries(item)) {
        const definition = properties[key];
        if (!definition) {
          if (itemSchema.additionalProperties === false) push(`${at}: unexpected field "${key}".`);
          continue;
        }
        const types = Array.isArray(definition.type) ? definition.type : [definition.type];
        if (definition.type && !types.some((type) => typeMatches(value, type))) {
          push(`${at}: field "${key}" must be ${types.join(" or ")}.`);
        }
      }
    });
    return errors;
  }

  /**
   * Parses and schema-validates an uploaded SQL-to-JSON result.
   * @returns {Promise<{ json: object|null, formType: string, errors: string[] }>}
   */
  async function parseSqlJson(text, loadSchema = DatConverter.getJsonSchema) {
    let json;
    try {
      json = JSON.parse(String(text ?? "").replace(/^﻿/, ""));
    } catch (error) {
      return { json: null, formType: "", errors: [`The file is not valid JSON: ${error.message}`] };
    }

    const formType = json && typeof json === "object" ? json.formType : undefined;
    if (!SQL_JSON_FORMS.includes(formType)) {
      return {
        json: null,
        formType: "",
        errors: [`formType must be one of ${SQL_JSON_FORMS.join(", ")} (Documentation/SQL_to_JSON contract).`]
      };
    }

    let schema;
    try {
      schema = await loadSchema(formType);
    } catch (error) {
      return { json: null, formType, errors: [`Could not load the ${formType} schema: ${error.message}`] };
    }

    const errors = validateSqlJson(json, schema);
    return { json: errors.length ? null : json, formType, errors };
  }

  function findProfile(formType, reportType, profiles = MAPPING_PROFILES) {
    return profiles.find((profile) => profile.formType === formType && profile.reportType === reportType) || null;
  }

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  /**
   * Converts a validated SQL-to-JSON result into a canonical buildDat source.
   * Row numbers refer to details[] entries (1-based).
   */
  function toSource(json, reportType, profiles = MAPPING_PROFILES) {
    const errors = [];
    const warnings = [];
    const notes = [];
    const details = Array.isArray(json?.details) ? json.details : [];
    const formType = json?.formType || "";
    const metadata = {};
    const result = (extra = {}) => ({
      headers: [],
      rows: [],
      rowNumbers: [],
      metadata,
      errors,
      warnings,
      notes,
      profile: null,
      ...extra
    });

    // Withholding agent details, for pre-filling step 4.
    const agentValues = {};
    for (const [key, field] of Object.entries(AGENT_FIELDS)) {
      const values = new Set(details.map((item) => text(item?.[field])).filter(Boolean));
      agentValues[key] = values;
      if (values.size > 1) {
        warnings.push(`The details contain ${values.size} different withholding agent ${key === "tin" ? "TINs" : key === "rdo" ? "RDO codes" : "names"}; step 4 was not pre-filled for this value.`);
      }
    }
    if (agentValues.tin.size === 1) {
      const parts = DatConverter.splitTinBranch([...agentValues.tin][0]);
      if (parts) {
        metadata.agentTin = parts.tin;
        if (parts.branch) metadata.agentBranch = parts.branch;
      }
    }
    if (agentValues.name.size === 1) metadata.agentName = [...agentValues.name][0];
    if (agentValues.rdo.size === 1 && /^\d{3}$/.test([...agentValues.rdo][0])) metadata.agentRdo = [...agentValues.rdo][0];

    if (!details.length) {
      errors.push("The JSON result has no details records.");
      return result();
    }

    const profile = findProfile(formType, reportType, profiles);
    if (!profile) {
      errors.push(`No mapping profile exists for ${formType} data to the ${reportType || "selected"} DAT report. An approved field mapping is required before this combination can be converted.`);
      return result();
    }
    if (profile.status !== "approved") {
      errors.push(`The ${formType} → ${reportType} field mapping is pending approval, so conversion is disabled. ${profile.reason}`);
    }

    const fields = profile.fields;
    if (!fields.branch) {
      notes.push("Branch codes are taken only from a TIN written as XXX-XXX-XXX-BBBB; they are never assumed.");
    }

    const headers = [...DatConverter.CANONICAL_HEADERS.map(([, label]) => label), "Reporting Month"];
    const rows = [];
    const rowNumbers = [];
    details.forEach((item, index) => {
      const rowNumber = index + 1;
      const tinRaw = text(item[fields.tin]);
      const tinParts = DatConverter.splitTinBranch(tinRaw);
      const branch = fields.branch ? text(item[fields.branch]) : (tinParts?.branch || "");
      if (!branch) {
        errors.push(`Row ${rowNumber}: no branch code is available for this payee (the ${formType} result does not provide one). It is required and is not assumed.`);
      }
      if (!text(item[fields.registeredName])) {
        errors.push(`Row ${rowNumber}: the payee name is blank. Individual payees need separate Last, First and Middle names, which the ${formType} result does not provide.`);
      }

      const month = Number(item.docmonth);
      const year = text(item.docyear);
      const reportingMonth = Number.isInteger(month) && month >= 1 && month <= 12 && /^\d{4}$/.test(year)
        ? `${String(month).padStart(2, "0")}/${year}`
        : "";

      const canonical = {
        tin: tinParts ? tinParts.tin : tinRaw,
        branch,
        registeredName: item[fields.registeredName],
        lastName: fields.lastName ? item[fields.lastName] : "",
        firstName: fields.firstName ? item[fields.firstName] : "",
        middleName: fields.middleName ? item[fields.middleName] : "",
        atc: item[fields.atc],
        nature: fields.nature ? item[fields.nature] : "",
        income: item[fields.income],
        rate: item[fields.rate],
        withheld: item[fields.withheld]
      };
      rows.push([...DatConverter.CANONICAL_HEADERS.map(([field]) => canonical[field] ?? ""), reportingMonth]);
      rowNumbers.push(rowNumber);
    });

    const mapped = new Set(Object.values(fields));
    const unmapped = Object.keys(details[0] || {})
      .filter((key) => !mapped.has(key) && !Object.values(AGENT_FIELDS).includes(key) && key !== "docmonth" && key !== "docyear");
    if (unmapped.length) {
      notes.push(`Fields not used by the ${profile.id} mapping: ${unmapped.join(", ")}.`);
    }
    notes.push(`Row numbers refer to details[] entries (1-based) in the ${formType} JSON.`);

    return result({ headers, rows, rowNumbers, profile });
  }

  return {
    MAPPING_PROFILES,
    SQL_JSON_FORMS,
    findProfile,
    parseSqlJson,
    toSource,
    validateSqlJson
  };
});
