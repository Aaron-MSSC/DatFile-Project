const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const { scrypt: scryptCallback, randomBytes, randomUUID } = require("node:crypto");
const { createAuthStore } = require("../auth");
const { createAuditStore } = require("../audit");
const { createServer } = require("../server");

const scrypt = promisify(scryptCallback);

test("Phase 1: Password security, Argon2id, complexity, RBAC, dashboards, recovery, and audit logging", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dat-auth-phase1-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const storePath = path.join(directory, "users.json");
  const auditPath = path.join(directory, "audit.json");

  const store = createAuthStore(storePath);
  const audit = createAuditStore(auditPath);
  await store.initialize();
  await audit.initialize();

  const server = createServer(store, audit);
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

  async function get(url, cookie) {
    return fetch(`${baseUrl}${url}`, {
      headers: cookie ? { Cookie: cookie } : {}
    });
  }

  async function patch(url, payload, cookie) {
    return fetch(`${baseUrl}${url}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {})
      },
      body: JSON.stringify(payload)
    });
  }

  // --- 1. Password Complexity Rules ---
  // Too short (< 12)
  const shortRes = await post("/api/register", {
    name: "Short Pass",
    email: "short@example.com",
    password: "Short1!"
  });
  assert.equal(shortRes.status, 400);

  // Missing uppercase
  const noUpperRes = await post("/api/register", {
    name: "No Upper",
    email: "noupper@example.com",
    password: "password123456!"
  });
  assert.equal(noUpperRes.status, 400);

  // Missing lowercase
  const noLowerRes = await post("/api/register", {
    name: "No Lower",
    email: "nolower@example.com",
    password: "PASSWORD123456!"
  });
  assert.equal(noLowerRes.status, 400);

  // Missing number
  const noNumRes = await post("/api/register", {
    name: "No Num",
    email: "nonum@example.com",
    password: "PasswordWithoutNumber!"
  });
  assert.equal(noNumRes.status, 400);

  // Missing symbol
  const noSymRes = await post("/api/register", {
    name: "No Symbol",
    email: "nosym@example.com",
    password: "Password12345678"
  });
  assert.equal(noSymRes.status, 400);

  // --- 2. First User Registration (Becomes Admin) ---
  const adminReg = await post("/api/register", {
    name: "Admin User",
    email: "Admin@Example.com",
    password: "AdminPassword!1234"
  });
  assert.equal(adminReg.status, 201);
  const adminData = (await adminReg.json()).user;
  assert.equal(adminData.role, "admin");
  assert.equal(adminData.email, "admin@example.com");
  assert.equal("passwordHash" in adminData, false);
  const adminCookie = adminReg.headers.get("set-cookie").split(";")[0];

  // Verify internal user record uses Argon2id and unique salt
  const savedAdmin = store.users.get("admin@example.com");
  assert.equal(savedAdmin.algorithm, "argon2id");
  assert.ok(savedAdmin.salt && savedAdmin.salt.length === 32); // 16 bytes hex

  // --- 3. Second User Registration (Becomes Standard User) ---
  const userReg = await post("/api/register", {
    name: "Standard User",
    email: "user@example.com",
    password: "UserPassword!1234"
  });
  assert.equal(userReg.status, 201);
  const userData = (await userReg.json()).user;
  assert.equal(userData.role, "standard");
  const userCookie = userReg.headers.get("set-cookie").split(";")[0];

  // --- 4. Admin Creates an Auditor User ---
  const auditorCreate = await post("/api/admin/users", {
    name: "Auditor User",
    email: "auditor@example.com",
    password: "AuditorPassword!1234",
    role: "auditor"
  }, adminCookie);
  assert.equal(auditorCreate.status, 201);
  const auditorData = (await auditorCreate.json()).user;
  assert.equal(auditorData.role, "auditor");

  // Auditor Login
  const auditorLogin = await post("/api/login", {
    email: "auditor@example.com",
    password: "AuditorPassword!1234"
  });
  assert.equal(auditorLogin.status, 200);
  const auditorCookie = auditorLogin.headers.get("set-cookie").split(";")[0];

  // --- 5. RBAC Endpoint Restrictions ---
  // Standard user tries to access admin user list -> 403 Forbidden
  const standardUsersRes = await get("/api/admin/users", userCookie);
  assert.equal(standardUsersRes.status, 403);

  // Standard user tries to access audit logs -> 403 Forbidden
  const standardAuditRes = await get("/api/audit-logs", userCookie);
  assert.equal(standardAuditRes.status, 403);

  // Auditor tries to access admin user list -> 403 Forbidden
  const auditorUsersRes = await get("/api/admin/users", auditorCookie);
  assert.equal(auditorUsersRes.status, 403);

  // Auditor CAN access audit logs -> 200 OK
  const auditorAuditRes = await get("/api/audit-logs", auditorCookie);
  assert.equal(auditorAuditRes.status, 200);

  // Auditor CAN access system status -> 200 OK
  const auditorStatusRes = await get("/api/admin/system-status", auditorCookie);
  assert.equal(auditorStatusRes.status, 200);
  const statusBody = await auditorStatusRes.json();
  assert.equal(statusBody.status, "healthy");
  assert.ok(statusBody.uptimeSeconds >= 0);

  // Admin CAN access admin user list -> 200 OK
  const adminUsersRes = await get("/api/admin/users", adminCookie);
  assert.equal(adminUsersRes.status, 200);
  const userList = (await adminUsersRes.json()).users;
  assert.equal(userList.length, 3);

  // --- 6. Account Enable / Disable & Session Invalidation ---
  // Admin disables Standard User
  const disableRes = await patch(`/api/admin/users/${userData.id}`, { status: "disabled" }, adminCookie);
  assert.equal(disableRes.status, 200);
  assert.equal((await disableRes.json()).user.status, "disabled");

  // Standard user's existing session is immediately revoked
  const disabledSessionRes = await get("/api/session", userCookie);
  assert.equal((await disabledSessionRes.json()).user, null);

  // Standard user cannot log in while disabled
  const disabledLoginRes = await post("/api/login", {
    email: "user@example.com",
    password: "UserPassword!1234"
  });
  assert.equal(disabledLoginRes.status, 403);

  // Admin re-enables Standard User
  const enableRes = await patch(`/api/admin/users/${userData.id}`, { status: "active" }, adminCookie);
  assert.equal(enableRes.status, 200);

  // Standard user can now log in again
  const reenabledLogin = await post("/api/login", {
    email: "user@example.com",
    password: "UserPassword!1234"
  });
  assert.equal(reenabledLogin.status, 200);
  const reenabledUserCookie = reenabledLogin.headers.get("set-cookie").split(";")[0];

  // --- 7. Admin Password Reset & Invalidation ---
  const resetRes = await post(`/api/admin/users/${userData.id}/reset-password`, {
    newPassword: "BrandNewPassword!999"
  }, adminCookie);
  assert.equal(resetRes.status, 200);

  // Old session invalidated
  const invalidatedSession = await get("/api/session", reenabledUserCookie);
  assert.equal((await invalidatedSession.json()).user, null);

  // Old password fails
  const oldPassLogin = await post("/api/login", {
    email: "user@example.com",
    password: "UserPassword!1234"
  });
  assert.equal(oldPassLogin.status, 401);

  // New password succeeds
  const newPassLogin = await post("/api/login", {
    email: "user@example.com",
    password: "BrandNewPassword!999"
  });
  assert.equal(newPassLogin.status, 200);
  const currentStdCookie = newPassLogin.headers.get("set-cookie").split(";")[0];

  // --- 8. Account Self-Service Recovery Workflow ---
  const recoverReq = await post("/api/auth/recover-request", { email: "user@example.com" });
  assert.equal(recoverReq.status, 200);
  const token = (await recoverReq.json()).token;
  assert.ok(token);

  // Reset password using recovery token
  const recoverReset = await post("/api/auth/recover-reset", {
    email: "user@example.com",
    recoveryToken: token,
    newPassword: "RecoveredPass!7890"
  });
  assert.equal(recoverReset.status, 200);

  // Login with recovered password
  const recoveredLogin = await post("/api/login", {
    email: "user@example.com",
    password: "RecoveredPass!7890"
  });
  assert.equal(recoveredLogin.status, 200);
  const activeUserCookie = recoveredLogin.headers.get("set-cookie").split(";")[0];

  // --- 9. Conversion Audit Logging & Strict Taxpayer Privacy ---
  const conversionRes = await post("/api/audit/conversion", {
    reportType: "1601EQ",
    recordCounts: { totalRows: 50, validRecords: 50, errorCount: 0 },
    controlTotals: { taxBase: 500000.00, taxWithheld: 10000.00 },
    status: "SUCCESS"
  }, activeUserCookie);
  assert.equal(conversionRes.status, 201);

  // Standard user can view their recent exports
  const recentExportsRes = await get("/api/user/recent-exports", activeUserCookie);
  assert.equal(recentExportsRes.status, 200);
  const exportsData = (await recentExportsRes.json()).recentExports;
  assert.ok(exportsData.length >= 1);
  assert.equal(exportsData[0].reportType, "1601EQ");
  assert.equal(exportsData[0].recordCounts.totalRows, 50);

  // Auditor inspects audit log
  const auditLogsRes = await get("/api/audit-logs", auditorCookie);
  assert.equal(auditLogsRes.status, 200);
  const logs = (await auditLogsRes.json()).logs;
  assert.ok(logs.some((l) => l.action === "CONVERSION"));

  // Verify that NO taxpayer identification number (TIN) or sensitive personal names exist anywhere in audit entries
  for (const log of logs) {
    assert.equal("tin" in log, false);
    assert.equal("taxpayer" in log, false);
    assert.equal("agentTin" in log, false);
  }

  // --- 10. Backward Compatibility: Transparent scrypt to Argon2id Migration ---
  // Create a legacy user with scrypt hash directly in the data store file
  const legacySalt = randomBytes(16);
  const legacyScryptHash = await scrypt("LegacyPassword!123", legacySalt, 64);
  const legacyUser = {
    id: randomUUID(),
    name: "Legacy User",
    email: "legacy@example.com",
    role: "standard",
    status: "active",
    algorithm: "scrypt",
    salt: legacySalt.toString("hex"),
    passwordHash: legacyScryptHash.toString("hex"),
    createdAt: new Date().toISOString()
  };

  store.users.set(legacyUser.email, legacyUser);
  await store.persist(store.users);

  // Log in as legacy user with scrypt hash
  const legacyLogin = await post("/api/login", {
    email: "legacy@example.com",
    password: "LegacyPassword!123"
  });
  assert.equal(legacyLogin.status, 200);

  // Verify the record in store was transparently upgraded to Argon2id!
  const upgradedRecord = store.users.get("legacy@example.com");
  assert.equal(upgradedRecord.algorithm, "argon2id");
  assert.notEqual(upgradedRecord.salt, legacySalt.toString("hex")); // Fresh salt generated

  // Second login uses Argon2id and succeeds
  const secondLogin = await post("/api/login", {
    email: "legacy@example.com",
    password: "LegacyPassword!123"
  });
  assert.equal(secondLogin.status, 200);
});
