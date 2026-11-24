const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// User-facing strings in app.js must use real escapes (\n, ·), not
// double-escaped ones that render as literal backslash text.
const DOUBLE_ESCAPE = /\\\\(n|u[0-9a-fA-F]{4})/;

test("the double-escape detector flags only double escapes", () => {
  assert.equal(DOUBLE_ESCAPE.test(String.raw`join("\\n")`), true);
  assert.equal(DOUBLE_ESCAPE.test(String.raw`a \\u00b7 b`), true);
  assert.equal(DOUBLE_ESCAPE.test(String.raw`join("\n")`), false);
  assert.equal(DOUBLE_ESCAPE.test(String.raw`a · b`), false);
});

test("app.js has no double-escaped newline or unicode sequences", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const offenders = source.split(/\r?\n/)
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => DOUBLE_ESCAPE.test(line));
  assert.deepEqual(offenders.map(({ number, line }) => `${number}: ${line.trim()}`), []);
});
