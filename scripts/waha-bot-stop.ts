/**
 * Para todos os processos `bot:listen` em execução.
 *   npm run bot:stop
 */
import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const PS_STOP = [
  "Get-CimInstance Win32_Process",
  "| Where-Object { $_.Name -eq 'bun.exe' -and $_.CommandLine -match 'waha-bot-listener' }",
  "| ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $_.ProcessId }",
].join(" ");

function stopWindows() {
  const output = execSync(`powershell -NoProfile -Command "${PS_STOP}"`, { encoding: "utf8" }).trim();
  const pids = output.split(/\s+/).filter(Boolean);
  try {
    const lock = join(process.cwd(), ".cache", "waha-bot-listener.pid");
    if (existsSync(lock)) unlinkSync(lock);
  } catch {
    // ignore
  }
  if (pids.length === 0) {
    console.info("[bot:stop] nenhum listener em execução.");
    return;
  }
  console.info(`[bot:stop] ${pids.length} listener(s) encerrado(s): ${pids.join(", ")}`);
}

function stopUnix() {
  execSync("pkill -f waha-bot-listener || true", { stdio: "inherit" });
  console.info("[bot:stop] listeners encerrados (se havia algum).");
}

if (process.platform === "win32") {
  stopWindows();
} else {
  stopUnix();
}
