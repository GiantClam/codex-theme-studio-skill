#!/usr/bin/env node

import { createHash, createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePairBundle } from "./paired.mjs";
import { loadPetContract } from "./pet.mjs";

const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APPLY = join(SKILL_ROOT, "scripts", "apply.mjs");
const ALLOWED_TARGETS = new Set(["codex", "chatgpt", "workbuddy"]);

function fail(error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ status: "failed", code: "UPLOAD_FAILED", message }));
  process.exitCode = 1;
}

export function parseArgs(argv) {
  const options = { themeDir: null, bundle: null, contract: null, endpoint: "https://codexskinstudio.com/api/submit", json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--theme-dir") options.themeDir = argv[++index];
    else if (arg === "--bundle") options.bundle = argv[++index];
    else if (arg === "--contract") options.contract = argv[++index];
    else if (arg === "--endpoint") options.endpoint = argv[++index];
    else if (arg === "--secret") options.secret = argv[++index];
    else if (arg === "--title") options.title = argv[++index];
    else if (arg === "--slug") options.slug = argv[++index];
    else if (arg === "--summary") options.summary = argv[++index];
    else if (arg === "--version") options.version = argv[++index];
    else if (arg === "--author") options.authorDisplayName = argv[++index];
    else if (arg === "--source-url") options.sourceUrl = argv[++index];
    else if (arg === "--license") options.license = argv[++index];
    else if (arg === "--targets") options.targets = argv[++index];
    else if (arg === "--categories") options.categories = argv[++index];
    else if (arg === "--palette") options.palette = argv[++index];
    else if (arg === "--confirm-share") options.confirmShare = true;
    else if (arg === "--json") options.json = true;
    else if (!options.themeDir && !options.bundle && !arg.startsWith("-")) options.themeDir = arg;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (Number(Boolean(options.themeDir)) + Number(Boolean(options.bundle)) !== 1) throw new Error("exactly one of --theme-dir or --bundle is required");
  if (options.bundle && !options.contract) throw new Error("--contract is required with --bundle");
  if (options.themeDir && options.contract) throw new Error("--contract is only valid with --bundle");
  return options;
}

function text(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function list(value, fallback) {
  return text(value, fallback).split(",").map((item) => item.trim()).filter(Boolean);
}

function targetList(value, fallback) {
  const targets = list(value, fallback);
  const unsupported = targets.filter((target) => !ALLOWED_TARGETS.has(target));
  if (unsupported.length > 0) throw new Error(`unsupported target: ${unsupported.join(", ")}`);
  return [...new Set(targets)];
}

function crc32(input) {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const [name, data] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint32(14, crc32(data), true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint32(16, crc32(data), true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, localOffset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);
    localOffset += local.length;
  }
  const localSize = localParts.reduce((sum, part) => sum + part.length, 0);
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(localSize + centralSize + 22);
  let cursor = 0;
  for (const part of localParts) { output.set(part, cursor); cursor += part.length; }
  for (const part of centralParts) { output.set(part, cursor); cursor += part.length; }
  const end = new DataView(output.buffer, cursor, 22);
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, localParts.length, true);
  end.setUint16(10, localParts.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, localSize, true);
  return output;
}

function assertCanonicalThemeAsset(value, field, required = false) {
  if (!value) {
    if (required) throw new Error(`theme ${field} is required`);
    return null;
  }
  const expected = `${field}.webp`;
  if (value !== expected) throw new Error(`theme ${field} must be ${expected}`);
  return value;
}

async function readThemeFiles(themeDir, manifest, prefix = "") {
  const files = {};
  const names = [
    "theme.json",
    assertCanonicalThemeAsset(manifest.hero, "hero", true),
    assertCanonicalThemeAsset(manifest.logo, "logo"),
    assertCanonicalThemeAsset(manifest.polaroid, "polaroid"),
  ].filter(Boolean);
  for (const name of names) files[`${prefix}${name}`] = new Uint8Array(await readFile(join(themeDir, name)));
  return files;
}

async function prepareThemePackage(themeDir) {
  const root = resolve(themeDir);
  let validation;
  try {
    const output = execFileSync(process.execPath, [APPLY, "validate", root, "--json"], { encoding: "utf8" });
    validation = JSON.parse(output);
  } catch (error) {
    throw new Error(`theme validation failed: ${error?.stderr || error?.message || error}`);
  }
  const manifest = JSON.parse(await readFile(join(root, "theme.json"), "utf8"));
  return {
    packageKind: "theme",
    sourceDirectory: root,
    manifest,
    validation,
    files: await readThemeFiles(root, manifest),
  };
}

async function preparePairedPackage(bundleDirectory, contractFile) {
  const root = resolve(bundleDirectory);
  const contractPath = resolve(contractFile);
  const contract = await loadPetContract(contractPath);
  const validation = await validatePairBundle(root, { contract });
  const bundleManifest = validation.bundle;
  const themeManifest = validation.theme.manifest;
  const petManifest = JSON.parse(await readFile(join(root, "pet", "pet.json"), "utf8"));
  if (themeManifest.id !== bundleManifest.id || validation.pet.id !== bundleManifest.id || petManifest.id !== bundleManifest.id) {
    throw new Error("paired upload requires matching bundle, theme, and Pet ids");
  }
  if (bundleManifest.contractVersion !== contract.contractVersion) throw new Error("bundle contractVersion does not match pet-contract.json");
  if (petManifest.spriteVersionNumber !== contract.spriteVersionNumber) throw new Error("Pet spriteVersionNumber does not match pet-contract.json");
  if (petManifest.contractVersion !== undefined && petManifest.contractVersion !== contract.contractVersion) throw new Error("Pet contractVersion does not match pet-contract.json");
  if (!["spritesheet.png", "spritesheet.webp"].includes(petManifest.spritesheetPath)) throw new Error("Pet spritesheetPath must be spritesheet.png or spritesheet.webp");

  const files = {
    "bundle.json": new Uint8Array(await readFile(join(root, "bundle.json"))),
    "pet-contract.json": new Uint8Array(await readFile(contractPath)),
    ...await readThemeFiles(join(root, "theme"), themeManifest, "theme/"),
    "pet/pet.json": new Uint8Array(await readFile(join(root, "pet", "pet.json"))),
    [`pet/${petManifest.spritesheetPath}`]: new Uint8Array(await readFile(join(root, "pet", petManifest.spritesheetPath))),
  };
  return {
    packageKind: "paired",
    sourceDirectory: root,
    manifest: themeManifest,
    displayName: bundleManifest.displayName,
    validation: {
      status: "valid",
      packageKind: "paired",
      bundleId: bundleManifest.id,
      themeId: themeManifest.id,
      petId: petManifest.id,
      contractVersion: contract.contractVersion,
    },
    files,
  };
}

export async function prepareUploadPackage(options) {
  const prepared = options.bundle
    ? await preparePairedPackage(options.bundle, options.contract)
    : await prepareThemePackage(options.themeDir);
  const packageBytes = storedZip(prepared.files);
  if (packageBytes.byteLength > 50 * 1024 * 1024) throw new Error("theme package exceeds the 50 MB upload limit");
  return { ...prepared, packageBytes };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sign(secret, message) {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function defaultSecretFile() {
  const root = platform() === "win32"
    ? process.env.APPDATA || join(homedir(), "AppData", "Roaming")
    : platform() === "darwin"
      ? join(homedir(), "Library", "Application Support")
      : process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(root, "CodexSkinStudio", "upload.secret");
}

async function resolveSecret(options) {
  if (text(options.secret)) return text(options.secret);
  if (text(process.env.CODEX_SKIN_STUDIO_UPLOAD_SECRET)) return text(process.env.CODEX_SKIN_STUDIO_UPLOAD_SECRET);
  try { return text(await readFile(process.env.CODEX_SKIN_STUDIO_UPLOAD_SECRET_FILE || defaultSecretFile(), "utf8")); } catch { return ""; }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.confirmShare) throw new Error("explicit sharing consent is required; pass --confirm-share only after the user agrees");
  const secret = await resolveSecret(options);
  if (!secret) throw new Error("CODEX_SKIN_STUDIO_UPLOAD_SECRET is not configured; upload was not started");
  const prepared = await prepareUploadPackage(options);
  const { manifest, packageBytes, packageKind, validation } = prepared;

  const metadata = {
    title: text(options.title, prepared.displayName || manifest.name),
    slug: text(options.slug, manifest.id),
    summary: text(options.summary, manifest.copy?.tagline || `A community theme package for ${manifest.name}.`),
    version: text(options.version, "1.0.0"),
    targets: targetList(options.targets, "codex,chatgpt"),
    categories: list(options.categories, "cyber-ui"),
    palette: list(options.palette, "mixed"),
    authorDisplayName: text(options.authorDisplayName, manifest.copy?.brand || "Community contributor"),
    sourceUrl: text(options.sourceUrl),
    license: text(options.license),
    packageKind,
  };
  const metadataJson = JSON.stringify(Object.fromEntries(Object.entries(metadata).sort(([left], [right]) => left.localeCompare(right))));
  const packageHash = sha256(packageBytes);
  const metadataHash = sha256(Buffer.from(metadataJson));
  const requestUrl = new URL(options.endpoint);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const requestId = randomUUID();
  const signature = sign(secret, ["POST", requestUrl.pathname, timestamp, requestId, packageHash, metadataHash].join("\n"));
  const form = new FormData();
  form.set("package", new Blob([packageBytes], { type: "application/zip" }), `${manifest.id}.zip`);
  form.set("metadata", metadataJson);
  const response = await fetch(requestUrl, {
    method: "POST",
    body: form,
    headers: {
      "X-Codex-Skin-Client": "codex-skin-studio",
      "X-Codex-Skin-Timestamp": timestamp,
      "X-Codex-Skin-Request-Id": requestId,
      "X-Codex-Skin-Signature": signature,
    },
  });
  const result = await response.json().catch(() => ({}));
  const output = {
    ...result,
    status: response.ok ? "pending_review" : "failed",
    requestId,
    packageKind,
    sourceDirectory: prepared.sourceDirectory,
    ...(packageKind === "theme" ? { themeDir: prepared.sourceDirectory } : { bundle: prepared.sourceDirectory }),
    validation,
  };
  if (options.json) console.log(JSON.stringify(output, null, 2));
  else console.log(response.ok ? `Uploaded ${metadata.title} for review. Slug: ${result.slug || metadata.slug}` : `${result.error || "Upload failed."}`);
  if (!response.ok) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(fail);
