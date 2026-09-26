import fs from "fs/promises";
import { containerName, listContainers } from "./docker.js";
import { escapeHtml, fmtBytes, sleep } from "./format.js";

/**
 * Найважчі процеси всього сервера — зокрема проєкти поза Docker (pm2, nginx, python…).
 * Читаємо /proc хоста, змонтований у контейнер лише на читання (HOST_PROC).
 */

const PROC = process.env.HOST_PROC || "/proc";
const CLK_TCK = 100;
const PAGE_SIZE = 4096;
const TOP_MEM = 10;
const TOP_CPU = 5;

/** @returns {Promise<{ pid: string, comm: string, ticks: number, rss: number } | null>} */
async function readStat(pid) {
  try {
    const raw = await fs.readFile(`${PROC}/${pid}/stat`, "utf8");
    const open = raw.indexOf("(");
    const close = raw.lastIndexOf(")");
    const comm = raw.slice(open + 1, close);
    // Поля після «)»: [0]=state … [11]=utime [12]=stime … [21]=rss (у сторінках)
    const f = raw.slice(close + 2).split(" ");
    return { pid, comm, ticks: Number(f[11]) + Number(f[12]), rss: Number(f[21]) * PAGE_SIZE };
  } catch {
    return null; // процес уже завершився
  }
}

async function snapshot() {
  const pids = (await fs.readdir(PROC)).filter((d) => /^\d+$/.test(d));
  const stats = await Promise.all(pids.map(readStat));
  return new Map(stats.filter(Boolean).map((s) => [s.pid, s]));
}

/**
 * Людська назва процесу. Показуємо лише назву й шлях до скрипта —
 * не весь рядок запуску, бо там бувають паролі й токени.
 */
async function describe(pid, comm, containers) {
  try {
    const cgroup = await fs.readFile(`${PROC}/${pid}/cgroup`, "utf8");
    const id = cgroup.match(/[0-9a-f]{64}/)?.[0];
    if (id && containers.has(id)) return `🐳 ${containers.get(id)} · ${comm}`;
  } catch {
    /* ignore */
  }
  try {
    const args = (await fs.readFile(`${PROC}/${pid}/cmdline`, "utf8")).split("\0").slice(1);
    const script = args.find(
      (a) => !a.startsWith("-") && /\.(m?js|cjs|ts|py|php|rb|jar|sh)$/.test(a)
    );
    if (script) {
      return `${comm} ${script.split("/").filter(Boolean).slice(-3).join("/")}`;
    }
  } catch {
    /* ignore */
  }
  return comm;
}

export async function buildProcessesReport() {
  /** id контейнера → «проєкт/сервіс», щоб підписати процеси з Docker */
  const containers = new Map();
  try {
    for (const c of await listContainers()) {
      const project = c.Labels?.["com.docker.compose.project"];
      containers.set(c.Id, project ? `${project}/${containerName(c)}` : containerName(c));
    }
  } catch {
    /* без Docker просто не буде підписів 🐳 */
  }

  let a;
  try {
    a = await snapshot();
  } catch (err) {
    return `⚙️ <b>Процеси</b>\n\n🔴 Не вдалося прочитати ${PROC}: <code>${escapeHtml(err.message)}</code>`;
  }
  const intervalSec = 1;
  await sleep(intervalSec * 1000);
  const b = await snapshot();

  const procs = [...b.values()]
    .filter((p) => p.rss > 0) // потоки ядра не мають пам'яті — пропускаємо
    .map((p) => {
      const prev = a.get(p.pid);
      const cpu = prev ? ((p.ticks - prev.ticks) / (CLK_TCK * intervalSec)) * 100 : 0;
      return { ...p, cpu: Math.max(0, cpu) };
    });

  const byMem = [...procs].sort((x, y) => y.rss - x.rss).slice(0, TOP_MEM);
  const byCpu = [...procs]
    .sort((x, y) => y.cpu - x.cpu)
    .filter((p) => p.cpu >= 0.5)
    .slice(0, TOP_CPU);

  const label = async (p) => escapeHtml(await describe(p.pid, p.comm, containers));

  const lines = [];
  lines.push("⚙️ <b>Процеси сервера</b>");
  lines.push(`Усього процесів: ${procs.length}`);
  if (!process.env.HOST_PROC) {
    lines.push("<i>⚠️ HOST_PROC не задано — видно лише процеси контейнера.</i>");
  }

  lines.push("", "🧠 <b>Найбільше пам'яті</b>");
  for (const p of byMem) {
    lines.push(`<code>${fmtBytes(p.rss).padStart(7)}</code> ${await label(p)} · CPU ${p.cpu.toFixed(0)}%`);
  }

  lines.push("", "🔥 <b>Найбільше CPU</b> <i>(100% = одне ядро)</i>");
  if (byCpu.length === 0) {
    lines.push("🟢 Нічого не навантажує процесор");
  }
  for (const p of byCpu) {
    lines.push(`<code>${p.cpu.toFixed(0).padStart(4)}%</code> ${await label(p)} · ${fmtBytes(p.rss)}`);
  }

  return lines.join("\n");
}
