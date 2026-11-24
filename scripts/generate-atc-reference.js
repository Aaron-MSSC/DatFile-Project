const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "Documentation", "regatc.dbf");
const outputPath = path.join(root, "atc-reference.js");
const buffer = fs.readFileSync(sourcePath);

const headerLength = buffer.readUInt16LE(8);
const recordLength = buffer.readUInt16LE(10);
const recordCount = buffer.readUInt32LE(4);
const fields = [];

for (let offset = 32; offset < headerLength && buffer[offset] !== 0x0d; offset += 32) {
  const name = buffer.toString("ascii", offset, offset + 11).replace(/\0.*$/, "");
  fields.push({ name, length: buffer[offset + 16] });
}

const entries = new Map();
for (let index = 0; index < recordCount; index++) {
  const recordOffset = headerLength + (index * recordLength);
  if (buffer[recordOffset] === 0x2a) continue;

  let fieldOffset = recordOffset + 1;
  const row = {};
  for (const field of fields) {
    row[field.name] = buffer
      .toString("ascii", fieldOffset, fieldOffset + field.length)
      .replace(/\0/g, "")
      .trim();
    fieldOffset += field.length;
  }

  const code = row.ATC_CODE;
  if (!code) continue;
  if (!entries.has(code)) {
    entries.set(code, {
      code,
      taxTypes: row.TAX_TYPE ? [row.TAX_TYPE] : [],
      formTypes: row.FORM_TYPE ? [row.FORM_TYPE] : [],
      f1600: row.F1600 === "Y"
    });
  } else {
    const entry = entries.get(code);
    if (row.TAX_TYPE && !entry.taxTypes.includes(row.TAX_TYPE)) {
      entry.taxTypes.push(row.TAX_TYPE);
    }
    if (row.FORM_TYPE && !entry.formTypes.includes(row.FORM_TYPE)) {
      entry.formTypes.push(row.FORM_TYPE);
    }
    entry.f1600 = entry.f1600 || row.F1600 === "Y";
  }
}

const generated = `(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.BIR_ATC_REFERENCE = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  return ${JSON.stringify([...entries.values()], null, 2)};
});
`;

fs.writeFileSync(outputPath, generated, "utf8");
console.log(`Generated ${entries.size} unique ATC entries from ${sourcePath}`);
