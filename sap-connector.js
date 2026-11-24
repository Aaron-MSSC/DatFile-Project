/*
 * Server-side connector to the BIR API Integration project (SAPB1-EIS-API).
 *
 * The converter never calls SAP directly (Milestone 7.3). It obtains a JWT
 * with the documents.read scope via the OAuth 2.0 client-credentials grant
 * and calls the integration service over HTTPS. Credentials come only from
 * environment variables; secrets and taxpayer data are never logged.
 */
const { pullPlan } = require("./sap-withholding");

const DEFAULT_SCOPE = "documents.read";
const REQUEST_TIMEOUT_MS = 60000;
const TOKEN_EXPIRY_MARGIN_MS = 60000;

class ConnectorError extends Error {
  /**
   * @param {"config"|"auth"|"unavailable"|"request"|"limit"|"response"} kind
   */
  constructor(kind, message, statusCode = 502) {
    super(message);
    this.name = "ConnectorError";
    this.kind = kind;
    this.statusCode = statusCode;
  }
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function parseHttpsUrl(value, label, errors, { allowLoopbackHttp = false } = {}) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    errors.push(`${label} is not set.`);
    return null;
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    errors.push(`${label} is not a valid URL.`);
    return null;
  }
  const loopbackHttp = allowLoopbackHttp && url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
  if (url.protocol !== "https:" && !loopbackHttp) {
    errors.push(`${label} must use HTTPS.`);
    return null;
  }
  if (url.search || url.hash || url.username || url.password) {
    errors.push(`${label} must not contain a query, fragment or credentials.`);
    return null;
  }
  return url;
}

/**
 * Reads connector settings from environment variables.
 *
 *   SAP_BIR_API_BASE_URL       https://host/  (BIR API Integration service)
 *   SAP_BIR_API_TOKEN_URL      https://idp/oauth2/token
 *   SAP_BIR_API_CLIENT_ID      OAuth client id
 *   SAP_BIR_API_CLIENT_SECRET  OAuth client secret
 *   SAP_BIR_API_SCOPE          optional, default "documents.read"
 *   SAP_BIR_API_AUDIENCE       optional, sent when the identity provider needs it
 *   SAP_BIR_API_CONNECTION     optional BU label shown to operators
 *   SAP_BIR_API_DEV_NO_AUTH=1  testing only: skips the token request (no client
 *                              id/secret) for a service that does not yet
 *                              validate tokens; refused when NODE_ENV=production
 */
function loadConnectorConfig(env = process.env) {
  const errors = [];
  const anySet = ["SAP_BIR_API_BASE_URL", "SAP_BIR_API_TOKEN_URL", "SAP_BIR_API_CLIENT_ID"]
    .some((key) => String(env[key] ?? "").trim());
  const connectionName = String(env.SAP_BIR_API_CONNECTION ?? "").trim().slice(0, 80) || "SAP Business One";

  if (!anySet) {
    return { configured: false, connectionName, errors: ["The SAP Business One connection is not configured."] };
  }

  const devNoAuth = String(env.SAP_BIR_API_DEV_NO_AUTH ?? "") === "1";
  // A Development-mode EIS API listens on http://localhost only; plain HTTP is
  // accepted for that loopback case and nowhere else.
  const baseUrl = parseHttpsUrl(env.SAP_BIR_API_BASE_URL, "SAP_BIR_API_BASE_URL", errors, { allowLoopbackHttp: devNoAuth });
  // Testing against a pre-production API that does not yet validate tokens:
  // the client id and secret are skipped. Never allowed in production.
  if (devNoAuth && env.NODE_ENV === "production") {
    errors.push("SAP_BIR_API_DEV_NO_AUTH is not allowed when NODE_ENV=production.");
  }

  let tokenUrl = null;
  const clientId = String(env.SAP_BIR_API_CLIENT_ID ?? "").trim();
  const clientSecret = String(env.SAP_BIR_API_CLIENT_SECRET ?? "");
  if (!devNoAuth) {
    tokenUrl = parseHttpsUrl(env.SAP_BIR_API_TOKEN_URL, "SAP_BIR_API_TOKEN_URL", errors);
    if (!clientId) errors.push("SAP_BIR_API_CLIENT_ID is not set.");
    if (!clientSecret) errors.push("SAP_BIR_API_CLIENT_SECRET is not set.");
  }

  return {
    configured: errors.length === 0,
    connectionName,
    errors,
    baseUrl: baseUrl ? baseUrl.href.replace(/\/?$/, "/") : null,
    tokenUrl: tokenUrl ? tokenUrl.href : null,
    clientId,
    clientSecret,
    scope: String(env.SAP_BIR_API_SCOPE ?? "").trim() || DEFAULT_SCOPE,
    audience: String(env.SAP_BIR_API_AUDIENCE ?? "").trim(),
    devNoAuth
  };
}

function createSapConnector(config, { fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  let cachedToken = null;

  function assertConfigured() {
    if (!config || !config.configured) {
      throw new ConnectorError(
        "config",
        "The SAP Business One connection is not configured. Ask an administrator to set the SAP_BIR_API_* settings.",
        503
      );
    }
  }

  async function send(url, init) {
    try {
      return await fetchImpl(url, { ...init, redirect: "error", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (error) {
      const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
      throw new ConnectorError(
        "unavailable",
        timedOut
          ? "The BIR API Integration service did not respond in time."
          : "The BIR API Integration service could not be reached.",
        timedOut ? 504 : 502
      );
    }
  }

  let pendingToken = null;

  // Concurrent callers share one token request.
  function getToken(forceRefresh = false) {
    if (config.devNoAuth) return Promise.resolve(null);
    if (!forceRefresh && cachedToken && cachedToken.expiresAt > now()) {
      return Promise.resolve(cachedToken.value);
    }
    if (!pendingToken) {
      pendingToken = requestToken().finally(() => {
        pendingToken = null;
      });
    }
    return pendingToken;
  }

  async function requestToken() {
    const form = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: config.scope
    });
    if (config.audience) form.set("audience", config.audience);

    const response = await send(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: form.toString()
    });
    if (!response.ok) {
      throw new ConnectorError(
        "auth",
        `The identity provider refused the converter's credentials (HTTP ${response.status}). Check the SAP_BIR_API client settings.`,
        502
      );
    }
    let body;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!body || typeof body.access_token !== "string" || !body.access_token) {
      throw new ConnectorError("auth", "The identity provider returned no access token.", 502);
    }
    const lifetimeMs = Number.isFinite(Number(body.expires_in)) ? Number(body.expires_in) * 1000 : 300000;
    cachedToken = {
      value: body.access_token,
      expiresAt: now() + Math.max(0, lifetimeMs - TOKEN_EXPIRY_MARGIN_MS)
    };
    return cachedToken.value;
  }

  async function getJson(pathAndQuery) {
    assertConfigured();
    const url = new URL(pathAndQuery, config.baseUrl).href;

    for (let attempt = 1; ; attempt += 1) {
      const token = await getToken(attempt > 1);
      const headers = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await send(url, { method: "GET", headers });

      if (response.status === 401 && attempt === 1 && !config.devNoAuth) {
        cachedToken = null;
        continue;
      }
      if (response.ok) {
        try {
          return await response.json();
        } catch {
          throw new ConnectorError("response", "The BIR API Integration service returned an invalid JSON response.", 502);
        }
      }

      let problem = null;
      try {
        problem = await response.json();
      } catch {
        problem = null;
      }
      const detail = typeof problem?.detail === "string" ? ` ${problem.detail.slice(0, 300)}` : "";
      if (response.status === 401 || response.status === 403) {
        throw new ConnectorError(
          "auth",
          `The BIR API Integration service rejected the converter's access (HTTP ${response.status}). The token needs the ${config.scope} scope.`,
          502
        );
      }
      if (response.status === 422) {
        throw new ConnectorError("limit", `The SAP result is too large.${detail}`, 422);
      }
      if (response.status === 400) {
        throw new ConnectorError("request", `The BIR API Integration service rejected the request.${detail}`, 400);
      }
      throw new ConnectorError(
        "unavailable",
        `The BIR API Integration service or SAP Service Layer is unavailable (HTTP ${response.status}).`,
        502
      );
    }
  }

  function listDocuments(source, from, to) {
    const query = new URLSearchParams({ source, from, to });
    return getJson(`api/v2/withholding-tax/documents?${query}`);
  }

  function listCodes() {
    return getJson("api/v2/withholding-tax/codes");
  }

  /**
   * Pulls every SAP source needed for one report and period. Any failure
   * rejects the whole pull, so no partial data is ever returned.
   */
  async function pullWithholding({ reportType, period }) {
    assertConfigured();
    const plan = pullPlan(reportType, period);
    if (plan.errors.length) {
      throw new ConnectorError("request", plan.errors.join(" "), 400);
    }

    const [codes, ...listings] = await Promise.all([
      listCodes(),
      ...plan.sources.map((source) => listDocuments(source, plan.from, plan.to))
    ]);

    if (!codes || !Array.isArray(codes.codes)) {
      throw new ConnectorError("response", "The withholding tax code list has an unexpected format.", 502);
    }
    listings.forEach((listing, index) => {
      if (!listing || listing.source !== plan.sources[index] || !Array.isArray(listing.documents)) {
        throw new ConnectorError("response", `The ${plan.sources[index]} listing has an unexpected format.`, 502);
      }
    });

    return {
      connection: { name: config.connectionName, companyDB: listings[0]?.companyDB || codes.companyDB || "" },
      reportType,
      period,
      from: plan.from,
      to: plan.to,
      pulledAtUtc: new Date(now()).toISOString(),
      codes: codes.codes,
      listings: listings.map((listing) => ({
        source: listing.source,
        objectType: listing.objectType,
        direction: listing.direction,
        from: listing.from,
        to: listing.to,
        scannedCount: listing.scannedCount,
        documentCount: listing.documentCount,
        documents: listing.documents
      }))
    };
  }

  return { getToken, listCodes, listDocuments, pullWithholding };
}

module.exports = { ConnectorError, createSapConnector, loadConnectorConfig };
