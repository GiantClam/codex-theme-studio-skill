#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ENDPOINT = "https://codexskinstudio.com";
const TRUSTED_ORIGINS = new Set(["https://codexskinstudio.com", "https://www.codexskinstudio.com"]);
const MAX_PACKAGE_BYTES = 50 * 1024 * 1024;

function error(message, code = "REMOTE_SKIN_FAILED") {
  const result = new Error(message);
  result.code = code;
  return result;
}

function parseArgs(argv) {
  const command = argv.shift() || "help";
  const options = { command, endpoint: DEFAULT_ENDPOINT, json: false, limit: 24, target: "workbuddy" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--confirm-install") options.confirmInstall = true;
    else if (arg === "--download-only") options.downloadOnly = true;
    else if (arg === "--endpoint") options.endpoint = argv[++index];
    else if (arg === "--query" || arg === "-q") options.query = argv[++index];
    else if (arg === "--prompt") options.prompt = argv[++index];
    else if (arg === "--target") options.target = argv[++index];
    else if (arg === "--category") options.category = argv[++index];
    else if (arg === "--palette") options.palette = argv[++index];
    else if (arg === "--sort") options.sort = argv[++index];
    else if (arg === "--limit") options.limit = Number(argv[++index]);
    else if (arg === "--slug") options.slug = argv[++index];
    else if (arg === "--output") options.output = argv[++index];
    else if (!arg.startsWith("-") && !options.slug) options.slug = arg;
    else throw error(`unknown argument: ${arg}`, "INVALID_ARGUMENT");
  }
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 48) throw error("--limit must be an integer from 1 through 48", "INVALID_ARGUMENT");
  return options;
}

function endpointUrl(value, path = "/") {
  let url;
  try { url = new URL(value); } catch { throw error("endpoint must be a valid URL", "INVALID_ENDPOINT"); }
  const localAllowed = process.env.CODEX_SKIN_STUDIO_ALLOW_LOCAL_ENDPOINT === "1";
  const isLocal = url.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  if (!TRUSTED_ORIGINS.has(url.origin) && !(localAllowed && isLocal)) throw error("remote skin access is restricted to codexskinstudio.com", "UNTRUSTED_ENDPOINT");
  return new URL(path, url.origin + (url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`));
}

function assertTrustedOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw error("the skin download URL is invalid", "UNTRUSTED_DOWNLOAD"); }
  if (!TRUSTED_ORIGINS.has(url.origin) && !(process.env.CODEX_SKIN_STUDIO_ALLOW_LOCAL_ENDPOINT === "1" && url.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(url.hostname))) throw error("the skin request redirected to an untrusted origin", "UNTRUSTED_DOWNLOAD");
  return url;
}

function assertTrustedDownload(value) {
  const url = assertTrustedOrigin(value);
  if (!url.pathname.startsWith("/download/") || url.hash) throw error("the skin download URL is not an official archive URL", "UNTRUSTED_DOWNLOAD");
  const grant = url.searchParams.get("grant");
  if (!grant || [...url.searchParams.keys()].some((key) => key !== "grant")) throw error("the skin download URL does not contain a short-lived grant", "UNTRUSTED_DOWNLOAD");
  return url;
}

async function fetchResponse(url, init = {}) {
  const response = await fetch(url, { ...init, redirect: "follow", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw error(`remote skin request failed with HTTP ${response.status}`, "REMOTE_HTTP_ERROR");
  if (response.redirected) assertTrustedOrigin(response.url);
  return response;
}

async function fetchJson(url) {
  const response = await fetchResponse(url, { headers: { accept: "application/json" } });
  try { return await response.json(); } catch { throw error("remote skin response was not valid JSON", "REMOTE_RESPONSE_INVALID"); }
}

function normalizeCatalogItem(item, endpoint) {
  if (!item || typeof item !== "object" || typeof item.slug !== "string" || !item.slug) throw error("remote skin catalog contained an invalid item", "REMOTE_RESPONSE_INVALID");
  const detailUrl = endpointUrl(endpoint, `/skins/${encodeURIComponent(item.slug)}`).toString();
  let imageUrl = null;
  for (const candidate of [item.heroUrl, item.thumbnailUrl, item.previewUrl]) {
    if (typeof candidate !== "string" || !candidate) continue;
    try { imageUrl = assertTrustedOrigin(new URL(candidate, endpointUrl(endpoint).origin).toString()).toString(); break; } catch { /* Keep the trusted detail URL. */ }
  }
  return {
    slug: item.slug,
    title: item.title || item.slug,
    version: item.version || null,
    authorDisplayName: item.authorDisplayName || null,
    summary: item.summary || "",
    targets: Array.isArray(item.targets) ? item.targets : [],
    categories: Array.isArray(item.categories) ? item.categories : [],
    palette: Array.isArray(item.palette) ? item.palette : [],
    downloads: Number.isFinite(item.downloads) ? item.downloads : 0,
    packageKind: item.packageKind || "theme",
    installable: item.installable === true || typeof item.packageSha256 === "string",
    downloadRequiresGrant: true,
    imageUrl,
    detailUrl,
  };
}

async function listSkins(options) {
  const url = endpointUrl(options.endpoint, "/api/skins");
  for (const [key, value] of [["q", options.query], ["target", options.target], ["category", options.category], ["palette", options.palette], ["sort", options.sort]]) if (value) url.searchParams.set(key, value);
  url.searchParams.set("limit", String(options.limit));
  const result = await fetchJson(url);
  if (!result || !Array.isArray(result.items)) throw error("remote skin catalog response did not contain an items array", "REMOTE_RESPONSE_INVALID");
  return { ...result, items: result.items.map((item) => normalizeCatalogItem(item, options.endpoint)) };
}

function rankRecommendation(item, prompt) {
  const tokens = [...new Set((prompt.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((token) => token.length > 1))];
  const searchable = [item.title, item.summary, item.authorDisplayName, ...item.categories, ...item.palette, ...item.targets].join(" ").toLocaleLowerCase();
  const keywordMatches = tokens.filter((token) => searchable.includes(token));
  return { ...item, recommendationScore: keywordMatches.length * 5 + Math.min(item.downloads / 1000, 1), recommendationReason: keywordMatches.map((token) => `keyword:${token}`) };
}

async function recommendSkins(options) {
  const prompt = typeof options.prompt === "string" ? options.prompt.trim() : "";
  if (!prompt) throw error("recommend requires a non-empty --prompt", "INVALID_ARGUMENT");
  const direct = await listSkins({ ...options, query: prompt, target: options.target || "workbuddy", sort: options.sort || "downloads" });
  const items = direct.items.map((item) => rankRecommendation(item, prompt)).sort((left, right) => right.recommendationScore - left.recommendationScore || right.downloads - left.downloads).slice(0, options.limit);
  return { status: "ok", mode: "prompt-recommendation", prompt, target: options.target || "workbuddy", count: items.length, recommendations: items };
}

async function requestDownloadGrant(endpoint, slug) {
  const response = await fetchResponse(endpointUrl(endpoint, `/api/skins/${encodeURIComponent(slug)}/download-grant`), {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ confirm: true }),
  });
  let grant;
  try { grant = await response.json(); } catch { throw error("download grant response was not valid JSON", "REMOTE_RESPONSE_INVALID"); }
  if (!grant || grant.status !== "granted" || typeof grant.downloadUrl !== "string" || typeof grant.packageSha256 !== "string") throw error("download grant response was invalid", "REMOTE_RESPONSE_INVALID");
  assertTrustedDownload(grant.downloadUrl);
  return grant;
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function appDataRoot() {
  if (platform() === "win32") return process.env.APPDATA || join(homedir(), "AppData", "Roaming");
  if (platform() === "darwin") return join(homedir(), "Library", "Application Support");
  return process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
}

async function downloadPublishedSkin(endpoint, slug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw error("slug must use lowercase letters, numbers, and hyphens", "INVALID_ARGUMENT");
  const detail = await fetchJson(endpointUrl(endpoint, `/api/skins/${encodeURIComponent(slug)}`));
  if (detail.status !== "published") throw error("only published skins can be downloaded", "SKIN_NOT_PUBLISHED");
  if (!Array.isArray(detail.targets) || !detail.targets.includes("workbuddy")) throw error("this published skin does not target WorkBuddy", "TARGET_MISMATCH");
  if (!detail.installable || typeof detail.packageSha256 !== "string" || !/^[0-9a-f]{64}$/i.test(detail.packageSha256)) throw error("this published skin has no verified package and cannot be downloaded", "SKIN_NOT_INSTALLABLE");
  const grant = await requestDownloadGrant(endpoint, slug);
  if (grant.packageSha256.toLowerCase() !== detail.packageSha256.toLowerCase()) throw error("download grant checksum does not match the published checksum", "PACKAGE_HASH_MISMATCH");
  const response = await fetchResponse(assertTrustedDownload(grant.downloadUrl), { headers: { accept: "application/zip" } });
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_PACKAGE_BYTES) throw error("skin package exceeds the 50 MB limit", "ZIP_LIMIT");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_PACKAGE_BYTES) throw error("skin package exceeds the 50 MB limit", "ZIP_LIMIT");
  const actualHash = hash(bytes);
  if (actualHash.toLowerCase() !== detail.packageSha256.toLowerCase()) throw error("skin package checksum does not match the published checksum", "PACKAGE_HASH_MISMATCH");
  return { detail, bytes, packageSha256: actualHash, grantExpiresAt: grant.expiresAt };
}

function printResult(value, jsonOutput) {
  if (jsonOutput) console.log(JSON.stringify(value, null, 2));
  else if (value.recommendations) console.log(value.recommendations.map((item, index) => `${index + 1}. ${item.title} ${item.detailUrl}`).join("\n") || "No matching published WorkBuddy skins found.");
  else if (value.items) console.log(value.items.map((item) => `${item.slug}\t${item.title}\t${item.version}\t${item.installable ? "downloadable" : "metadata-only"}`).join("\n") || "No published WorkBuddy skins found.");
  else if (value.status === "downloaded") console.log(`Downloaded ${value.title} to ${value.path}`);
  else console.log(JSON.stringify(value));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "recommend") return printResult(await recommendSkins(options), options.json);
  if (options.command === "list") return printResult(await listSkins(options), options.json);
  if (options.command !== "install") throw error("usage: remote-skins.mjs recommend --prompt \"...\" | list [filters] | install --slug <slug> --confirm-install --download-only", "INVALID_ARGUMENT");
  if (!options.slug) throw error("skin slug is required", "INVALID_ARGUMENT");
  if (!options.confirmInstall) throw error("explicit download consent is required; pass --confirm-install only after the user agrees", "CONFIRMATION_REQUIRED");
  if (!options.downloadOnly) throw error("WorkBuddy cloud skins are downloaded first; pass --download-only, then validate/apply the local theme with workbuddy.mjs", "DOWNLOAD_ONLY_REQUIRED");
  const downloaded = await downloadPublishedSkin(options.endpoint, options.slug);
  const target = resolve(options.output || join(appDataRoot(), "WorkBuddySkinStudio", "downloads", `${options.slug}-${downloaded.packageSha256.slice(0, 12)}.zip`));
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await writeFile(target, downloaded.bytes, { mode: 0o600 });
  printResult({ status: "downloaded", slug: options.slug, title: downloaded.detail.title, path: target, packageSha256: downloaded.packageSha256 }, options.json);
}

export { downloadPublishedSkin, endpointUrl, listSkins, normalizeCatalogItem, parseArgs, rankRecommendation, recommendSkins, requestDownloadGrant };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((caught) => {
    console.error(JSON.stringify({ status: "failed", code: caught?.code || "REMOTE_SKIN_FAILED", message: caught?.message || String(caught) }, null, 2));
    process.exitCode = 1;
  });
}
