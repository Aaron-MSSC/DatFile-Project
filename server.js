const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/converter.js", ["converter.js", "text/javascript; charset=utf-8"]],
  ["/vendor/xlsx.full.min.js", ["node_modules/xlsx/dist/xlsx.full.min.js", "text/javascript; charset=utf-8"]]
]);

const server = http.createServer((request, response) => {
  const file = files.get(new URL(request.url, "http://localhost").pathname);

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

    response.writeHead(200, {
      "Content-Type": file[1],
      "Content-Length": stat.size,
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    fs.createReadStream(filePath).pipe(response);
  });
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, "127.0.0.1", () => {
  console.log(`Excel to DAT Converter running at http://127.0.0.1:${port}`);
});
