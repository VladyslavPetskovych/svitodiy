import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getRedis } from "./redisClient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PREFIX = "svitodiy";
const USER_MATCH = `${PREFIX}:user:*`;
const INV_MATCH = `${PREFIX}:inv:*`;
const BACKUP_INTERVAL_MS = Number(process.env.REDIS_BACKUP_INTERVAL_MS || 5 * 60_000);
const BACKUP_FILE = process.env.REDIS_BACKUP_FILE
  ? path.resolve(process.env.REDIS_BACKUP_FILE)
  : path.resolve(__dirname, "../../data/redis-user-backup.json");

function nowIso() {
  return new Date().toISOString();
}

async function collectHashes(matchPattern) {
  const r = getRedis();
  const out = {};
  for await (const key of r.scanIterator({ MATCH: matchPattern, COUNT: 200 })) {
    out[key] = await r.hGetAll(key);
  }
  return out;
}

async function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmpPath, filePath);
}

export async function backupUserData() {
  const payload = {
    version: 1,
    createdAt: nowIso(),
    users: await collectHashes(USER_MATCH),
    inventory: await collectHashes(INV_MATCH),
  };
  await writeJsonAtomic(BACKUP_FILE, payload);
  const userCount = Object.keys(payload.users).length;
  const invCount = Object.keys(payload.inventory).length;
  console.log(`[backup] saved ${userCount} users and ${invCount} inventories -> ${BACKUP_FILE}`);
}

async function readBackupFile() {
  try {
    const raw = await fs.readFile(BACKUP_FILE, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
}

async function hasAnyUserData() {
  const r = getRedis();
  for await (const _ of r.scanIterator({ MATCH: USER_MATCH, COUNT: 1 })) {
    return true;
  }
  for await (const _ of r.scanIterator({ MATCH: INV_MATCH, COUNT: 1 })) {
    return true;
  }
  return false;
}

export async function restoreUserDataIfRedisEmpty() {
  const hasData = await hasAnyUserData();
  if (hasData) {
    console.log("[backup] redis already has data, restore skipped");
    return { restored: false, users: 0, inventories: 0 };
  }

  const backup = await readBackupFile();
  if (!backup || typeof backup !== "object") {
    console.log("[backup] no local backup found, restore skipped");
    return { restored: false, users: 0, inventories: 0 };
  }

  const r = getRedis();
  const users = backup.users && typeof backup.users === "object" ? backup.users : {};
  const inventory = backup.inventory && typeof backup.inventory === "object" ? backup.inventory : {};

  let restoredUsers = 0;
  for (const [key, hash] of Object.entries(users)) {
    if (hash && Object.keys(hash).length > 0) {
      await r.hSet(key, hash);
      restoredUsers += 1;
    }
  }

  let restoredInventory = 0;
  for (const [key, hash] of Object.entries(inventory)) {
    if (hash && Object.keys(hash).length > 0) {
      await r.hSet(key, hash);
      restoredInventory += 1;
    }
  }

  console.log(
    `[backup] restored ${restoredUsers} users and ${restoredInventory} inventories from ${BACKUP_FILE}`
  );
  return { restored: true, users: restoredUsers, inventories: restoredInventory };
}

export function startUserBackupLoop() {
  const timer = setInterval(() => {
    backupUserData().catch((err) => console.error("[backup] periodic backup failed:", err.message));
  }, BACKUP_INTERVAL_MS);
  if (typeof timer.unref === "function") timer.unref();
  console.log(`[backup] periodic backup every ${BACKUP_INTERVAL_MS}ms -> ${BACKUP_FILE}`);

  return async () => {
    clearInterval(timer);
    await backupUserData();
  };
}
