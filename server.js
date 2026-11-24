const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { createAuthStore, SESSION_TTL_MS } = require("./auth");
const { createAuditStore } = require("./audit");
const { ConnectorError, createSapConnector, loadConnectorConfig } = require("./sap-connector");

const root = __dirname;
const SESSION_COOKIE = "dat_converter_session";
const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/auth-client.js", ["auth-client.js", "text/javascript; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/ui-helpers.js", ["ui-helpers.js", "text/javascript; charset=utf-8"]],
  ["/atc-reference.js", ["atc-reference.js", "text/javascript; charset=utf-8"]],
  ["/converter.js", ["converter.js", "text/javascript; charset=utf-8"]],
  ["/source-adapters.js", ["source-adapters.js", "text/javascript; charset=utf-8"]],
  ["/sap-withholding.js", ["sap-withholding.js", "text/javascript; charset=utf-8"]],
  ["/schemas/0619F.schema.json", ["Documentation/SQL_to_JSON/0619F.schema.json", "application/json; charset=utf-8"]],
  ["/schemas/1601EQ-return.schema.json", ["Documentation/SQL_to_JSON/1601EQ-return.schema.json", "application/json; charset=utf-8"]],
  ["/schemas/1601FQ.schema.json", ["Documentation/SQL_to_JSON/1601FQ.schema.json", "application/json; charset=utf-8"]],
  ["/schemas/2306.schema.json", ["Documentation/SQL_to_JSON/2306.schema.json", "application/json; charset=utf-8"]],
  ["/schemas/2550M.schema.json", ["Documentation/SQL_to_JSON/2550M.schema.json", "application/json; charset=utf-8"]],
  ["/schemas/2550Q.schema.json", ["Documentation/SQL_to_JSON/2550Q.schema.json", "application/json; charset=utf-8"]],
  ["/vendor/xlsx.full.min.js", ["node_modules/xlsx/dist/xlsx.full.min.js", "text/javascript; charset=utf-8"]]
]);

function createServer(authStore, auditStore, sapConnector) {
  const store = authStore || createAuthStore(
    process.env.DAT_AUTH_FILE || path.join(root, "data", "users.json")
  );
  const audit = auditStore || createAuditStore(
    process.env.DAT_AUDIT_FILE || path.join(root, "data", "audit.json")
  );
  const sap = sapConnector || (() => {
    const config = loadConnectorConfig();
    return { config, connector: createSapConnector(config) };
  })();

  return http.createServer(async (request, response) => {
    try {
      let requestUrl;
      try {
        requestUrl = new URL(request.url, "http://localhost");
      } catch {
        const error = new Error("Invalid request URL.");
        error.statusCode = 400;
        throw error;
      }

      if (requestUrl.pathname.startsWith("/api/")) {
        await handleApiRequest(request, response, requestUrl, store, audit, sap);
        return;
      }

      const file = files.get(requestUrl.pathname);
      if (!file || (request.method !== "GET" && request.method !== "HEAD")) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }

      const filePath = path.join(root, file[0]);
      fs.stat(filePath, (statError, stat) => {
        if (statError || !stat.isFile()) {
          response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          response.end("Required application file is missing.");
          return;
        }

        writeSecurityHeaders(response);
        response.writeHead(200, {
          "Content-Type": file[1],
          "Content-Length": stat.size,
          "Cache-Control": "no-store"
        });

        if (request.method === "HEAD") {
          response.end();
          return;
        }

        fs.createReadStream(filePath).pipe(response);
      });
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error);
        return;
      }
      if (error.statusCode >= 400 && error.statusCode < 500) {
        const message = error.statusCode === 413
          ? "Request body is too large."
          : error.message;
        sendJson(response, error.statusCode, { error: message });
        return;
      }
      console.error("Request failed:", error);
      sendJson(response, 500, { error: "The request could not be completed." });
    }
  });
}

async function handleApiRequest(request, response, requestUrl, store, audit, sap) {
  const pathname = requestUrl.pathname;
  writeSecurityHeaders(response);
  response.setHeader("Cache-Control", "no-store");

  // 1. Session check
  if (pathname === "/api/session" && request.method === "GET") {
    const token = getCookie(request, SESSION_COOKIE);
    sendJson(response, 200, { user: store.getSession(token) });
    return;
  }

  // 2. Logout
  if (pathname === "/api/logout" && request.method === "POST") {
    const token = getCookie(request, SESSION_COOKIE);
    const user = store.getSession(token);
    if (user) {
      await audit.logEvent({
        userId: user.id,
        userEmail: user.email,
        action: "LOGOUT",
        status: "SUCCESS"
      });
    }
    store.deleteSession(token);
    clearSessionCookie(response);
    sendJson(response, 200, { ok: true });
    return;
  }

  // 3. Register & Login
  if ((pathname === "/api/register" || pathname === "/api/login") &&
      request.method === "POST") {
    const body = await readJsonBody(request);
    let user;
    let statusCode = 200;

    if (pathname === "/api/register") {
      user = await store.register(body);
      statusCode = 201;
      await audit.logEvent({
        userId: user.id,
        userEmail: user.email,
        action: "USER_REGISTERED",
        status: "SUCCESS",
        details: `Role assigned: ${user.role}`
      });
    } else {
      user = await store.login(body);
      if (!user) {
        await audit.logEvent({
          userEmail: body.email || null,
          action: "LOGIN_FAILED",
          status: "FAILED",
          details: "Invalid email or password"
        });
        sendJson(response, 401, { error: "Email or password is incorrect." });
        return;
      }
      await audit.logEvent({
        userId: user.id,
        userEmail: user.email,
        action: "LOGIN",
        status: "SUCCESS"
      });
    }

    response.setHeader("Set-Cookie", createSessionCookie(store.createSession(user)));
    sendJson(response, statusCode, { user });
    return;
  }

  // 4. Account Recovery Request
  if (pathname === "/api/auth/recover-request" && request.method === "POST") {
    const body = await readJsonBody(request);
    const result = await store.requestRecovery(body.email);
    await audit.logEvent({
      userEmail: body.email || null,
      action: "RECOVERY_REQUESTED",
      status: "SUCCESS"
    });
    sendJson(response, 200, result);
    return;
  }

  // 5. Account Recovery Reset
  if (pathname === "/api/auth/recover-reset" && request.method === "POST") {
    const body = await readJsonBody(request);
    if (!body.email || !body.recoveryToken || !body.newPassword) {
      const error = new Error("Email, recovery token, and new password are required.");
      error.statusCode = 400;
      throw error;
    }
    const user = await store.resetPasswordWithRecovery(body.email, body.recoveryToken, body.newPassword);
    await audit.logEvent({
      userId: user.id,
      userEmail: user.email,
      action: "PASSWORD_RECOVERED",
      status: "SUCCESS"
    });
    sendJson(response, 200, { ok: true, message: "Password updated successfully. Please sign in." });
    return;
  }

  // 6. Audit Conversion Activity (Strictly Sanitized - No Taxpayer Identifiers)
  if (pathname === "/api/audit/conversion" && request.method === "POST") {
    const user = requireAuth(request, store);
    const body = await readJsonBody(request);
    const entry = await audit.logEvent({
      userId: user.id,
      userEmail: user.email,
      action: "CONVERSION",
      reportType: body.reportType,
      recordCounts: body.recordCounts,
      controlTotals: body.controlTotals,
      status: body.status || "SUCCESS",
      details: body.details || null
    });
    sendJson(response, 201, { ok: true, id: entry.id });
    return;
  }

  // 7. Recent Exports for Current User
  if (pathname === "/api/user/recent-exports" && request.method === "GET") {
    const user = requireAuth(request, store);
    const userLogs = audit.getLogs({ userId: user.id, limit: 20 })
      .filter((item) => item.action === "CONVERSION");
    sendJson(response, 200, { recentExports: userLogs });
    return;
  }

  // 8. Admin User List
  if (pathname === "/api/admin/users" && request.method === "GET") {
    requireAuth(request, store, ["admin"]);
    sendJson(response, 200, { users: store.listUsers() });
    return;
  }

  // 9. Admin Create User
  if (pathname === "/api/admin/users" && request.method === "POST") {
    const admin = requireAuth(request, store, ["admin"]);
    const body = await readJsonBody(request);
    const newUser = await store.register(body);
    await audit.logEvent({
      userId: admin.id,
      userEmail: admin.email,
      action: "ADMIN_CREATE_USER",
      status: "SUCCESS",
      details: `Created user ${newUser.email} with role ${newUser.role}`
    });
    sendJson(response, 201, { user: newUser });
    return;
  }

  // 10. Admin Update User (Role / Status)
  const userPatchMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (userPatchMatch && request.method === "PATCH") {
    const admin = requireAuth(request, store, ["admin"]);
    const targetUserId = userPatchMatch[1];
    const body = await readJsonBody(request);
    let updated = null;

    if (body.role) {
      updated = await store.updateUserRole(targetUserId, body.role);
      await audit.logEvent({
        userId: admin.id,
        userEmail: admin.email,
        action: "ROLE_UPDATED",
        status: "SUCCESS",
        details: `Updated role for user ${targetUserId} to ${body.role}`
      });
    }

    if (body.status) {
      updated = await store.setUserStatus(targetUserId, body.status);
      await audit.logEvent({
        userId: admin.id,
        userEmail: admin.email,
        action: "STATUS_UPDATED",
        status: "SUCCESS",
        details: `Updated status for user ${targetUserId} to ${body.status}`
      });
    }

    if (!updated) {
      updated = store.getUserById(targetUserId);
    }
    sendJson(response, 200, { user: updated });
    return;
  }

  // 11. Admin Reset User Password
  const userResetMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/reset-password$/);
  if (userResetMatch && request.method === "POST") {
    const admin = requireAuth(request, store, ["admin"]);
    const targetUserId = userResetMatch[1];
    const body = await readJsonBody(request);
    if (!body.newPassword) {
      const error = new Error("newPassword is required.");
      error.statusCode = 400;
      throw error;
    }
    await store.adminResetPassword(targetUserId, body.newPassword);
    await audit.logEvent({
      userId: admin.id,
      userEmail: admin.email,
      action: "ADMIN_RESET_PASSWORD",
      status: "SUCCESS",
      details: `Reset credentials for user ${targetUserId}`
    });
    sendJson(response, 200, { ok: true, message: "Password reset successfully." });
    return;
  }

  // 12. Audit Logs (Admin & Auditor)
  if (pathname === "/api/audit-logs" && request.method === "GET") {
    requireAuth(request, store, ["admin", "auditor"]);
    const limit = requestUrl.searchParams.get("limit") || 100;
    const logs = audit.getLogs({ limit });
    sendJson(response, 200, { logs });
    return;
  }

  // 13. System Status (Admin & Auditor)
  if (pathname === "/api/admin/system-status" && request.method === "GET") {
    requireAuth(request, store, ["admin", "auditor"]);
    const totalConversions = audit.logs.filter((item) => item.action === "CONVERSION").length;
    sendJson(response, 200, {
      status: "healthy",
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      memoryUsage: process.memoryUsage(),
      totalUsers: store.users.size,
      totalConversions
    });
    return;
  }

  // 14. SAP Business One connection status (no secrets are returned)
  if (pathname === "/api/connectors/sap/status" && request.method === "GET") {
    requireAuth(request, store, ["admin", "standard"]);
    sendJson(response, 200, {
      configured: Boolean(sap?.config?.configured),
      connectionName: sap?.config?.connectionName || "SAP Business One",
      problems: sap?.config?.configured ? [] : (sap?.config?.errors || [])
    });
    return;
  }

  // 15. Manual, operator-initiated SAP Business One withholding-tax pull
  if (pathname === "/api/connectors/sap/pull" && request.method === "POST") {
    const user = requireAuth(request, store, ["admin", "standard"]);
    if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
      sendJson(response, 415, { error: "Content-Type must be application/json." });
      return;
    }
    const body = await readJsonBody(request);
    const reportType = typeof body.reportType === "string" ? body.reportType.slice(0, 10) : "";
    const period = typeof body.period === "string" ? body.period.slice(0, 7) : "";
    const connectionName = sap?.config?.connectionName || "SAP Business One";
    const auditDetails = (outcome) =>
      `connector=SAPB1; connection=${connectionName}; period=${period}; ${outcome}`;

    try {
      if (!sap?.connector) {
        throw new ConnectorError("config", "The SAP Business One connection is not configured.", 503);
      }
      const pull = await sap.connector.pullWithholding({ reportType, period });
      const documentCount = pull.listings.reduce((sum, listing) => sum + listing.documents.length, 0);
      const scannedCount = pull.listings.reduce((sum, listing) => sum + (Number(listing.scannedCount) || 0), 0);
      await audit.logEvent({
        userId: user.id,
        userEmail: user.email,
        action: "SAP_PULL",
        reportType,
        recordCounts: { totalRows: scannedCount, validRecords: documentCount, errorCount: 0 },
        status: "SUCCESS",
        details: auditDetails(`range=${pull.from}..${pull.to}`)
      });
      sendJson(response, 200, pull);
    } catch (error) {
      if (!(error instanceof ConnectorError)) {
        throw error;
      }
      await audit.logEvent({
        userId: user.id,
        userEmail: user.email,
        action: "SAP_PULL",
        reportType,
        recordCounts: { totalRows: 0, validRecords: 0, errorCount: 1 },
        status: "FAILED",
        details: auditDetails(`error=${error.kind}`)
      });
      sendJson(response, error.statusCode, { error: error.message, kind: error.kind });
    }
    return;
  }

  sendJson(response, 404, { error: "Not found." });
}

function requireAuth(request, store, allowedRoles = null) {
  const token = getCookie(request, SESSION_COOKIE);
  const user = store.getSession(token);
  if (!user) {
    const error = new Error("Authentication required.");
    error.statusCode = 401;
    throw error;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const error = new Error("You do not have permission to access this resource.");
    error.statusCode = 403;
    throw error;
  }
  return user;
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let tooLarge = false;

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      if (tooLarge) {
        return;
      }
      body += chunk;
      if (Buffer.byteLength(body) > 16384) {
        tooLarge = true;
        const error = new Error("Request body is too large.");
        error.statusCode = 413;
        reject(error);
        request.resume();
      }
    });
    request.on("end", () => {
      if (tooLarge) {
        return;
      }
      try {
        const value = JSON.parse(body || "{}");
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          throw new Error("Request body must be a JSON object.");
        }
        resolve(value);
      } catch {
        const error = new Error("Request body must be a valid JSON object.");
        error.statusCode = 400;
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function getCookie(request, name) {
  const cookies = request.headers.cookie ? request.headers.cookie.split(";") : [];
  const cookie = cookies.find((item) => item.trim().startsWith(`${name}=`));
  return cookie ? cookie.trim().slice(name.length + 1) : "";
}

function createSessionCookie(token) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAge}`
  ];
  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function clearSessionCookie(response) {
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=0"];
  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  response.setHeader("Set-Cookie", parts.join("; "));
}

function writeSecurityHeaders(response) {
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
  );
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
}

function sendJson(response, statusCode, value) {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  response.end(body);
}

if (require.main === module) {
  const authStore = createAuthStore(
    process.env.DAT_AUTH_FILE || path.join(root, "data", "users.json")
  );
  const auditStore = createAuditStore(
    process.env.DAT_AUDIT_FILE || path.join(root, "data", "audit.json")
  );

  Promise.all([authStore.initialize(), auditStore.initialize()]).then(() => {
    const server = createServer(authStore, auditStore);
    const port = Number(process.env.PORT) || 3000;
    server.listen(port, "127.0.0.1", () => {
      console.log(`Excel to DAT Converter running at http://127.0.0.1:${port}`);
    });
  }).catch((error) => {
    console.error("Unable to initialize server storage:", error);
    process.exitCode = 1;
  });
}

module.exports = { createServer };
