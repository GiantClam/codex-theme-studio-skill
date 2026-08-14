#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  appDataRoot,
  clearFailureState,
  commandApply,
  delay,
  evaluateAll,
  appInfoSync,
  discover,
  injectTheme,
  injectionVerified,
  isSupportedPlatform,
  listThemes,
  launchApplication,
  processIds,
  restartWorker,
  readState,
  savedTheme,
  selectMainTarget,
  STATUS_EXPRESSION,
  targets,
  writeState,
} from "./apply.mjs";
import { withOperationLock } from "./operation-lock.mjs";
import { switchPairBundle } from "./paired.mjs";
import { loadPetContract } from "./pet.mjs";

const execFileAsync = promisify(execFile);
const LABEL = "com.openai.chatgpt.codex-skin-studio";
const PORT = 9341;
const CONTROL_PORT = 9342;
const PLIST_PATH = join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
const LOG_DIR = join(homedir(), "Library", "Logs", "CodexSkinStudio");
const WINDOWS_ROOT = join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "CodexSkinStudio");
const TASK_NAME = "CodexSkinStudio";
const TASK_XML_PATH = join(WINDOWS_ROOT, "persistence-task.xml");
const PET_CONTRACT_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "templates", "pet-contract.json");

function operationRoot(platformName = platform()) {
  return join(appDataRoot(platformName), "CodexSkinStudio");
}

function parseArgs(argv) {
  const command = argv.shift() || "status";
  let port = PORT;
  let controlPort = CONTROL_PORT;
  let jsonOutput = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") jsonOutput = true;
    else if (argument === "--port") port = Number(argv[++index]);
    else if (argument === "--control-port") controlPort = Number(argv[++index]);
    else throw new Error(`unknown argument: ${argument}`);
  }
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("port must be an integer from 1024 through 65535");
  if (!Number.isInteger(controlPort) || controlPort < 1024 || controlPort > 65535) throw new Error("control port must be an integer from 1024 through 65535");
  return { command, port, controlPort, jsonOutput };
}

function xml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function buildPlist({ nodePath = process.execPath, scriptPath = fileURLToPath(import.meta.url), port = PORT, controlPort = CONTROL_PORT } = {}) {
  const workerArgs = [nodePath, scriptPath, "persistence-worker", "--port", String(port), "--control-port", String(controlPort)];
  const argumentsXml = workerArgs.map((value) => `    <string>${xml(value)}</string>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xml(LABEL)}</string>
  <key>ProgramArguments</key>
  <array>
${argumentsXml}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>ProcessType</key>
  <string>Interactive</string>
  <key>LimitLoadToSessionType</key>
  <string>Aqua</string>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>StandardOutPath</key>
  <string>${xml(join(LOG_DIR, "persistence.log"))}</string>
  <key>StandardErrorPath</key>
  <string>${xml(join(LOG_DIR, "persistence.error.log"))}</string>
</dict>
</plist>
`;
}

function launchctlTarget() {
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  if (!uid) throw new Error("the current macOS user session could not be resolved");
  return `gui/${uid}`;
}

function windowsQuote(value) {
  const text = String(value);
  return /[\s"]/.test(text) ? `"${text.replaceAll('"', '\\"')}"` : text;
}

function powershellQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function windowsUserId() {
  if (!process.env.USERNAME) return null;
  return process.env.USERDOMAIN ? `${process.env.USERDOMAIN}\\${process.env.USERNAME}` : process.env.USERNAME;
}

function buildTaskXml({ nodePath = process.execPath, scriptPath = fileURLToPath(import.meta.url), port = PORT, controlPort = CONTROL_PORT, userId = null } = {}) {
  const argumentsValue = [scriptPath, "persistence-worker", "--port", String(port), "--control-port", String(controlPort)].map(windowsQuote).join(" ");
  const principalUser = userId || (process.env.USERDOMAIN && process.env.USERNAME ? `${process.env.USERDOMAIN}\\${process.env.USERNAME}` : null);
  const userIdXml = principalUser ? `\n      <UserId>${xml(principalUser)}</UserId>` : "";
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Author>Codex Skin Studio</Author>
    <Description>Reapply the selected ChatGPT Desktop skin after Windows login, app launch, or renderer reload.</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      ${userIdXml}
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${xml(nodePath)}</Command>
      <Arguments>${xml(argumentsValue)}</Arguments>
      <WorkingDirectory>${xml(dirname(scriptPath))}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
`;
}

async function launchctl(args, { ignoreFailure = false } = {}) {
  try {
    return await execFileAsync("/bin/launchctl", args, { timeout: 5000 });
  } catch (error) {
    if (ignoreFailure) return null;
    throw error;
  }
}

async function schtasks(args, { ignoreFailure = false } = {}) {
  try {
    return await execFileAsync("schtasks.exe", args, { timeout: 10000 });
  } catch (error) {
    if (ignoreFailure) return null;
    throw error;
  }
}

async function powershell(command, { ignoreFailure = false } = {}) {
  try {
    return await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { timeout: 10000 });
  } catch (error) {
    if (ignoreFailure) return null;
    throw error;
  }
}

async function registerWindowsTask({ nodePath = process.execPath, scriptPath = fileURLToPath(import.meta.url), port = PORT, controlPort = CONTROL_PORT } = {}) {
  const userId = windowsUserId();
  if (!userId) throw new Error("the current Windows user could not be resolved");
  const argumentsValue = [scriptPath, "persistence-worker", "--port", String(port), "--control-port", String(controlPort)].map(windowsQuote).join(" ");
  const command = [
    `$action = New-ScheduledTaskAction -Execute ${powershellQuote(nodePath)} -Argument ${powershellQuote(argumentsValue)} -WorkingDirectory ${powershellQuote(dirname(scriptPath))}`,
    `$trigger = New-ScheduledTaskTrigger -AtLogOn -User ${powershellQuote(userId)}`,
    `$principal = New-ScheduledTaskPrincipal -UserId ${powershellQuote(userId)} -LogonType Interactive -RunLevel Limited`,
    "$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries",
    `Register-ScheduledTask -TaskName ${powershellQuote(TASK_NAME)} -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null`,
  ].join("; ");
  await powershell(command);
  return { status: "enabled", taskName: TASK_NAME, taskXmlPath: TASK_XML_PATH, port, controlPort };
}

async function installPersistence({ port = PORT, controlPort = CONTROL_PORT, nodePath = process.execPath, scriptPath = fileURLToPath(import.meta.url) } = {}) {
  if (platform() === "win32") {
    await mkdir(dirname(TASK_XML_PATH), { recursive: true });
    await writeFile(TASK_XML_PATH, `\ufeff${buildTaskXml({ nodePath, scriptPath, port, controlPort })}`, "utf16le");
    return registerWindowsTask({ nodePath, scriptPath, port, controlPort });
  }
  if (platform() !== "darwin") throw new Error("ChatGPT Skin Studio persistence supports macOS and Windows only");
  await mkdir(dirname(PLIST_PATH), { recursive: true });
  await mkdir(LOG_DIR, { recursive: true });
  await writeFile(PLIST_PATH, buildPlist({ nodePath, scriptPath, port, controlPort }), "utf8");
  const target = launchctlTarget();
  await launchctl(["bootout", target, PLIST_PATH], { ignoreFailure: true });
  await launchctl(["bootstrap", target, PLIST_PATH]);
  return { status: "enabled", label: LABEL, plistPath: PLIST_PATH, port, controlPort };
}

async function uninstallPersistence() {
  if (platform() === "win32") {
    await powershell(`Unregister-ScheduledTask -TaskName ${powershellQuote(TASK_NAME)} -Confirm:$false -ErrorAction SilentlyContinue`, { ignoreFailure: true });
    await rm(TASK_XML_PATH, { force: true });
    return { status: "disabled", taskName: TASK_NAME, taskXmlPath: TASK_XML_PATH };
  }
  if (platform() !== "darwin") throw new Error("ChatGPT Skin Studio persistence supports macOS and Windows only");
  await launchctl(["bootout", launchctlTarget(), PLIST_PATH], { ignoreFailure: true });
  await rm(PLIST_PATH, { force: true });
  return { status: "disabled", label: LABEL, plistPath: PLIST_PATH };
}

async function persistenceStatus() {
  if (platform() === "win32") {
    const result = await schtasks(["/Query", "/TN", TASK_NAME, "/FO", "LIST", "/V"], { ignoreFailure: true });
    const installed = Boolean(result);
    const running = Boolean(result?.stdout && /Status:\s+Running/i.test(result.stdout));
    return { status: running ? "enabled" : installed ? "installed" : "disabled", taskName: TASK_NAME, taskXmlPath: TASK_XML_PATH, loaded: installed, running };
  }
  let installed = false;
  try {
    await readFile(PLIST_PATH, "utf8");
    installed = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  let loaded = false;
  let running = false;
  if (installed && platform() === "darwin") {
    const result = await launchctl(["print", `${launchctlTarget()}/${LABEL}`], { ignoreFailure: true });
    loaded = Boolean(result);
    running = Boolean(result?.stdout && /state = running/.test(result.stdout));
  }
  return { status: running ? "enabled" : installed ? "installed" : "disabled", label: LABEL, plistPath: PLIST_PATH, loaded, running };
}

function sendJson(response, statusCode, value) {
  response.statusCode = statusCode;
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
  response.setHeader("access-control-allow-private-network", "true");
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
}

function sendControlPage(response, statusCode, message, result = null) {
  response.statusCode = statusCode;
  const payload = JSON.stringify(result || { source: "codex-skin-studio", status: statusCode >= 400 ? "failed" : "applied", message }).replaceAll("<", "\\u003c");
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(`<!doctype html><meta charset="utf-8"><title>Codex Skin Studio</title><p>${message}</p><script>window.opener?.postMessage(${payload}, "*"); window.close()</script>`);
}

async function requestBody(request, maxBytes = 4096) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("request body is too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function defaultPairDirectory(themeId) {
  const directory = join(appDataRoot(), "CodexSkinStudio", "pairs", themeId);
  try { await stat(join(directory, "bundle.json")); return directory; } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

function createControlServer({ cdpPort = PORT, listThemesFn = listThemes, applyThemeFn = commandApply, switchPairFn = switchPairBundle, pairDirectoryFn = defaultPairDirectory, contractPath = PET_CONTRACT_PATH, applyLock = null } = {}) {
  let applying = false;
  const applyThemeId = async (id) => {
    if (applying || applyLock?.active) throw new Error("another skin is being applied");
    applying = true;
    if (applyLock) applyLock.active = true;
    try {
      const themes = await listThemesFn();
      const theme = themes.find((item) => item.id === id);
      if (!theme) throw new Error("local theme was not found");
      const pairDirectory = await pairDirectoryFn(id);
      if (pairDirectory) {
        const contract = await loadPetContract(contractPath);
        const paired = await switchPairFn(pairDirectory, { contract, port: cdpPort, nativePet: true, installPersistenceFn: null });
        if (paired.status !== "theme-applied-pet-selected" || paired.petSelection?.selection !== "native-ui-confirmed") {
          throw new Error(paired.nextAction || "Theme applied, but the matching Pet was not selected");
        }
        return { status: "applied", themeId: id, paired: true, petSelection: paired.petSelection.selection, petId: paired.petSelection.petId, theme: paired.theme, pet: paired.pet };
      }
      return await applyThemeFn(theme.themeDir, cdpPort);
    } finally {
      applying = false;
      if (applyLock) applyLock.active = false;
    }
  };
  return createServer(async (request, response) => {
    if (request.method === "OPTIONS") return sendJson(response, 204, {});
    try {
      if (request.method === "GET" && request.url === "/health") return sendJson(response, 200, { status: "ok" });
      if (request.method === "GET" && request.url === "/themes") {
        const themes = await listThemesFn();
        return sendJson(response, 200, themes.map(({ id, name, colors }) => ({ id, name, colors })));
      }
      if (request.method === "GET" && request.url?.startsWith("/apply?")) {
        const id = new URL(request.url, "http://127.0.0.1").searchParams.get("id");
        if (!id) return sendControlPage(response, 400, "Theme id is required");
        try {
          const result = await applyThemeId(id);
          return sendControlPage(response, 200, "Skin applied", { source: "codex-skin-studio", ...result, themeId: result?.themeId || id });
        } catch (error) {
          return sendControlPage(response, 400, error.message, { source: "codex-skin-studio", status: "failed", themeId: id, message: error.message });
        }
      }
      if (request.method === "POST" && request.url === "/apply") {
        const body = await requestBody(request);
        let payload;
        try { payload = JSON.parse(body); } catch { payload = Object.fromEntries(new URLSearchParams(body)); }
        if (!payload || typeof payload.id !== "string") return sendJson(response, 400, { status: "failed", message: "theme id is required" });
        return sendJson(response, 200, await applyThemeId(payload.id));
      }
      return sendJson(response, 404, { status: "failed", message: "unknown control route" });
    } catch (error) {
      return sendJson(response, 400, { status: "failed", message: error.message });
    }
  });
}

async function startControlServer({ port = CONTROL_PORT, cdpPort = PORT, createServerFn = createControlServer } = {}) {
  const server = createServerFn({ cdpPort });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return server;
}

async function ensureAppAtStartup({ port = PORT, platformFn = platform, readStateFn = readState, discoverFn = discover, appInfoFn = appInfoSync, processIdsFn = processIds, targetsFn = targets, restartWorkerFn = restartWorker, launchFn = launchApplication } = {}) {
  const currentPlatform = platformFn();
  if (!isSupportedPlatform(currentPlatform)) return { status: "skipped", reason: "unsupported-platform" };
  const state = await readStateFn();
  if (!state?.themeDir || typeof state.themeId !== "string") return { status: "idle", reason: "no-selected-theme" };
  const app = discoverFn(currentPlatform);
  const info = app ? appInfoFn(app, currentPlatform) : null;
  if (!info?.valid) return { status: "idle", reason: "chatgpt-desktop-not-found" };
  const pids = await processIdsFn(info.executable, { platformFn: () => currentPlatform });
  if (pids.length) {
    let liveTargets = [];
    try { liveTargets = await targetsFn(port); } catch { /* A running app without CDP must be restarted below. */ }
    if (liveTargets.length) return { status: "already-running", executable: info.executable };
    await restartWorkerFn(port);
    return { status: "restarted", executable: info.executable, port };
  }
  launchFn(app, port, currentPlatform, false);
  return { status: "launched", executable: info.executable, port };
}

async function recoverRunningApp({ port = PORT, state, platformFn = platform, discoverFn = discover, appInfoFn = appInfoSync, processIdsFn = processIds, restartWorkerFn = restartWorker } = {}) {
  const currentPlatform = platformFn();
  if (!isSupportedPlatform(currentPlatform)) return { status: "skipped", reason: "unsupported-platform" };
  if (!state?.themeDir || typeof state.themeId !== "string") return { status: "idle", reason: "no-selected-theme" };
  const app = discoverFn(currentPlatform);
  const info = app ? appInfoFn(app, currentPlatform) : null;
  if (!info?.valid) return { status: "idle", reason: "chatgpt-desktop-not-found" };
  const pids = await processIdsFn(info.executable, { platformFn: () => currentPlatform });
  if (!pids.length) return { status: "idle", reason: "chatgpt-desktop-not-running" };
  await restartWorkerFn(port);
  return { status: "restarted", executable: info.executable, port };
}

async function persistenceWorker({ port = PORT, controlPort = CONTROL_PORT, pollMs = 1500, startControlServerFn = startControlServer, platformFn = platform, delayFn = delay, readStateFn = readState, targetsFn = targets, selectMainTargetFn = selectMainTarget, evaluateListFn = evaluateAll, injectionVerifiedFn = injectionVerified, savedThemeFn = savedTheme, injectThemeFn = injectTheme, writeStateFn = writeState, startupFn = null, recoveryFn = null, nowFn = Date.now, recoveryCooldownMs = 5000, continueFn = () => true, operationLockFn = withOperationLock, operationRootPath = operationRoot(platformFn()) } = {}) {
  if (!isSupportedPlatform(platformFn())) throw new Error("ChatGPT Skin Studio persistence supports macOS and Windows only");
  const applyLock = { active: false };
  const reportRecoveryFailure = async (state, error) => {
    const message = String(error?.message || error || "skin recovery failed");
    try {
      await writeStateFn({ ...(state || {}), active: false, restartPending: false, restartWorkerPid: null, failedAt: new Date(nowFn()).toISOString(), error: message });
    } catch {
      // Preserve the original recovery failure even when state persistence is unavailable.
    }
    console.error(JSON.stringify({ status: "failed", code: "RECOVERY_FAILED", message }));
  };
  await startControlServerFn({ port: controlPort, cdpPort: port, applyLock });
  if (startupFn) {
    try {
      await startupFn({ port, targetsFn });
    } catch (error) {
      await reportRecoveryFailure(await readStateFn().catch(() => null), error);
    }
  }
  let recoveryAfter = 0;
  while (continueFn()) {
    try {
      if (applyLock.active) {
        await delayFn(pollMs);
        continue;
      }
      const state = await readStateFn();
      if (!state?.themeDir || typeof state.themeId !== "string") {
        await delayFn(pollMs * 2);
        continue;
      }
      const list = await targetsFn(port).catch(() => null);
      if (list === null) {
        if (recoveryFn && nowFn() >= recoveryAfter) {
          recoveryAfter = nowFn() + recoveryCooldownMs;
          applyLock.active = true;
          try {
            await operationLockFn(operationRootPath, "recovery", () => recoveryFn({ port, state }));
          } catch (error) {
            await reportRecoveryFailure(state, error);
          }
          applyLock.active = false;
        }
        await delayFn(pollMs);
        continue;
      }
      if (applyLock.active) {
        await delayFn(pollMs);
        continue;
      }
      if (list.length) {
        const main = await selectMainTargetFn(list, undefined, { allowTransient: true });
        if (main) {
          const live = (await evaluateListFn([main], STATUS_EXPRESSION))[0];
          if (!injectionVerifiedFn(live, state.themeId, state.assetFlags)) {
            if (applyLock.active) {
              await delayFn(pollMs);
              continue;
            }
            applyLock.active = true;
            try {
              const saved = await savedThemeFn(state);
              await injectThemeFn(list, saved);
              await writeStateFn({ ...clearFailureState(state), active: true, restartPending: false, restartWorkerPid: null, reappliedAt: new Date().toISOString() });
            } finally {
              applyLock.active = false;
            }
          }
        }
        await delayFn(pollMs);
        continue;
      }
    } catch {
      // A renderer can disappear during a normal user quit or system shutdown.
      // Keep the worker idle and wait for a future user-initiated launch.
    }
    await delayFn(pollMs);
  }
  return { status: "stopped" };
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    let result;
    if (args.command === "install") result = await installPersistence({ port: args.port, controlPort: args.controlPort });
    else if (args.command === "uninstall") result = await uninstallPersistence();
    else if (args.command === "status") result = await persistenceStatus();
    else if (args.command === "persistence-worker") return persistenceWorker({ port: args.port, controlPort: args.controlPort, startupFn: (options) => ensureAppAtStartup({ ...options, restartWorkerFn: restartWorker }), recoveryFn: recoverRunningApp });
    else throw new Error("usage: persist.mjs install|uninstall|status|persistence-worker [--port PORT] [--control-port PORT] [--json]");
    process.stdout.write(`${args.jsonOutput ? JSON.stringify(result, null, 2) : result.status}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: "failed", message: error.message })}\n`);
    process.exitCode = 1;
  }
}

export { buildPlist, buildTaskXml, createControlServer, ensureAppAtStartup, installPersistence, LABEL, parseArgs, persistenceStatus, persistenceWorker, PLIST_PATH, recoverRunningApp, startControlServer, uninstallPersistence };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
