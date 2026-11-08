const fs = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");
const {
  randomBytes,
  randomUUID,
  scrypt: scryptCallback,
  timingSafeEqual,
  createHash
} = require("node:crypto");

const scrypt = promisify(scryptCallback);
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const PASSWORD_BYTES = 64;

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

    this.users = new Map(records.map((user) => [user.email, user]));
  }

  register({ name, email, password }) {
    return this.serialize(async () => {
      const cleanName = typeof name === "string" ? name.trim() : "";
      const cleanEmail = normalizeEmail(email);
      validateCredentials(cleanName, cleanEmail, password);

      if (this.users.has(cleanEmail)) {
        const error = new Error("An account with this email already exists.");
        error.statusCode = 409;
        throw error;
      }

      const salt = randomBytes(16);
      const passwordHash = await scrypt(password, salt, PASSWORD_BYTES);
      const user = {
        id: randomUUID(),
        name: cleanName,
        email: cleanEmail,
        salt: salt.toString("hex"),
        passwordHash: passwordHash.toString("hex")
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
    const salt = user ? Buffer.from(user.salt, "hex") : Buffer.alloc(16);
    const expected = user
      ? Buffer.from(user.passwordHash, "hex")
      : Buffer.alloc(PASSWORD_BYTES);
    const actual = await scrypt(password, salt, PASSWORD_BYTES);

    if (!user || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return null;
    }
    return publicUser(user);
  }

  createSession(user) {
    const token = randomBytes(32).toString("base64url");
    this.sessions.set(hashToken(token), {
      userId: user.id,
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
    return user ? publicUser(user) : null;
  }

  deleteSession(token) {
    if (token) {
      this.sessions.delete(hashToken(token));
    }
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

function createAuthStore(filePath) {
  return new AuthStore(filePath);
}

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
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
  if (typeof password !== "string" || password.length < 12 || password.length > 128) {
    const error = new Error("Password must be between 12 and 128 characters.");
    error.statusCode = 400;
    throw error;
  }
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

module.exports = { createAuthStore, SESSION_TTL_MS };
