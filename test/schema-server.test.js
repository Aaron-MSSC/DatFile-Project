const test = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("../server");

test("serves registered JSON schemas for the browser converter", async (t) => {
  const server = createServer({});
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  for (const [schemaId, formType] of [
    ["0619F", "0619F"],
    ["1601EQ-return", "1601-EQ"],
    ["2550M", "2550M"],
    ["2550Q", "2550Q"]
  ]) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/schemas/${schemaId}.schema.json`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /application\/json/);
    const schema = await response.json();
    assert.equal(schema.properties.formType.const, formType);
  }
});
