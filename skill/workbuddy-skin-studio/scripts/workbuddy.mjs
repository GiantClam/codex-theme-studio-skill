#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { lstat, mkdir, readFile, readdir, realpath, rename, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { validateImageMetadata } from "./image-metadata.mjs";

export const DEFAULT_PORT = 9223;
export const STYLE_ID = "workbuddy-skin-studio-style";
export const BUNDLE_ID = "com.workbuddy.workbuddy";
export const SUPPORTED_PLATFORMS = new Set(["darwin", "win32"]);
const MIME = Object.freeze({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" });
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX = /^#[0-9a-f]{6}$/i;

export function appDataRoot(platformName = platform()) {
  if (platformName === "win32") return process.env.APPDATA || join(homedir(), "AppData", "Roaming");
  if (platformName === "darwin") return join(homedir(), "Library", "Application Support");
  return process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
}

export const ROOT = join(appDataRoot(), "WorkBuddySkinStudio");
export const THEMES = join(ROOT, "themes");
export const STATE = join(ROOT, "state.json");

function error(code, message) { return Object.assign(new Error(message), { code }); }
function isUnavailable(value) { const message = String(value?.message || value || ""); return ["ECONNREFUSED", "ERR_CONNECTION_REFUSED", "ENOTFOUND", "fetch failed"].includes(value?.code) || /ECONNREFUSED|ERR_CONNECTION_REFUSED|fetch failed|connection refused/i.test(message); }
function inside(root, file) { const value = relative(root, file); return value !== "" && value !== ".." && !value.startsWith(`..${sep}`) && !value.startsWith(sep); }
function luminance(hex) { const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]; }
function contrast(a, b) { const high = Math.max(luminance(a), luminance(b)); const low = Math.min(luminance(a), luminance(b)); return (high + 0.05) / (low + 0.05); }

export function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw error("THEME_INVALID", "theme manifest must be an object");
  const allowed = new Set(["schemaVersion", "id", "name", "hero", "logo", "polaroid", "colors", "copy"]);
  for (const key of Object.keys(manifest)) if (!allowed.has(key)) throw error("THEME_INVALID", `unsupported theme field: ${key}`);
  if (manifest.schemaVersion !== 1) throw error("THEME_INVALID", "unsupported theme schema");
  if (typeof manifest.id !== "string" || !ID.test(manifest.id)) throw error("THEME_INVALID", "theme id must use lowercase letters, numbers, and hyphens");
  if (typeof manifest.name !== "string" || !manifest.name.trim() || manifest.name.trim().length > 80) throw error("THEME_INVALID", "theme name must be 1 to 80 characters");
  const asset = (value, field, optional = false) => {
    if (optional && (value === undefined || value === null)) return null;
    if (typeof value !== "string" || !MIME[extname(value).toLowerCase()] || value.includes("..") || value.startsWith("/") || value.includes("\\")) throw error("THEME_INVALID", `${field} must be a relative PNG, JPEG, or WebP path`);
    return value;
  };
  const hero = asset(manifest.hero, "hero");
  const logo = asset(manifest.logo, "logo", true);
  const polaroid = asset(manifest.polaroid, "polaroid", true);
  if (!manifest.colors || typeof manifest.colors !== "object" || Array.isArray(manifest.colors)) throw error("THEME_INVALID", "theme colors must be an object");
  for (const key of ["accent", "secondary", "surface", "text"]) if (typeof manifest.colors[key] !== "string" || !HEX.test(manifest.colors[key])) throw error("THEME_INVALID", `${key} must be a six-digit hex color`);
  if (contrast(manifest.colors.surface, manifest.colors.text) < 4.5) throw error("THEME_INVALID", "surface and text colors must have a contrast ratio of at least 4.5");
  let copy;
  if (manifest.copy !== undefined && manifest.copy !== null) {
    if (typeof manifest.copy !== "object" || Array.isArray(manifest.copy)) throw error("THEME_INVALID", "theme copy must be an object");
    copy = {};
    for (const key of ["brand", "headline", "tagline"]) if (manifest.copy[key] !== undefined) {
      if (typeof manifest.copy[key] !== "string" || !manifest.copy[key].trim() || manifest.copy[key].trim().length > 140) throw error("THEME_INVALID", `copy.${key} is invalid`);
      copy[key] = manifest.copy[key].trim();
    }
    if (!Object.keys(copy).length) copy = null;
  }
  return { schemaVersion: 1, id: manifest.id, name: manifest.name.trim(), hero, ...(logo ? { logo } : {}), ...(polaroid ? { polaroid } : {}), ...(copy ? { copy } : {}), colors: Object.fromEntries(["accent", "secondary", "surface", "text"].map((key) => [key, manifest.colors[key].toUpperCase()])) };
}

export async function loadTheme(themeDir) {
  if (!themeDir) throw error("THEME_INVALID", "theme directory is required");
  const root = resolve(themeDir);
  const manifest = validateManifest(JSON.parse(await readFile(join(root, "theme.json"), "utf8")));
  const realRoot = await realpath(root);
  const assets = {};
  for (const field of ["hero", "logo", "polaroid"]) {
    const relativePath = manifest[field];
    if (!relativePath) continue;
    const file = resolve(root, relativePath);
    if (!inside(root, file) || !inside(realRoot, await realpath(file))) throw error("THEME_INVALID", `${field} escapes the theme directory`);
    const info = await lstat(file);
    if (!info.isFile() || info.size < 1) throw error("THEME_INVALID", `${field} must be a regular file`);
    validateImageMetadata(await readFile(file), { expectedMime: MIME[extname(file).toLowerCase()] });
    assets[field] = file;
  }
  return { root, manifest, ...assets };
}

export async function listThemes(themesDir = THEMES) {
  let entries;
  try { entries = await readdir(themesDir, { withFileTypes: true }); } catch (value) { if (value.code === "ENOENT") return []; throw value; }
  const result = [];
  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    try { const theme = await loadTheme(join(themesDir, entry.name)); result.push({ themeDir: theme.root, id: theme.manifest.id, name: theme.manifest.name, colors: theme.manifest.colors }); } catch { /* Ignore drafts. */ }
  }
  return result;
}

export function appCandidates(platformName = platform()) {
  if (platformName === "win32") {
    const local = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
    const program = process.env.ProgramFiles || "C:\\Program Files";
    return [join(local, "Programs", "WorkBuddy", "WorkBuddy.exe"), join(local, "WorkBuddy", "WorkBuddy.exe"), join(program, "WorkBuddy", "WorkBuddy.exe")];
  }
  return ["/Applications/WorkBuddy.app", join(homedir(), "Applications", "WorkBuddy.app")];
}

export function appInfoSync(app, platformName = platform()) {
  if (platformName === "win32") return app && app.toLowerCase().endsWith(".exe") && existsSync(app) ? { valid: true, executablePath: app, executable: basename(app), bundleId: null, signatureValid: null } : null;
  try {
    const bundleId = execFileSync("/usr/bin/defaults", ["read", join(app, "Contents/Info.plist"), "CFBundleIdentifier"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const executable = execFileSync("/usr/bin/defaults", ["read", join(app, "Contents/Info.plist"), "CFBundleExecutable"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const executablePath = join(app, "Contents", "MacOS", executable);
    return { valid: bundleId === BUNDLE_ID && statSync(executablePath).isFile(), bundleId, executable, executablePath, signatureValid: null };
  } catch { return null; }
}

export function discover(platformName = platform()) {
  const candidates = [...appCandidates(platformName)];
  if (platformName === "win32") {
    try { candidates.unshift(...execFileSync("where.exe", ["WorkBuddy.exe"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().split(/\r?\n/).filter(Boolean)); } catch { /* fixed candidates remain */ }
  }
  return candidates.find((candidate) => appInfoSync(candidate, platformName)?.valid) || null;
}

export function isSupportedPlatform(platformName = platform()) { return SUPPORTED_PLATFORMS.has(platformName); }

export async function targets(port = DEFAULT_PORT, fetchFn = globalThis.fetch) {
  if (!Number.isInteger(Number(port)) || Number(port) < 1024 || Number(port) > 65535) throw error("INVALID_PORT", "port must be an integer from 1024 through 65535");
  const response = await fetchFn(`http://127.0.0.1:${port}/json/list`, { redirect: "error" });
  if (!response.ok) throw error("CDP_ERROR", `CDP discovery returned HTTP ${response.status}`);
  const list = await response.json();
  if (!Array.isArray(list)) throw error("CDP_ERROR", "CDP discovery returned malformed target list");
  return list.filter((target) => {
    if (!target || typeof target.webSocketDebuggerUrl !== "string" || !/renderer\/index\.html/i.test(target.url || "")) return false;
    try { const url = new URL(target.webSocketDebuggerUrl); return url.protocol === "ws:" && url.hostname === "127.0.0.1" && url.port === String(port); } catch { return false; }
  });
}

export const COMPATIBILITY_PROBE = `(() => { const body = document.body; const root = document.getElementById("root"); const views = document.querySelectorAll("[data-view-id]").length; const marker = body?.dataset?.applicationName === "workbuddy"; const cbVariable = body ? getComputedStyle(body).getPropertyValue("--cb-bg-primary").trim() : ""; return { compatible: Boolean(marker && root && views > 0 && cbVariable), bodyMarker: marker, root: Boolean(root), viewCount: views, cbVariable, url: location.href, title: document.title || "" }; })()`;
export const STATUS_EXPRESSION = `(() => { const node = document.getElementById(${JSON.stringify(STYLE_ID)}); const root = document.getElementById("root"); return { installed: Boolean(node), connected: Boolean(node?.isConnected), themeId: node?.dataset?.themeId || null, heroLoaded: node?.dataset?.heroLoaded === "true", cssRules: node?.sheet ? node.sheet.cssRules.length : 0, rootBackground: Boolean(root && getComputedStyle(root).backgroundImage && getComputedStyle(root).backgroundImage !== "none") }; })()`;
export const REMOVE_EXPRESSION = `(() => { const node = document.getElementById(${JSON.stringify(STYLE_ID)}); if (!node) return 1; node.remove(); return node.isConnected ? 0 : 1; })()`;

export function buildSkinCss(theme, heroUrl) {
  if (!/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(heroUrl)) throw error("THEME_INVALID", "hero must be a local image data URL");
  const { accent, secondary, surface, text } = theme.colors;
  return `/* WORKBUDDY_SKIN:${theme.id} */
body[data-application-name="workbuddy"] {
  --wb-accent: ${accent}; --wb-secondary: ${secondary}; --wb-surface: ${surface}; --wb-text: ${text};
  --cb-bg-primary: var(--wb-surface) !important;
  --cb-bg-secondary: color-mix(in srgb, var(--wb-surface) 94%, transparent) !important;
  --cb-panel-bg-primary: color-mix(in srgb, var(--wb-surface) 88%, transparent) !important;
  --cb-text-primary: var(--wb-text) !important;
  --cb-text-secondary: color-mix(in srgb, var(--wb-text) 70%, transparent) !important;
  --cb-text-link: var(--wb-accent) !important;
  --cb-vscode-editor-background: var(--wb-surface) !important;
  --cb-vscode-foreground: var(--wb-text) !important;
  --cb-vscode-titleBar-activeBackground: var(--wb-accent) !important;
  --cb-vscode-button-background: var(--wb-accent) !important;
  --cb-vscode-button-hoverBackground: color-mix(in srgb, var(--wb-accent) 84%, #000) !important;
  --cb-vscode-list-hoverBackground: color-mix(in srgb, var(--wb-accent) 16%, transparent) !important;
  --cb-stroke-secondary: color-mix(in srgb, var(--wb-accent) 45%, transparent) !important;
  --wb-user-message-background: var(--wb-surface);
  --wb-user-message-text: var(--wb-text);
}
#root { color: var(--wb-text) !important; background: linear-gradient(90deg, color-mix(in srgb, var(--wb-surface) 96%, transparent) 0 23%, transparent 52%), linear-gradient(180deg, transparent 0 50%, color-mix(in srgb, var(--wb-surface) 78%, transparent) 100%), url(${JSON.stringify(heroUrl)}) right center / cover no-repeat fixed !important; }
.teams-container, .teams-container.is-mac, [data-view-id], .conversation-list, .main-content, .main-content--welcome, .sidebar-next { background: transparent !important; }
[data-view-id="sidebar"] { background: color-mix(in srgb, var(--wb-surface) 88%, transparent) !important; border-right: 1px solid color-mix(in srgb, var(--wb-accent) 45%, transparent) !important; backdrop-filter: blur(18px) saturate(1.1); }
[data-view-id="main-content"] { background: linear-gradient(180deg, transparent 0 42%, color-mix(in srgb, var(--wb-surface) 74%, transparent) 100%) !important; }
:is([data-user-message-bubble], [data-message-author-role="user"], [data-message-role="user"], [data-role="user"], .user-message, .user-message-bubble, .chat-message.user, .message.user, .message--user, .conversation-message.user) {
  color: var(--wb-user-message-text) !important;
  background: var(--wb-user-message-background) !important;
  border: 1px solid color-mix(in srgb, var(--wb-accent) 48%, var(--wb-user-message-background)) !important;
  border-radius: 12px !important;
  box-shadow: 0 8px 24px color-mix(in srgb, #000 22%, transparent) !important;
  isolation: isolate;
}
:is([data-user-message-bubble], [data-message-author-role="user"], [data-message-role="user"], [data-role="user"], .user-message, .user-message-bubble, .chat-message.user, .message.user, .message--user, .conversation-message.user) :is(p, li, span, code, pre, strong, em, a) {
  color: var(--wb-user-message-text) !important;
}
:is([data-user-message-bubble], [data-message-author-role="user"], [data-message-role="user"], [data-role="user"], .user-message, .user-message-bubble, .chat-message.user, .message.user, .message--user, .conversation-message.user) a {
  text-decoration-color: var(--wb-accent) !important;
}
${theme.copy?.brand ? `#root::before { position: fixed; z-index: 20; top: 56px; left: max(300px, 22vw); content: ${JSON.stringify(theme.copy.brand)}; color: var(--wb-accent); font: 800 22px/1.2 system-ui; text-shadow: 0 2px 10px ${surface}; pointer-events: none; }` : ""}
${theme.copy?.headline ? `#root::after { position: fixed; z-index: 20; top: 92px; left: max(300px, 22vw); max-width: 42vw; content: ${JSON.stringify(theme.copy.headline)}; color: var(--wb-text); font: 700 30px/1.15 system-ui; text-shadow: 0 2px 12px ${surface}; pointer-events: none; }` : ""}`;
}

export function injectionVerified(value, themeId) { return Boolean(value?.connected && value.themeId === themeId && value.heroLoaded && value.cssRules > 0 && value.rootBackground); }

export class Session {
  constructor(url, { WebSocketImpl = globalThis.WebSocket } = {}) { if (!/^ws:\/\/127\.0\.0\.1:\d+\//.test(url)) throw error("CDP_ERROR", "CDP WebSocket must be loopback-only"); this.url = url; this.WebSocketImpl = WebSocketImpl; this.pending = new Map(); this.nextId = 1; }
  async open() { if (typeof this.WebSocketImpl !== "function") throw error("CDP_ERROR", "WebSocket is unavailable"); this.socket = new this.WebSocketImpl(this.url); await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(error("CDP_ERROR", "CDP WebSocket connection timed out")), 5000); this.socket.onopen = () => { clearTimeout(timer); resolve(); }; this.socket.onerror = () => { clearTimeout(timer); reject(error("CDP_ERROR", "CDP WebSocket error")); }; }); this.socket.onmessage = (event) => { let message; try { message = JSON.parse(String(event.data)); } catch { for (const item of this.pending.values()) item.reject(error("CDP_ERROR", "CDP WebSocket returned malformed JSON")); this.pending.clear(); return; } const item = this.pending.get(message.id); if (!item) return; this.pending.delete(message.id); message.error ? item.reject(error("CDP_ERROR", message.error.message || "CDP command failed")) : item.resolve(message.result); }; await this.send("Runtime.enable"); await this.send("Page.enable"); return this; }
  send(method, params = {}) { const id = this.nextId++; return new Promise((resolve, reject) => { const timer = setTimeout(() => { this.pending.delete(id); reject(error("CDP_ERROR", `CDP ${method} timed out`)); }, 5000); this.pending.set(id, { resolve, reject, timer }); this.socket.send(JSON.stringify({ id, method, params })); }); }
  async evaluate(expression) { const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result?.exceptionDetails) throw error("INJECTION_FAILED", "renderer evaluation failed"); return result?.result?.value; }
  close() { this.socket?.close(); }
}

async function evaluate(target, expression, SessionImpl = Session) { const session = new SessionImpl(target.webSocketDebuggerUrl); try { await session.open(); return await session.evaluate(expression); } finally { session.close(); } }
export async function selectMainTarget(list, { SessionImpl = Session } = {}) { for (const target of list) { try { const probe = await evaluate(target, COMPATIBILITY_PROBE, SessionImpl); if (probe?.compatible) return target; } catch { /* Try the next target. */ } } return null; }
async function dataUrl(file) { const mime = MIME[extname(file).toLowerCase()]; return `data:${mime};base64,${(await readFile(file)).toString("base64")}`; }

export async function injectTheme(target, theme, { SessionImpl = Session } = {}) {
  const hero = await dataUrl(theme.hero);
  const expression = `(async () => { const image = new Image(); image.src = ${JSON.stringify(hero)}; await image.decode(); let node = document.getElementById(${JSON.stringify(STYLE_ID)}); if (!node) { node = document.createElement("style"); node.id = ${JSON.stringify(STYLE_ID)}; document.head.appendChild(node); } node.dataset.themeId = ${JSON.stringify(theme.manifest.id)}; node.dataset.heroLoaded = "true"; node.textContent = ${JSON.stringify(buildSkinCss(theme.manifest, "__HERO__"))}.replace("__HERO__", image.src); const root = document.getElementById("root"); return { connected: Boolean(node.isConnected), themeId: node.dataset.themeId, heroLoaded: node.dataset.heroLoaded === "true", cssRules: node.sheet ? node.sheet.cssRules.length : 0, rootBackground: Boolean(root && getComputedStyle(root).backgroundImage !== "none") }; })()`;
  const value = await evaluate(target, expression, SessionImpl);
  if (!injectionVerified(value, theme.manifest.id)) throw error("INJECTION_FAILED", "WorkBuddy renderer injection verification failed");
  return value;
}

async function readState(statePath = STATE) { try { return JSON.parse(await readFile(statePath, "utf8")); } catch (value) { if (value.code === "ENOENT") return null; throw value; } }
async function writeState(value, statePath = STATE) { await mkdir(dirname(statePath), { recursive: true }); const temp = `${statePath}.${process.pid}.tmp`; await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); await rename(temp, statePath); }
export { readState, writeState };

export async function commandDoctor({ platformFn = platform, discoverFn = discover } = {}) { const current = platformFn(); const app = isSupportedPlatform(current) ? discoverFn(current) : null; const info = app ? appInfoSync(app, current) : null; const runtime = { fetch: typeof fetch === "function", webSocket: typeof WebSocket === "function" }; return { status: isSupportedPlatform(current) && Boolean(info?.valid) && runtime.fetch && runtime.webSocket ? "ok" : "failed", platform: current, bundleId: current === "darwin" ? BUNDLE_ID : null, appPath: app, executablePath: info?.executablePath || null, runtime, cdpLoopbackOnly: true, asarModification: false }; }
export async function commandList({ themesDir = THEMES } = {}) { return { status: "ok", themes: await listThemes(themesDir) }; }

export async function commandApply(themeDir, port = DEFAULT_PORT, { platformFn = platform, targetsFn = targets, selectTargetFn = selectMainTarget, injectFn = injectTheme, readStateFn = readState, writeStateFn = writeState, statePath = STATE, confirmRestart = false, discoverFn = discover, restartFn = restartApplication, waitTargetsFn = waitForTargets } = {}) {
  if (!isSupportedPlatform(platformFn())) throw error("UNSUPPORTED_PLATFORM", "WorkBuddy Skin Studio supports macOS and Windows only");
  const theme = await loadTheme(themeDir);
  let list;
  try { list = await targetsFn(port); } catch (value) {
    if (!isUnavailable(value)) throw value;
    if (!confirmRestart) throw error("RESTART_CONFIRMATION_REQUIRED", "WorkBuddy is not reachable on the CDP port; rerun apply with --confirm-restart to restart it into loopback debug mode");
    const app = discoverFn(platformFn());
    if (!app) throw error("APP_UNAVAILABLE", "WorkBuddy application was not found");
    await restartFn(app, port, platformFn());
    list = await waitTargetsFn(port);
  }
  if (!list.length) throw error("NO_ELIGIBLE_RENDERER", "no WorkBuddy renderer/index.html target was found");
  const target = await selectTargetFn(list);
  if (!target) throw error("INCOMPATIBLE_RENDERER", "WorkBuddy renderer compatibility probe failed; no changes were applied");
  const result = await injectFn(target, theme);
  if (!injectionVerified(result, theme.manifest.id)) throw error("INJECTION_FAILED", "WorkBuddy renderer injection verification failed");
  await writeState({ themeId: theme.manifest.id, themeDir: theme.root, appliedAt: new Date().toISOString(), active: true }, statePath);
  return { status: "applied", themeId: theme.manifest.id, renderer: target.url, verified: injectionVerified(result, theme.manifest.id), restartRequired: false };
}

export async function commandStatus(port = DEFAULT_PORT, { platformFn = platform, targetsFn = targets, selectTargetFn = selectMainTarget, evaluateFn = evaluate, readStateFn = readState, SessionImpl = Session } = {}) {
  if (!isSupportedPlatform(platformFn())) throw error("UNSUPPORTED_PLATFORM", "WorkBuddy Skin Studio supports macOS and Windows only");
  const state = await readStateFn(); let live = null;
  try { const list = await targetsFn(port); const target = await selectTargetFn(list, { SessionImpl }); if (target) live = await evaluate(target, STATUS_EXPRESSION, SessionImpl); } catch (value) { if (!isUnavailable(value)) throw value; }
  const active = Boolean(live?.connected && live.themeId && live.themeId === state?.themeId && live.heroLoaded && live.rootBackground);
  return { status: active ? "active" : state?.themeId ? (live ? "inactive" : "unavailable") : "paused", state, renderer: live };
}

export async function commandPause(port = DEFAULT_PORT, { platformFn = platform, targetsFn = targets, selectTargetFn = selectMainTarget, evaluateFn = evaluate, readStateFn = readState, writeStateFn = writeState, statePath = STATE, SessionImpl = Session } = {}) {
  if (!isSupportedPlatform(platformFn())) throw error("UNSUPPORTED_PLATFORM", "WorkBuddy Skin Studio supports macOS and Windows only");
  let removed = false;
  try { const list = await targetsFn(port); const target = await selectTargetFn(list, { SessionImpl }); if (target) removed = (await evaluate(target, REMOVE_EXPRESSION, SessionImpl)) === 0; } catch { /* Local state is still cleared when WorkBuddy is closed. */ }
  const prior = await readStateFn(); if (prior) await writeStateFn({ ...prior, active: false, pausedAt: new Date().toISOString() }, statePath);
  return { status: "paused", removed };
}

export function launchApplication(app, port, platformName = platform()) { const args = ["--remote-debugging-address=127.0.0.1", `--remote-debugging-port=${port}`]; if (platformName === "win32") { const child = spawn(app, args, { detached: true, stdio: "ignore", windowsHide: true }); child.unref(); return child; } const child = spawn("/usr/bin/open", ["-na", app, "--args", ...args], { detached: true, stdio: "ignore" }); child.unref(); return child; }
export async function restartApplication(app, port, platformName = platform()) {
  if (platformName === "win32") {
    try { execFileSync("taskkill.exe", ["/IM", basename(app), "/T", "/F"], { stdio: "ignore" }); } catch { /* WorkBuddy may already be closed. */ }
  } else {
    try { execFileSync("/usr/bin/osascript", ["-e", `tell application id ${JSON.stringify(BUNDLE_ID)} to quit`], { stdio: "ignore" }); } catch { /* WorkBuddy may already be closed. */ }
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  return launchApplication(app, port, platformName);
}

export async function waitForTargets(port, { targetsFn = targets, delayMs = 500, timeoutMs = 20_000 } = {}) { const deadline = Date.now() + timeoutMs; let last; while (Date.now() < deadline) { try { const found = await targetsFn(port); if (found.length) return found; } catch (value) { last = value; } await new Promise((resolve) => setTimeout(resolve, delayMs)); } throw error("CDP_ERROR", `timed out waiting for WorkBuddy renderer${last ? `: ${last.message}` : ""}`); }

function parseArgs(argv) { const args = [...argv]; const command = args.shift() || "help"; const themeDir = ["apply", "validate"].includes(command) ? args.shift() : null; let port = DEFAULT_PORT; let json = false; let confirmRestart = false; for (let i = 0; i < args.length; i += 1) { if (args[i] === "--json") json = true; else if (args[i] === "--confirm-restart") confirmRestart = true; else if (args[i] === "--port") port = Number(args[++i]); else throw error("COMMAND_FAILED", `unknown argument: ${args[i]}`); } return { command, themeDir, port, json, confirmRestart }; }
function output(value, json) { console.log(json ? JSON.stringify(value, null, 2) : JSON.stringify(value)); }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const args = parseArgs(process.argv.slice(2)); const result = args.command === "doctor" ? await commandDoctor() : args.command === "list" ? await commandList() : args.command === "validate" ? { status: "valid", themeId: (await loadTheme(args.themeDir)).manifest.id } : args.command === "apply" ? await commandApply(args.themeDir, args.port, { confirmRestart: args.confirmRestart }) : args.command === "status" ? await commandStatus(args.port) : args.command === "pause" ? await commandPause(args.port) : (() => { throw error("COMMAND_FAILED", "usage: workbuddy.mjs doctor|list|validate <theme-dir>|apply <theme-dir> [--confirm-restart]|status|pause [--port PORT] [--json]"); })(); output(result, args.json); } catch (value) { console.error(JSON.stringify({ status: "failed", code: value.code || "COMMAND_FAILED", message: value.message || String(value) })); process.exitCode = 1; }
}
