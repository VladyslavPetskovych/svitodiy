import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getRedis } from "./redisClient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PREFIX = "svitodiy";
// Усі ключі бота. Бекап типобезпечний (hash/string/zset/set/list), тож
// зберігається ВЕСЬ прогрес користувача, а не лише баланс/інвентар.
const ALL_MATCH = `${PREFIX}:*`;
const BACKUP_INTERVAL_MS = Number(process.env.REDIS_BACKUP_INTERVAL_MS || 2 * 60_000);
const BACKUP_FILE = process.env.REDIS_BACKUP_FILE
  ? path.resolve(process.env.REDIS_BACKUP_FILE)
  : path.resolve(__dirname, "../../data/redis-user-backup.json");
// Скільки добових архівів тримати (по одному файлу на день).
const KEEP_DAYS = Math.max(1, Number(process.env.REDIS_BACKUP_KEEP_DAYS || 14));
const ARCHIVE_DIR = path.join(path.dirname(BACKUP_FILE), "archive");

function nowIso() {
  return new Date().toISOString();
}

/** YYYY-MM-DD за локальним часом (для назви добового архіву). */
function dateStamp(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Серіалізує один ключ будь-якого типу у звичайний JSON-об'єкт.
 * @returns {Promise<{ type: string, pttl: number, value: any } | null>}
 */
async function dumpKey(r, key) {
  const type = await r.type(key);
  if (type === "none") return null;
  const pttl = await r.pTTL(key); // -1 = без TTL, -2 = ключа нема
  let value;
  switch (type) {
    case "hash":
      value = await r.hGetAll(key);
      break;
    case "string":
      value = await r.get(key);
      break;
    case "zset":
      value = await r.zRangeWithScores(key, 0, -1); // [{ value, score }]
      break;
    case "set":
      value = await r.sMembers(key);
      break;
    case "list":
      value = await r.lRange(key, 0, -1);
      break;
    default:
      return null; // невідомий тип — пропускаємо
  }
  return { type, pttl: typeof pttl === "number" ? pttl : -1, value };
}

/** Відновлює один ключ із серіалізованого вигляду. @returns {Promise<boolean>} */
async function restoreKey(r, key, entry) {
  if (!entry || typeof entry !== "object") return false;
  const { type, pttl, value } = entry;
  switch (type) {
    case "hash": {
      if (!value || typeof value !== "object" || Object.keys(value).length === 0) return false;
      await r.hSet(key, value);
      break;
    }
    case "string": {
      if (value == null) return false;
      await r.set(key, String(value));
      break;
    }
    case "zset": {
      if (!Array.isArray(value) || value.length === 0) return false;
      await r.zAdd(
        key,
        value.map((m) => ({ score: Number(m.score), value: String(m.value) }))
      );
      break;
    }
    case "set": {
      if (!Array.isArray(value) || value.length === 0) return false;
      await r.sAdd(key, value.map(String));
      break;
    }
    case "list": {
      if (!Array.isArray(value) || value.length === 0) return false;
      await r.rPush(key, value.map(String));
      break;
    }
    default:
      return false;
  }
  if (typeof pttl === "number" && pttl > 0) {
    await r.pExpire(key, pttl);
  }
  return true;
}

async function collectAllKeys() {
  const r = getRedis();
  /** @type {Record<string, { type: string, pttl: number, value: any }>} */
  const out = {};
  for await (const key of r.scanIterator({ MATCH: ALL_MATCH, COUNT: 200 })) {
    const entry = await dumpKey(r, key);
    if (entry) out[key] = entry;
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

/** Добовий архів: один файл на день (перезаписується свіжим станом дня). */
async function writeDailyArchive(payload) {
  const file = path.join(ARCHIVE_DIR, `backup-${dateStamp()}.json`);
  await writeJsonAtomic(file, payload);
  await pruneArchives();
}

/** Лишаємо лише останні KEEP_DAYS добових архівів. */
async function pruneArchives() {
  let entries;
  try {
    entries = await fs.readdir(ARCHIVE_DIR);
  } catch {
    return;
  }
  const backups = entries
    .filter((n) => /^backup-\d{4}-\d{2}-\d{2}\.json$/.test(n))
    .sort(); // ISO-дати сортуються лексикографічно = хронологічно
  const excess = backups.length - KEEP_DAYS;
  for (let i = 0; i < excess; i++) {
    await fs.rm(path.join(ARCHIVE_DIR, backups[i]), { force: true }).catch(() => {});
  }
}

export async function backupUserData() {
  const keys = await collectAllKeys();
  const count = Object.keys(keys).length;

  // Запобіжник: ніколи не перезаписувати непорожній бекап порожнім.
  // Інакше, якщо Redis раптом очистився (а бот ще живий), наступний тік
  // затер би живий бекап нулем — і прогрес зник би назавжди.
  if (count === 0) {
    const existing = await readBackupFile();
    const existingCount =
      existing && existing.keys ? Object.keys(existing.keys).length : 0;
    if (existingCount > 0) {
      console.warn(
        `[backup] redis empty but backup has ${existingCount} keys — skip overwrite to avoid data loss`
      );
      return;
    }
  }

  const payload = {
    version: 2,
    createdAt: nowIso(),
    keys,
  };
  await writeJsonAtomic(BACKUP_FILE, payload);
  console.log(`[backup] saved ${count} keys -> ${BACKUP_FILE}`);

  // Добовий архів — лише коли є що зберігати.
  if (count > 0) {
    await writeDailyArchive(payload).catch((err) =>
      console.error("[backup] daily archive failed:", err.message)
    );
  }
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

async function hasAnyData() {
  const r = getRedis();
  for await (const _ of r.scanIterator({ MATCH: ALL_MATCH, COUNT: 1 })) {
    return true;
  }
  return false;
}

/** Відновлення зі старого формату (version 1): лише user + inv як hash. */
async function restoreLegacyV1(r, backup) {
  const users = backup.users && typeof backup.users === "object" ? backup.users : {};
  const inventory = backup.inventory && typeof backup.inventory === "object" ? backup.inventory : {};
  let restored = 0;
  for (const [key, hash] of [...Object.entries(users), ...Object.entries(inventory)]) {
    if (hash && typeof hash === "object" && Object.keys(hash).length > 0) {
      await r.hSet(key, hash);
      restored += 1;
    }
  }
  return restored;
}

export async function restoreUserDataIfRedisEmpty() {
  if (await hasAnyData()) {
    console.log("[backup] redis already has data, restore skipped");
    return { restored: false, keys: 0 };
  }

  const backup = await readBackupFile();
  if (!backup || typeof backup !== "object") {
    console.log("[backup] no local backup found, restore skipped");
    return { restored: false, keys: 0 };
  }

  const r = getRedis();
  let restored = 0;

  if (backup.keys && typeof backup.keys === "object") {
    for (const [key, entry] of Object.entries(backup.keys)) {
      try {
        if (await restoreKey(r, key, entry)) restored += 1;
      } catch (err) {
        console.error(`[backup] restore failed for ${key}:`, err.message);
      }
    }
  } else {
    // Старий формат бекапу.
    restored = await restoreLegacyV1(r, backup);
  }

  console.log(`[backup] restored ${restored} keys from ${BACKUP_FILE}`);
  return { restored: true, keys: restored };
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
