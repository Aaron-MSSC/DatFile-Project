const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { ConnectorError, createSapConnector, loadConnectorConfig } = require("../sap-connector");
const { createAuthStore } = require("../auth");
const { createAuditStore } = require("../audit");
const { createServer } = require("../server");

const env = {
  SAP_BIR_API_BASE_URL: "https://bir-api.example.test",
  SAP_BIR_API_TOKEN_URL: "https://idp.example.test/oauth2/token",
  SAP_BIR_API_CLIENT_ID: "dat-converter",
  SAP_BIR_API_CLIENT_SECRET: "test-secret-value",
  SAP_BIR_API_CONNECTION: "BU Alpha"
};

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function listing(source, from, to, documents = []) {
  return { companyDB: "TESTDB", source, objectType: "PurchaseInvoice", direction: "purchase", from, to, scannedCount: documents.length + 3, documentCount: documents.length, documents };
}

// Fake identity provider + BIR API. Records every request.
function fakeFetch({ tokenStatus = 200, apiStatus = () => 200, documents = [] } = {}) {
  const calls = [];
  let tokens = 0;
  const impl = async (url, init) => {
    calls.push({ url, init });
    if (url.startsWith("https://idp.example.test")) {
      tokens += 1;
      return tokenStatus === 200
        ? json(200, { access_token: `token-${tokens}`, expires_in: 3600 })
        : json(tokenStatus, { error: "invalid_client" });
    }
    const parsed = new URL(url);
    const status = apiStatus(parsed, init);
    if (status !== 200) return json(status, { title: "Problem", detail: "Narrow the date range and pull again." });
    if (parsed.pathname.endsWith("/codes")) return json(200, { companyDB: "TESTDB", codes: [{ WTCode: "WC158", OfficialCode: "WC158" }] });
    const p = parsed.searchParams;
    return json(200, listing(p.get("source"), p.get("from"), p.get("to"), p.get("source") === "purchase-invoices" ? documents : []));
  };
  return { impl, calls };
}

test("configuration requires HTTPS URLs and client credentials, and stays unconfigured when unset", () => {
  assert.equal(loadConnectorConfig({}).configured, false);
  assert.equal(loadConnectorConfig(env).configured, true);
  assert.equal(loadConnectorConfig(env).scope, "documents.read");

  const insecure = loadConnectorConfig({ ...env, SAP_BIR_API_BASE_URL: "http://bir-api.example.test" });
  assert.equal(insecure.configured, false);
  assert.match(insecure.errors.join(" "), /must use HTTPS/);

  const noSecret = loadConnectorConfig({ ...env, SAP_BIR_API_CLIENT_SECRET: "" });
  assert.match(noSecret.errors.join(" "), /CLIENT_SECRET is not set/);

  const devRemote = loadConnectorConfig({ SAP_BIR_API_BASE_URL: "https://bir-api.example.test", SAP_BIR_API_DEV_NO_AUTH: "1" });
  assert.equal(devRemote.configured, true, "no client id/secret or token URL needed");
  assert.equal(devRemote.tokenUrl, null);

  const devProduction = loadConnectorConfig({ SAP_BIR_API_BASE_URL: "https://bir-api.example.test", SAP_BIR_API_DEV_NO_AUTH: "1", NODE_ENV: "production" });
  assert.equal(devProduction.configured, false);
  assert.match(devProduction.errors.join(" "), /not allowed when NODE_ENV=production/);

  const devLocal = loadConnectorConfig({ SAP_BIR_API_BASE_URL: "https://localhost:7001", SAP_BIR_API_DEV_NO_AUTH: "1" });
  assert.equal(devLocal.configured, true);

  // Plain HTTP only for a loopback host, and only in dev no-auth mode.
  const devLocalHttp = loadConnectorConfig({ SAP_BIR_API_BASE_URL: "http://localhost:5234", SAP_BIR_API_DEV_NO_AUTH: "1" });
  assert.equal(devLocalHttp.configured, true);
  assert.equal(devLocalHttp.baseUrl, "http://localhost:5234/");
  const devRemoteHttp = loadConnectorConfig({ SAP_BIR_API_BASE_URL: "http://bir-api.example.test", SAP_BIR_API_DEV_NO_AUTH: "1" });
  assert.match(devRemoteHttp.errors.join(" "), /must use HTTPS/);
  const authLocalHttp = loadConnectorConfig({ ...env, SAP_BIR_API_BASE_URL: "http://localhost:5234" });
  assert.match(authLocalHttp.errors.join(" "), /must use HTTPS/);

  // Errors never echo the secret.
  assert.doesNotMatch(JSON.stringify(insecure.errors), /test-secret-value/);
});

test("pull obtains a documents.read token once and requests each source for the quarter", async () => {
  const fake = fakeFetch();
  const connector = createSapConnector(loadConnectorConfig(env), { fetchImpl: fake.impl });

  const pull = await connector.pullWithholding({ reportType: "1601EQ", period: "2026-05" });

  assert.equal(pull.from, "2026-04-01");
  assert.equal(pull.to, "2026-06-30");
  assert.equal(pull.connection.name, "BU Alpha");
  assert.deepEqual(pull.listings.map((item) => item.source), ["purchase-invoices", "purchase-credit-memos"]);

  const tokenCalls = fake.calls.filter((call) => call.url.startsWith("https://idp."));
  assert.equal(tokenCalls.length, 1, "parallel source requests share one token request");
  const form = new URLSearchParams(tokenCalls[0].init.body);
  assert.equal(form.get("grant_type"), "client_credentials");
  assert.equal(form.get("scope"), "documents.read");

  const apiCalls = fake.calls.filter((call) => call.url.startsWith("https://bir-api."));
  assert.equal(apiCalls.length, 3);
  for (const call of apiCalls) {
    assert.match(call.init.headers.Authorization, /^Bearer token-\d$/);
    assert.equal(call.init.redirect, "error");
  }
  assert.ok(apiCalls.some((call) => call.url === "https://bir-api.example.test/api/v2/withholding-tax/documents?source=purchase-credit-memos&from=2026-04-01&to=2026-06-30"));

  await connector.pullWithholding({ reportType: "1601EQ", period: "2026-05" });
  assert.equal(fake.calls.filter((call) => call.url.startsWith("https://idp.")).length, tokenCalls.length, "token is cached");
});

test("dev no-auth mode pulls without a token request or Authorization header", async () => {
  const fake = fakeFetch();
  const config = loadConnectorConfig({ SAP_BIR_API_BASE_URL: "https://bir-api.example.test", SAP_BIR_API_DEV_NO_AUTH: "1" });
  const connector = createSapConnector(config, { fetchImpl: fake.impl });

  const pull = await connector.pullWithholding({ reportType: "1601EQ", period: "2026-05" });

  assert.equal(pull.listings.length, 2);
  assert.equal(fake.calls.filter((call) => call.url.startsWith("https://idp.")).length, 0);
  for (const call of fake.calls) assert.equal(call.init.headers.Authorization, undefined);
});

test("a 401 refreshes the token once; failures reject the whole pull with meaningful errors", async () => {
  let rejected = 0;
  const retry = fakeFetch({ apiStatus: () => (rejected++ === 0 ? 401 : 200) });
  const connector = createSapConnector(loadConnectorConfig(env), { fetchImpl: retry.impl });
  const codes = await connector.listCodes();
  assert.equal(codes.codes.length, 1);

  const cases = [
    [{ tokenStatus: 400 }, "auth", /refused the converter's credentials/],
    [{ apiStatus: () => 403 }, "auth", /documents.read scope/],
    [{ apiStatus: (url) => (url.pathname.endsWith("/codes") ? 200 : 422) }, "limit", /too large. Narrow the date range/],
    [{ apiStatus: () => 502 }, "unavailable", /unavailable \(HTTP 502\)/]
  ];
  for (const [options, kind, message] of cases) {
    const fake = fakeFetch(options);
    const failing = createSapConnector(loadConnectorConfig(env), { fetchImpl: fake.impl });
    await assert.rejects(
      failing.pullWithholding({ reportType: "1601EQ", period: "2026-05" }),
      (error) => error instanceof ConnectorError && error.kind === kind && message.test(error.message)
    );
  }

  const offline = createSapConnector(loadConnectorConfig(env), {
    fetchImpl: async () => { throw new TypeError("fetch failed"); }
  });
  await assert.rejects(offline.pullWithholding({ reportType: "1601EQ", period: "2026-05" }), /could not be reached/);

  const unsupported = createSapConnector(loadConnectorConfig(env), { fetchImpl: fakeFetch().impl });
  await assert.rejects(unsupported.pullWithholding({ reportType: "1600VT", period: "2026-05" }), /not available for 1600VT/);
});

test("server routes require a signed-in operator and audit pulls without taxpayer data", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dat-sap-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = createAuthStore(path.join(directory, "users.json"));
  const audit = createAuditStore(path.join(directory, "audit.json"));
  await store.initialize();
  await audit.initialize();

  const taxpayerDocument = {
    sourceIdentity: { objectType: "PurchaseInvoice", docEntry: 7, docNum: 70 },
    sourceHash: "b".repeat(64),
    document: { CardName: "SECRET SUPPLIER NAME", FederalTaxID: "555-666-777-0000", WithholdingTaxDataCollection: [] }
  };
  let failNext = false;
  const fake = fakeFetch({ documents: [taxpayerDocument], apiStatus: () => (failNext ? 503 : 200) });
  const config = loadConnectorConfig(env);
  const server = createServer(store, audit, { config, connector: createSapConnector(config, { fetchImpl: fake.impl }) });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const anonymous = await fetch(`${base}/api/connectors/sap/status`);
  assert.equal(anonymous.status, 401);

  const register = await fetch(`${base}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Operator", email: "operator@example.test", password: "Str0ng!Passw0rd" })
  });
  assert.equal(register.status, 201);
  const cookie = register.headers.get("set-cookie").split(";")[0];

  const status = await (await fetch(`${base}/api/connectors/sap/status`, { headers: { Cookie: cookie } })).json();
  assert.deepEqual(status, { configured: true, connectionName: "BU Alpha", problems: [] });
  assert.doesNotMatch(JSON.stringify(status), /secret/i);

  const formPost = await fetch(`${base}/api/connectors/sap/pull`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" },
    body: "reportType=1601EQ&period=2026-05"
  });
  assert.equal(formPost.status, 415);

  const pullResponse = await fetch(`${base}/api/connectors/sap/pull`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ reportType: "1601EQ", period: "2026-05" })
  });
  assert.equal(pullResponse.status, 200);
  const pull = await pullResponse.json();
  assert.equal(pull.listings[0].documents.length, 1);

  failNext = true;
  const failed = await fetch(`${base}/api/connectors/sap/pull`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ reportType: "1601EQ", period: "2026-05" })
  });
  assert.equal(failed.status, 502);
  assert.match((await failed.json()).error, /unavailable/);

  const entries = audit.getLogs({ limit: 10 }).filter((entry) => entry.action === "SAP_PULL");
  assert.equal(entries.length, 2);
  assert.equal(entries[0].status, "FAILED");
  assert.equal(entries[1].status, "SUCCESS");
  assert.equal(entries[1].reportType, "1601EQ");
  assert.deepEqual(entries[1].recordCounts, { totalRows: 7, validRecords: 1, errorCount: 0 });
  assert.match(entries[1].details, /connection=BU Alpha; period=2026-05; range=2026-04-01\.\.2026-06-30/);

  const persisted = await fs.readFile(path.join(directory, "audit.json"), "utf8");
  assert.doesNotMatch(persisted, /SECRET SUPPLIER NAME|555-666-777|test-secret-value/);
});
