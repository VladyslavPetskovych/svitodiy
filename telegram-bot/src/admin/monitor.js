import fs from "fs/promises";
import os from "os";
import { getRedis } from "../redisClient.js";
import { listContainers } from "./docker.js";
import { bar, escapeHtml, fmtBytes, fmtDuration, fmtTime, light, sleep } from "./format.js";

/**
 * Моніторинг сервера для розділу «Адмін».
 *
 * Бот живе в Docker-контейнері, тому читаємо /proc хоста (HOST_PROC, read-only),
 * а /app/data змонтована з диска хоста — звідси видно стан сервера загалом.
 */

const PREFIX = "svitodiy:sys";
const STARTS_KEY = `${PREFIX}:bot_starts`;
const STARTS_KEEP = 20;
const PROC = process.env.HOST_PROC || "/proc";
const DISK_PATH = process.env.MONITOR_DISK_PATH || "/app/data";

/** Помилки з моменту запуску процесу (у пам'яті — після рестарту обнуляються). */
let errorCount = 0;
/** @type {{ at: Date, message: string } | null} */
let lastError = null;

export function recordBotError(err) {
  errorCount += 1;
  const message = err instanceof Error ? err.message : String(err);
  lastError = { at: new Date(), message: message.slice(0, 300) };
}

/** Пишемо кожен запуск у Redis, щоб бачити, чи бот падав і перезапускався. */
export async function recordBotStart() {
  try {
    const r = getRedis();
    await r.lPush(STARTS_KEY, new Date().toISOString());
    await r.lTrim(STARTS_KEY, 0, STARTS_KEEP - 1);
  } catch (err) {
    console.error("[monitor] recordBotStart", err.message);
  }
}

async function readProc(file) {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
}

/** @returns {Promise<{ totalKb: number, availableKb: number, swapTotalKb: number, swapFreeKb: number } | null>} */
async function memInfo() {
  const raw = await readProc(`${PROC}/meminfo`);
  if (!raw) {
    return {
      totalKb: os.totalmem() / 1024,
      availableKb: os.freemem() / 1024,
      swapTotalKb: 0,
      swapFreeKb: 0,
    };
  }
  const get = (name) => Number(raw.match(new RegExp(`^${name}:\\s+(\\d+)`, "m"))?.[1] ?? 0);
  return {
    totalKb: get("MemTotal"),
    availableKb: get("MemAvailable") || get("MemFree"),
    swapTotalKb: get("SwapTotal"),
    swapFreeKb: get("SwapFree"),
  };
}

async function cpuTimes() {
  const raw = await readProc(`${PROC}/stat`);
  const line = raw?.split("\n").find((l) => l.startsWith("cpu "));
  if (!line) return null;
  const nums = line.trim().split(/\s+/).slice(1).map(Number);
  const idle = nums[3] + (nums[4] || 0);
  const total = nums.reduce((a, b) => a + b, 0);
  return { idle, total };
}

/** Завантаження CPU хоста у %, заміряне за ~0.5 с. */
async function cpuUsagePercent() {
  const a = await cpuTimes();
  if (!a) return null;
  await sleep(500);
  const b = await cpuTimes();
  if (!b || b.total === a.total) return null;
  return 100 * (1 - (b.idle - a.idle) / (b.total - a.total));
}

async function hostUptimeSec() {
  const raw = await readProc(`${PROC}/uptime`);
  const n = Number(raw?.split(" ")[0]);
  return Number.isFinite(n) ? n : os.uptime();
}

async function diskInfo() {
  try {
    const s = await fs.statfs(DISK_PATH);
    return { total: s.blocks * s.bsize, free: s.bavail * s.bsize };
  } catch {
    return null;
  }
}

async function redisInfo() {
  const started = Date.now();
  try {
    const r = getRedis();
    await r.ping();
    const pingMs = Date.now() - started;
    const info = await r.info();
    const field = (k) => info.match(new RegExp(`^${k}:(.*)$`, "m"))?.[1]?.trim();
    let users = 0;
    for await (const keys of r.scanIterator({ MATCH: "svitodiy:user:*", COUNT: 500 })) {
      users += Array.isArray(keys) ? keys.length : 1;
    }
    return {
      ok: true,
      pingMs,
      memory: field("used_memory_human"),
      uptimeSec: Number(field("uptime_in_seconds")),
      keys: await r.dbSize(),
      users,
      lastSaveOk: field("aof_last_write_status") !== "err",
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function apiServerInfo() {
  const url = (process.env.SERVER_URL || "http://localhost:3000") + "/health";
  const started = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return { ok: res.ok, ms: Date.now() - started, status: res.status };
  } catch (err) {
    return { ok: false, error: err.name === "TimeoutError" ? "таймаут 3 с" : err.message };
  }
}

async function telegramInfo(telegram) {
  const started = Date.now();
  try {
    await telegram.getMe();
    return { ok: true, ms: Date.now() - started };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** Короткий підсумок для вкладки «Сервер»; деталі — у вкладці «Контейнери». */
async function dockerSummary() {
  try {
    const list = await listContainers();
    const running = list.filter((c) => c.State === "running").length;
    const bad = list.filter(
      (c) =>
        c.State === "restarting" ||
        c.State === "dead" ||
        (c.State === "running" && c.Status?.includes("unhealthy")) ||
        (c.State === "exited" && !/Exited \(0\)/.test(c.Status ?? ""))
    ).length;
    return { ok: true, running, total: list.length, bad };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function lastStarts() {
  try {
    return await getRedis().lRange(STARTS_KEY, 0, 4);
  } catch {
    return [];
  }
}

/**
 * Повний звіт у HTML для Telegram.
 * @param {import("telegraf").Telegram} telegram
 */
export async function buildMonitorReport(telegram) {
  const [mem, cpu, uptime, disk, redis, api, tg, starts, docker] = await Promise.all([
    memInfo(),
    cpuUsagePercent(),
    hostUptimeSec(),
    diskInfo(),
    redisInfo(),
    apiServerInfo(),
    telegramInfo(telegram),
    lastStarts(),
    dockerSummary(),
  ]);

  const cores = os.cpus().length || 1;
  const [l1, l5, l15] = os.loadavg();
  const lines = [];

  lines.push("🛠 <b>Моніторинг сервера</b>");
  lines.push(`<i>Оновлено ${fmtTime(new Date())}</i>`);

  // ── Сервер (хост) ──
  lines.push("", "🖥 <b>Сервер</b>");
  lines.push(`Працює без перезавантаження: <b>${fmtDuration(uptime)}</b>`);

  if (cpu != null) {
    lines.push(`${light(cpu)} CPU: <b>${cpu.toFixed(0)}%</b> ${bar(cpu)} · ядер: ${cores}`);
  }
  const loadPct = (l1 / cores) * 100;
  lines.push(
    `${light(loadPct, 80, 150)} Навантаження (1/5/15 хв): <code>${l1.toFixed(2)} / ${l5.toFixed(2)} / ${l15.toFixed(2)}</code>`
  );

  if (mem) {
    const used = mem.totalKb - mem.availableKb;
    const pct = (used / mem.totalKb) * 100;
    lines.push(
      `${light(pct, 80, 92)} RAM: <b>${fmtBytes(used * 1024)}</b> з ${fmtBytes(mem.totalKb * 1024)} (${pct.toFixed(0)}%) ${bar(pct)}`
    );
    if (mem.swapTotalKb > 0) {
      const swapUsed = mem.swapTotalKb - mem.swapFreeKb;
      const swapPct = (swapUsed / mem.swapTotalKb) * 100;
      lines.push(
        `${light(swapPct, 50, 80)} Swap: ${fmtBytes(swapUsed * 1024)} з ${fmtBytes(mem.swapTotalKb * 1024)}`
      );
    } else {
      lines.push("⚪️ Swap: немає");
    }
  }

  if (disk) {
    const used = disk.total - disk.free;
    const pct = (used / disk.total) * 100;
    lines.push(
      `${light(pct, 80, 90)} Диск: <b>${fmtBytes(used)}</b> з ${fmtBytes(disk.total)} (${pct.toFixed(0)}%) ${bar(pct)} · вільно ${fmtBytes(disk.free)}`
    );
  }

  // ── Сервіси ──
  lines.push("", "🧩 <b>Сервіси</b>");
  lines.push(
    tg.ok
      ? `🟢 Telegram API — ${tg.ms} мс`
      : `🔴 Telegram API — ${escapeHtml(tg.error)}`
  );
  if (redis.ok) {
    lines.push(
      `🟢 Redis — ${redis.pingMs} мс · пам'ять ${escapeHtml(redis.memory ?? "?")} · ключів ${redis.keys} · працює ${fmtDuration(redis.uptimeSec)}`
    );
    if (!redis.lastSaveOk) lines.push("🔴 Redis не може записати дані на диск!");
  } else {
    lines.push(`🔴 Redis — ${escapeHtml(redis.error)}`);
  }
  lines.push(
    api.ok
      ? `🟢 API-сервер — ${api.ms} мс`
      : `🔴 API-сервер — ${escapeHtml(api.error ?? `HTTP ${api.status}`)}`
  );

  if (docker.ok) {
    lines.push(
      `${docker.bad > 0 ? "🔴" : "🟢"} Docker — контейнерів працює ${docker.running} з ${docker.total}` +
        (docker.bad > 0 ? ` · проблемних: <b>${docker.bad}</b>` : "")
    );
  } else {
    lines.push(`🔴 Docker — ${escapeHtml(docker.error)}`);
  }

  // ── Бот ──
  const rss = process.memoryUsage().rss;
  lines.push("", "🤖 <b>Бот</b>");
  lines.push(`Працює без перезапуску: <b>${fmtDuration(process.uptime())}</b>`);
  lines.push(`Пам'ять процесу: ${fmtBytes(rss)} · Node ${process.version}`);
  if (redis.ok) lines.push(`Користувачів у базі: <b>${redis.users}</b>`);
  lines.push(
    errorCount === 0
      ? "🟢 Помилок з моменту запуску: 0"
      : `🟡 Помилок з моменту запуску: <b>${errorCount}</b>`
  );
  if (lastError) {
    lines.push(
      `Остання (${fmtTime(lastError.at)}): <code>${escapeHtml(lastError.message)}</code>`
    );
  }
  if (starts.length > 0) {
    lines.push(`Останні запуски: ${starts.map((s) => fmtTime(s)).join(", ")}`);
  }

  return lines.join("\n");
}
