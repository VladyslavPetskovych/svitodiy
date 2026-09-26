import { escapeHtml, fmtBytes, sleep } from "./format.js";

/**
 * Усі контейнери хоста — з цього та інших проєктів.
 * Ходимо через docker-socket-proxy (див. docker-compose.yml), який дозволяє лише читання.
 */

const DOCKER_API = process.env.DOCKER_API_URL || "http://docker-proxy:2375";

async function dockerGet(path) {
  const res = await fetch(DOCKER_API + path, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Docker API: HTTP ${res.status}`);
  return res.json();
}

/** @returns {Promise<any[]>} сирий список з Docker API (включно зі зупиненими) */
export function listContainers() {
  return dockerGet("/containers/json?all=1");
}

export function containerName(c) {
  return (
    c.Labels?.["com.docker.compose.service"] ||
    c.Names?.[0]?.replace(/^\//, "") ||
    c.Id.slice(0, 12)
  );
}

async function statsOnce(id) {
  try {
    return await dockerGet(`/containers/${id}/stats?stream=false&one-shot=true`);
  } catch {
    return null;
  }
}

/** Пам'ять без файлового кешу — так само рахує `docker stats`. */
function memUsed(s) {
  const m = s?.memory_stats;
  if (!m?.usage) return null;
  const cache = m.stats?.inactive_file ?? m.stats?.total_inactive_file ?? 0;
  return m.usage - cache;
}

/** CPU у % від одного ядра (як у `docker stats`) між двома замірами. */
function cpuPercent(a, b) {
  const dc = b?.cpu_stats?.cpu_usage?.total_usage - a?.cpu_stats?.cpu_usage?.total_usage;
  const ds = b?.cpu_stats?.system_cpu_usage - a?.cpu_stats?.system_cpu_usage;
  const cpus = b?.cpu_stats?.online_cpus || 1;
  if (!(ds > 0) || !(dc >= 0)) return null;
  return (dc / ds) * cpus * 100;
}

function stateIcon(c) {
  const status = c.Status ?? "";
  if (c.State === "running") {
    if (status.includes("unhealthy")) return "🔴";
    if (status.includes("health: starting")) return "🟡";
    return "🟢";
  }
  if (c.State === "restarting" || c.State === "dead") return "🔴";
  if (c.State === "exited") return /Exited \(0\)/.test(status) ? "⚪️" : "🔴";
  return "⚪️";
}

export async function buildContainersReport() {
  let list;
  try {
    list = await listContainers();
  } catch (err) {
    return (
      "🐳 <b>Контейнери</b>\n\n" +
      `🔴 Немає доступу до Docker: <code>${escapeHtml(err.message)}</code>\n` +
      "Перевір, що запущено контейнер <code>docker-proxy</code>."
    );
  }

  const running = list.filter((c) => c.State === "running");
  const [inspects, first] = await Promise.all([
    Promise.all(list.map((c) => dockerGet(`/containers/${c.Id}/json`).catch(() => null))),
    Promise.all(running.map((c) => statsOnce(c.Id))),
  ]);
  await sleep(1000);
  const second = await Promise.all(running.map((c) => statsOnce(c.Id)));

  /** @type {Map<string, { cpu: number | null, mem: number | null }>} */
  const usage = new Map();
  running.forEach((c, i) => {
    usage.set(c.Id, { cpu: cpuPercent(first[i], second[i]), mem: memUsed(second[i] ?? first[i]) });
  });
  const restarts = new Map(list.map((c, i) => [c.Id, inspects[i]?.RestartCount ?? 0]));

  // Групуємо за compose-проєктом, щоб було видно, що до якого проєкту належить.
  /** @type {Map<string, any[]>} */
  const groups = new Map();
  for (const c of list) {
    const project = c.Labels?.["com.docker.compose.project"] || "— без compose —";
    if (!groups.has(project)) groups.set(project, []);
    groups.get(project).push(c);
  }

  const problems = list.filter((c) => stateIcon(c) === "🔴").length;
  const totalMem = [...usage.values()].reduce((a, u) => a + (u.mem ?? 0), 0);

  const lines = [];
  lines.push("🐳 <b>Контейнери</b>");
  lines.push(
    `Працює: <b>${running.length}</b> · зупинено: ${list.length - running.length}` +
      ` · пам'ять разом: ${fmtBytes(totalMem)}`
  );
  lines.push(problems > 0 ? `🔴 Проблемних: <b>${problems}</b>` : "🟢 Проблем немає");

  const sortedProjects = [...groups.keys()].sort((a, b) => a.localeCompare(b));
  for (const project of sortedProjects) {
    lines.push("", `📦 <b>${escapeHtml(project)}</b>`);
    const items = groups.get(project).sort((a, b) => containerName(a).localeCompare(containerName(b)));
    for (const c of items) {
      const u = usage.get(c.Id);
      const parts = [`${stateIcon(c)} <b>${escapeHtml(containerName(c))}</b> — ${escapeHtml(c.Status)}`];
      if (u?.cpu != null) parts.push(`CPU ${u.cpu.toFixed(1)}%`);
      if (u?.mem != null) parts.push(fmtBytes(u.mem));
      const rc = restarts.get(c.Id);
      if (rc > 0) parts.push(`🔁 перезапусків: ${rc}`);
      lines.push(parts.join(" · "));
    }
  }

  return lines.join("\n");
}
