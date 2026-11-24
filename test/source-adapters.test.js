const test = require("node:test");
const assert = require("node:assert/strict");
const { buildDat, getJsonSchema } = require("../converter");
const {
  MAPPING_PROFILES,
  SQL_JSON_FORMS,
  parseSqlJson,
  toSource
} = require("../source-adapters");

// Fictitious 1601FQ SQL result row with every field the schema requires.
function detail(overrides = {}) {
  return {
    Type: "AP",
    BaseRef: 1001,
    coname: "SAMPLE AGENT CORP",
    taxidnum: "987-654-321-3333",
    coaddr1: null,
    cophone: null,
    coemail: null,
    cozip: null,
    rdo: "143",
    idvend: "V001",
    addr1: null,
    vendname: "ALPHA TRADING INC",
    vendzip: null,
    docmonth: 3,
    docyear: "2026",
    taxableamt: 1000,
    taxamt: 10,
    taxrate_owht: 1,
    tin: "123-456-789-000",
    taxtype: null,
    wtcode: "WC158",
    WTName: "Goods",
    DocDate: null,
    month1: null,
    month2: null,
    month3: null,
    ...overrides
  };
}

const json = (details) => JSON.stringify({ formType: "1601FQ", details });
const agent = { tin: "987654321", branch: "3333", rdo: "143", name: "SAMPLE AGENT CORP" };

test("every contract form has a loadable schema", async () => {
  for (const formType of SQL_JSON_FORMS) {
    const schema = await getJsonSchema(formType);
    assert.equal(schema.properties.formType.const, formType);
  }
});

test("parses a valid SQL-to-JSON result", async () => {
  const parsed = await parseSqlJson(json([detail()]));
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.formType, "1601FQ");
  assert.equal(parsed.json.details.length, 1);
});

test("rejects invalid JSON, unknown form types, and schema violations", async () => {
  assert.match((await parseSqlJson("{not json")).errors[0], /not valid JSON/);
  assert.match((await parseSqlJson(JSON.stringify({ formType: "9999", details: [] }))).errors[0], /formType must be one of/);

  const missing = detail();
  delete missing.wtcode;
  const parsed = await parseSqlJson(json([missing, detail({ taxableamt: "1,000", extra: 1 })]));
  assert.equal(parsed.json, null);
  assert.ok(parsed.errors.includes('details[1]: missing field "wtcode".'));
  assert.ok(parsed.errors.includes('details[2]: field "taxableamt" must be number or null.'));
  assert.ok(parsed.errors.includes('details[2]: unexpected field "extra".'));
});

test("all shipped mapping profiles are pending approval and block conversion", async () => {
  assert.ok(MAPPING_PROFILES.every((profile) => profile.status === "pending-approval"));

  const { json: parsed } = await parseSqlJson(json([detail()]));
  const source = toSource(parsed, "1601EQ");
  assert.match(source.errors[0], /1601FQ → 1601EQ field mapping is pending approval/);
  // Preview data is still produced so the user can inspect it.
  assert.equal(source.rows.length, 1);
  assert.deepEqual(source.metadata, {
    agentTin: "987654321",
    agentBranch: "3333",
    agentName: "SAMPLE AGENT CORP",
    agentRdo: "143"
  });
});

test("reports when no mapping profile exists for the form and report", async () => {
  const { json: parsed } = await parseSqlJson(json([detail()]));
  const source = toSource(parsed, "2550M");
  assert.match(source.errors[0], /No mapping profile exists for 1601FQ data to the 2550M DAT report/);
  assert.equal(source.rows.length, 0);
});

test("never assumes a branch code or splits names that the result does not provide", async () => {
  const { json: parsed } = await parseSqlJson(json([
    detail({ tin: "123456789" }),
    detail({ vendname: null })
  ]));
  const source = toSource(parsed, "1601EQ");
  const text = source.errors.join("\n");
  assert.match(text, /Row 1: no branch code is available/);
  assert.match(text, /Row 2: the payee name is blank/);
});

test("an approved profile produces a source that buildDat converts, with period checks", async () => {
  const approved = MAPPING_PROFILES.map((profile) => ({ ...profile, status: "approved" }));
  const { json: parsed } = await parseSqlJson(json([
    detail(),
    detail({ tin: "111-222-333-0001", vendname: "BETA SERVICES CORP", wtcode: "WC160", taxableamt: 350, taxamt: 7, taxrate_owht: 2, docmonth: 2 })
  ]));
  const source = toSource(parsed, "1601EQ", approved);
  assert.deepEqual(source.errors, []);
  assert.deepEqual(source.rowNumbers, [1, 2]);

  const result = buildDat({ ...source, reportType: "1601EQ", period: "2026-03", agent });
  assert.deepEqual(result.errors, []);
  const lines = result.text.split("\r\n");
  assert.equal(lines.length, 4);
  assert.match(lines[1], /,1,123456789,000,ALPHA TRADING INC,/);
  assert.match(lines[2], /,2,111222333,0001,BETA SERVICES CORP,/);
  assert.match(lines[3], /,1350\.00,17\.00$/);

  // docmonth outside the selected quarter is rejected by buildDat's existing period check.
  const outOfQuarter = toSource({ formType: "1601FQ", details: [detail({ docmonth: 4 })] }, "1601EQ", approved);
  const failed = buildDat({ ...outOfQuarter, reportType: "1601EQ", period: "2026-03", agent });
  assert.match(failed.errors.join("\n"), /Reporting Month does not match the selected reporting quarter/);
});
