const fs = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");
const {
  randomBytes,
  randomUUID,
  scrypt: scryptCallback,
  argon2: argon2Callback,
  timingSafeEqual,
  createHash
} = require("node:crypto");

const scrypt = promisify(scryptCallback);
const argon2Async = promisify(argon2Callback);

const isFastTest = process.env.NODE_ENV === "test" ||
  process.env.DAT_TEST_FAST_HASH === "1" ||
  process.execArgv.includes("--test");

const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS) || 8 * 60 * 60 * 1000;
const PASSWORD_BYTES = 64;
const ARGON2_MEMORY = Number(process.env.ARGON2_MEMORY) || (isFastTest ? 4096 : 64 * 1024);
const ARGON2_PASSES = Number(process.env.ARGON2_PASSES) || (isFastTest ? 2 : 3);
const ARGON2_PARALLELISM = 1;
const ARGON2_TAG_LENGTH = 32;

const VALID_ROLES = ["admin", "standard", "auditor"];
const VALID_STATUSES = ["active", "disabled"];

class AuthStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.users = new Map();
    this.sessions = new Map();
    this.writeQueue = Promise.resolve();
  }

  async initialize() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    let contents;
    try {
      contents = await fs.readFile(this.filePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        return;
      }
      throw error;
    }

    const records = JSON.parse(contents);
    if (!Array.isArray(records) || records.some((user) =>
      !user || typeof user.id !== "string" ||
      typeof user.name !== "string" ||
      typeof user.email !== "string" ||
      typeof user.salt !== "string" ||
      typeof user.passwordHash !== "string"
    )) {
      throw new Error("The account data file has an invalid format.");
    }

    let needsPersist = false;
    const usersList = records.map((record, index) => {
      const user = { ...record };
      if (!user.role || !VALID_ROLES.includes(user.role)) {
        // If first user, make admin, otherwise standard
        user.role = index === 0 ? "admin" : "standard";
        needsPersist = true;
      }
      if (!user.status || !VALID_STATUSES.includes(user.status)) {
        user.status = "active";
        needsPersist = true;
      }
      if (!user.algorithm) {
        user.algorithm = "scrypt";
        needsPersist = true;
      }
      if (!user.createdAt) {
        user.createdAt = new Date().toISOString();
        needsPersist = true;
      }
      return [user.email, user];
    });

    this.users = new Map(usersList);
    if (needsPersist) {
      await this.persist(this.users);
    }
  }

  register({ name, email, password, role = null }) {
    return this.serialize(async () => {
      const cleanName = typeof name === "string" ? name.trim() : "";
      const cleanEmail = normalizeEmail(email);
      validateCredentials(cleanName, cleanEmail, password);

      if (this.users.has(cleanEmail)) {
        const error = new Error("An account with this email already exists.");
        error.statusCode = 409;
        throw error;
      }

      // First registered user is automatically an admin if no users exist
      const assignedRole = role && VALID_ROLES.includes(role)
        ? role
        : (this.users.size === 0 ? "admin" : "standard");

      const salt = randomBytes(16);
      const passwordHash = await hashPasswordArgon2id(password, salt);
      const user = {
        id: randomUUID(),
        name: cleanName,
        email: cleanEmail,
        role: assignedRole,
        status: "active",
        algorithm: "argon2id",
        salt: salt.toString("hex"),
        passwordHash: passwordHash.toString("hex"),
        createdAt: new Date().toISOString(),
        lastLoginAt: null
      };

      const nextUsers = new Map(this.users);
      nextUsers.set(cleanEmail, user);
      await this.persist(nextUsers);
      this.users = nextUsers;
      return publicUser(user);
    });
  }

  async login({ email, password }) {
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail || typeof password !== "string" || password.length > 128) {
      return null;
    }

    const user = this.users.get(cleanEmail);
    if (!user) {
      // Perform a dummy argon2 calculation to resist timing analysis
      const dummySalt = Buffer.alloc(16);
      await hashPasswordArgon2id("DummyPassword!123", dummySalt);
      return null;
    }

    if (user.status === "disabled") {
      const error = new Error("This account has been disabled. Please contact an administrator.");
      error.statusCode = 403;
      throw error;
    }

    const salt = Buffer.from(user.salt, "hex");
    let isValid = false;
    let upgraded = false;

    if (user.algorithm === "argon2id") {
      const expected = Buffer.from(user.passwordHash, "hex");
      const actual = await hashPasswordArgon2id(password, salt);
      isValid = expected.length === actual.length && timingSafeEqual(expected, actual);
    } else {
      // Legacy scrypt verification
      const expected = Buffer.from(user.passwordHash, "hex");
      const actual = await scrypt(password, salt, PASSWORD_BYTES);
      isValid = expected.length === actual.length && timingSafeEqual(expected, actual);

      if (isValid) {
        // Upgrade legacy credential to Argon2id with a fresh salt
        const newSalt = randomBytes(16);
        const newHash = await hashPasswordArgon2id(password, newSalt);
        user.salt = newSalt.toString("hex");
        user.passwordHash = newHash.toString("hex");
        user.algorithm = "argon2id";
        upgraded = true;
      }
    }

    if (!isValid) {
      return null;
    }

    user.lastLoginAt = new Date().toISOString();
    if (upgraded || true) {
      await this.serialize(async () => {
        await this.persist(this.users);
      });
    }

    return publicUser(user);
  }

  createSession(user) {
    const token = randomBytes(32).toString("base64url");
    this.sessions.set(hashToken(token), {
      userId: user.id,
      role: user.role,
      expiresAt: Date.now() + SESSION_TTL_MS
    });
    return token;
  }

  getSession(token) {
    if (!token) {
      return null;
    }

    const key = hashToken(token);
    const session = this.sessions.get(key);
    if (!session) {
      return null;
    }
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(key);
      return null;
    }

    const user = [...this.users.values()].find((record) => record.id === session.userId);
    if (!user || user.status === "disabled") {
      this.sessions.delete(key);
      return null;
    }

    return publicUser(user);
  }

  deleteSession(token) {
    if (token) {
      this.sessions.delete(hashToken(token));
    }
  }

  invalidateUserSessions(userId) {
    if (!userId) return;
    for (const [key, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        this.sessions.delete(key);
      }
    }
  }

  listUsers() {
    return [...this.users.values()].map(publicUser);
  }

  getUserById(userId) {
    const user = [...this.users.values()].find((record) => record.id === userId);
    return user ? publicUser(user) : null;
  }

  updateUserRole(userId, newRole) {
    return this.serialize(async () => {
      if (!VALID_ROLES.includes(newRole)) {
        const error = new Error(`Role must be one of: ${VALID_ROLES.join(", ")}`);
        error.statusCode = 400;
        throw error;
      }

      const user = [...this.users.values()].find((record) => record.id === userId);
      if (!user) {
        const error = new Error("User not found.");
        error.statusCode = 404;
        throw error;
      }

      user.role = newRole;
      await this.persist(this.users);
      return publicUser(user);
    });
  }

  setUserStatus(userId, status) {
    return this.serialize(async () => {
      if (!VALID_STATUSES.includes(status)) {
        const error = new Error(`Status must be one of: ${VALID_STATUSES.join(", ")}`);
        error.statusCode = 400;
        throw error;
      }

      const user = [...this.users.values()].find((record) => record.id === userId);
      if (!user) {
        const error = new Error("User not found.");
        error.statusCode = 404;
        throw error;
      }

      user.status = status;
      if (status === "disabled") {
        this.invalidateUserSessions(userId);
      }

      await this.persist(this.users);
      return publicUser(user);
    });
  }

  adminResetPassword(userId, newPassword) {
    return this.serialize(async () => {
      validatePasswordComplexity(newPassword);

      const user = [...this.users.values()].find((record) => record.id === userId);
      if (!user) {
        const error = new Error("User not found.");
        error.statusCode = 404;
        throw error;
      }

      const salt = randomBytes(16);
      const passwordHash = await hashPasswordArgon2id(newPassword, salt);
      user.salt = salt.toString("hex");
      user.passwordHash = passwordHash.toString("hex");
      user.algorithm = "argon2id";

      this.invalidateUserSessions(userId);
      await this.persist(this.users);
      return publicUser(user);
    });
  }

  requestRecovery(email) {
    return this.serialize(async () => {
      const cleanEmail = normalizeEmail(email);
      const user = this.users.get(cleanEmail);
      if (!user || user.status === "disabled") {
        // Return dummy success to prevent user enumeration
        return { ok: true, message: "If an account exists, a recovery token has been generated." };
      }

      const token = randomBytes(24).toString("hex");
      user.recoveryTokenHash = hashToken(token);
      user.recoveryExpiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

      await this.persist(this.users);
      return {
        ok: true,
        message: "If an account exists, a recovery token has been generated.",
        token // Provided for operator display/testing in lieu of external mail service
      };
    });
  }

  resetPasswordWithRecovery(email, token, newPassword) {
    return this.serialize(async () => {
      const cleanEmail = normalizeEmail(email);
      validatePasswordComplexity(newPassword);

      const user = this.users.get(cleanEmail);
      if (!user || !user.recoveryTokenHash || !user.recoveryExpiresAt) {
        const error = new Error("Invalid or expired recovery token.");
        error.statusCode = 400;
        throw error;
      }

      if (user.recoveryExpiresAt <= Date.now()) {
        user.recoveryTokenHash = null;
        user.recoveryExpiresAt = null;
        await this.persist(this.users);
        const error = new Error("Recovery token has expired. Please request a new one.");
        error.statusCode = 400;
        throw error;
      }

      const expected = Buffer.from(user.recoveryTokenHash, "hex");
      const actual = Buffer.from(hashToken(token), "hex");
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        const error = new Error("Invalid recovery token.");
        error.statusCode = 400;
        throw error;
      }

      const salt = randomBytes(16);
      const passwordHash = await hashPasswordArgon2id(newPassword, salt);
      user.salt = salt.toString("hex");
      user.passwordHash = passwordHash.toString("hex");
      user.algorithm = "argon2id";
      user.recoveryTokenHash = null;
      user.recoveryExpiresAt = null;

      this.invalidateUserSessions(user.id);
      await this.persist(this.users);
      return publicUser(user);
    });
  }

  serialize(operation) {
    const result = this.writeQueue.then(operation);
    this.writeQueue = result.catch(() => {});
    return result;
  }

  async persist(users) {
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    const records = [...users.values()];
    try {
      await fs.writeFile(temporaryPath, `${JSON.stringify(records, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600
      });
      await fs.rename(temporaryPath, this.filePath);
    } catch (error) {
      await fs.rm(temporaryPath, { force: true });
      throw error;
    }
  }
}

async function hashPasswordArgon2id(password, salt) {
  return argon2Async("argon2id", {
    message: Buffer.from(password, "utf8"),
    nonce: salt,
    parallelism: ARGON2_PARALLELISM,
    memory: ARGON2_MEMORY,
    passes: ARGON2_PASSES,
    tagLength: ARGON2_TAG_LENGTH
  });
}

function createAuthStore(filePath) {
  return new AuthStore(filePath);
}

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function validatePasswordComplexity(password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 128) {
    const error = new Error("Password must be between 12 and 128 characters.");
    error.statusCode = 400;
    throw error;
  }
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  if (!hasUpper || !hasLower || !hasNumber || !hasSymbol) {
    const error = new Error(
      "Password must include uppercase, lowercase, numbers, and symbols."
    );
    error.statusCode = 400;
    throw error;
  }
}

function validateCredentials(name, email, password) {
  if (!name || name.length > 80) {
    const error = new Error("Enter a name between 1 and 80 characters.");
    error.statusCode = 400;
    throw error;
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error("Enter a valid email address.");
    error.statusCode = 400;
    throw error;
  }
  validatePasswordComplexity(password);
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role || "standard",
    status: user.status || "active",
    createdAt: user.createdAt || null,
    lastLoginAt: user.lastLoginAt || null
  };
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

module.exports = {
  createAuthStore,
  SESSION_TTL_MS,
  validatePasswordComplexity,
  VALID_ROLES,
  VALID_STATUSES
};
