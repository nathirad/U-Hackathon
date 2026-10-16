// Email + password accounts. Locally they live in a small JSON file (data/runtime/users.json,
// git-ignored). On serverless hosting the file system is read-only or wiped, so when the shared
// store is on (Upstash on Vercel) accounts live in it instead and survive across functions and
// restarts; the auth routes are wrapped with withStore. A real database is the next step.

import { randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config";
import { logEvent } from "../log";
import { sharedStoreEnabled, store } from "../store";

const scrypt = (pw: string, salt: Buffer, len: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(pw, salt, len, opts, (err, key) => (err ? reject(err) : resolve(key))));

const PARAMS = { N: 16384, r: 8, p: 1 };
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
  failedLogins: number;
  lockedUntil: number;
}

const g = globalThis as typeof globalThis & { __uguardUsers?: { users: UserRecord[] | null; writing: Promise<void> } };
const state = (g.__uguardUsers ??= { users: null, writing: Promise.resolve() });
const file = () => path.join(process.cwd(), config.auth.dataDir, "users.json");

async function load(): Promise<UserRecord[]> {
  if (sharedStoreEnabled) return store.accounts;
  if (state.users) return state.users;
  try {
    state.users = (JSON.parse(await readFile(file(), "utf8")) as { users: UserRecord[] }).users ?? [];
  } catch {
    state.users = [];
  }
  return state.users;
}

async function save(): Promise<void> {
  if (sharedStoreEnabled) return; // withStore saves the snapshot after the route
  const users = state.users ?? [];
  state.writing = state.writing.then(async () => {
    try {
      await mkdir(path.dirname(file()), { recursive: true });
      const tmp = `${file()}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify({ users }, null, 2), { mode: 0o600 });
      await rename(tmp, file());
    } catch (err) {
      logEvent("auth.store_write_failed", { error: (err as Error).message });
    }
  });
  await state.writing;
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [, n, r, p, salt, key] = stored.split("$");
  const expected = Buffer.from(key, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Verified against when the email is unknown, so timing does not reveal which emails exist.
let dummyHash: Promise<string> | null = null;

export function emailProblem(email: unknown): string | null {
  return typeof email === "string" && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? null : "Enter a valid email address.";
}

export function passwordProblem(password: unknown, email = ""): string | null {
  if (typeof password !== "string" || password.length < 10) return "Use at least 10 characters.";
  if (password.length > 128) return "That password is too long.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Use both letters and numbers.";
  const local = email.split("@")[0]?.toLowerCase();
  if (local && local.length >= 3 && password.toLowerCase().includes(local)) return "Don't include your email name in the password.";
  return null;
}

export async function createUser(input: { email: string; name: string; password: string }): Promise<UserRecord | { error: string }> {
  const email = input.email.trim().toLowerCase();
  const users = await load();
  if (users.some((u) => u.email === email)) return { error: "An account with this email already exists. Sign in instead." };
  const user: UserRecord = {
    id: randomUUID(),
    email,
    name: input.name.trim().slice(0, 60) || email.split("@")[0],
    passwordHash: await hashPassword(input.password),
    createdAt: new Date().toISOString(),
    failedLogins: 0,
    lockedUntil: 0,
  };
  users.push(user);
  await save();
  return user;
}

export async function authenticate(emailRaw: string, password: string): Promise<UserRecord | { error: string; status: number }> {
  const email = emailRaw.trim().toLowerCase();
  const user = (await load()).find((u) => u.email === email);
  if (user && user.lockedUntil > Date.now()) {
    const minutes = Math.ceil((user.lockedUntil - Date.now()) / 60_000);
    return { error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`, status: 423 };
  }
  dummyHash ??= hashPassword("timing-equaliser-1");
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
  if (!user || !ok) {
    if (user) {
      user.failedLogins += 1;
      if (user.failedLogins >= MAX_FAILS) {
        user.failedLogins = 0;
        user.lockedUntil = Date.now() + LOCK_MS;
      }
      await save();
    }
    return { error: "Email or password is incorrect.", status: 401 };
  }
  if (user.failedLogins || user.lockedUntil) {
    user.failedLogins = 0;
    user.lockedUntil = 0;
    await save();
  }
  return user;
}
