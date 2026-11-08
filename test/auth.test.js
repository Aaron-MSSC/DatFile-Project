const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createAuthStore } = require("../auth");
const { createServer } = require("../server");

test("registration, login, session, and logout work over the HTTP API", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dat-auth-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const storePath = path.join(directory, "users.json");
  const store = createAuthStore(storePath);
  await store.initialize();
  const server = createServer(store);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  async function post(url, payload, cookie) {
    return fetch(`${baseUrl}${url}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {})
      },
      body: JSON.stringify(payload)
    });
  }

  const invalidRegistration = await post("/api/register", {
    name: "Test User",
    email: "test@example.com",
    password: "short"
  });
  assert.equal(invalidRegistration.status, 400);

  const registration = await post("/api/register", {
    name: "Test User",
    email: "Test@Example.com",
    password: "a secure password"
  });
  assert.equal(registration.status, 201);
  const registeredUser = (await registration.json()).user;
  assert.equal(registeredUser.email, "test@example.com");
  assert.equal(registeredUser.name, "Test User");
  assert.equal("passwordHash" in registeredUser, false);

  const cookie = registration.headers.get("set-cookie").split(";")[0];
  const currentSession = await fetch(`${baseUrl}/api/session`, {
    headers: { Cookie: cookie }
  });
  assert.equal((await currentSession.json()).user.id, registeredUser.id);

  const duplicateRegistration = await post("/api/register", {
    name: "Another User",
    email: "test@example.com",
    password: "another secure password"
  });
  assert.equal(duplicateRegistration.status, 409);

  const failedLogin = await post("/api/login", {
    email: "test@example.com",
    password: "incorrect password"
  });
  assert.equal(failedLogin.status, 401);

  const restartedStore = createAuthStore(storePath);
  await restartedStore.initialize();
  const restartedServer = createServer(restartedStore);
  await new Promise((resolve, reject) => {
    restartedServer.once("error", reject);
    restartedServer.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve, reject) => {
    restartedServer.close((error) => error ? reject(error) : resolve());
  }));

  const login = await fetch(`http://127.0.0.1:${restartedServer.address().port}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "test@example.com", password: "a secure password" })
  });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).user.id, registeredUser.id);
  const loginCookie = login.headers.get("set-cookie").split(";")[0];

  const logout = await post("/api/logout", {}, cookie);
  assert.equal(logout.status, 200);
  const loggedOutSession = await fetch(`${baseUrl}/api/session`, {
    headers: { Cookie: cookie }
  });
  assert.equal((await loggedOutSession.json()).user, null);
  assert.ok(logout.headers.get("set-cookie").includes("Max-Age=0"));
  assert.ok(loginCookie.startsWith("dat_converter_session="));
});
