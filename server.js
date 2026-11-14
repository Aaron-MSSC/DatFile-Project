const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { createAuthStore } = require("./auth");

const root = __dirname;
const SESSION_COOKIE = "dat_converter_session";
const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/auth-client.js", ["auth-client.js", "text/javascript; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/converter.js", ["converter.js", "text/javascript; charset=utf-8"]],
  ["/schemas/1601EQ-return.schema.json", ["Documentation/SQL_to_JSON/1601EQ-return.schema.json", "application/json; charset=utf-8"]],
  ["/schemas/2550M.schema.json", ["Documentation/SQL_to_JSON/2550M.schema.json", "application/json; charset=utf-8"]],
  ["/schemas/2550Q.schema.json", ["Documentation/SQL_to_JSON/2550Q.schema.json", "application/json; charset=utf-8"]],
  ["/vendor/xlsx.full.min.js", ["node_modules/xlsx/dist/xlsx.full.min.js", "text/javascript; charset=utf-8"]]
]);

function createServer(authStore) {
  const store = authStore || createAuthStore(
    process.env.DAT_AUTH_FILE || path.join(root, "data", "users.json")
  );

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
        await handleApiRequest(request, response, requestUrl.pathname, store);
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

async function handleApiRequest(request, response, pathname, store) {
  writeSecurityHeaders(response);
  response.setHeader("Cache-Control", "no-store");

  if (pathname === "/api/session" && request.method === "GET") {
    const token = getCookie(request, SESSION_COOKIE);
    sendJson(response, 200, { user: store.getSession(token) });
    return;
  }

  if (pathname === "/api/logout" && request.method === "POST") {
    store.deleteSession(getCookie(request, SESSION_COOKIE));
    clearSessionCookie(response);
    sendJson(response, 200, { ok: true });
    return;
  }

  if ((pathname === "/api/register" || pathname === "/api/login") &&
      request.method === "POST") {
    const body = await readJsonBody(request);
    let user;
    let statusCode = 200;

    if (pathname === "/api/register") {
      user = await store.register(body);
      statusCode = 201;
    } else {
      user = await store.login(body);
      if (!user) {
        sendJson(response, 401, { error: "Email or password is incorrect." });
        return;
      }
    }

    response.setHeader("Set-Cookie", createSessionCookie(store.createSession(user)));
    sendJson(response, statusCode, { user });
    return;
  }

  sendJson(response, 404, { error: "Not found." });
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
      if (Buffer.byteLength(body) > 8192) {
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
        const value = JSON.parse(body);
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
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=28800"
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
  authStore.initialize().then(() => {
    const server = createServer(authStore);
    const port = Number(process.env.PORT) || 3000;
    server.listen(port, "127.0.0.1", () => {
      console.log(`Excel to DAT Converter running at http://127.0.0.1:${port}`);
    });
  }).catch((error) => {
    console.error("Unable to initialize account storage:", error);
    process.exitCode = 1;
  });
}

module.exports = { createServer };
