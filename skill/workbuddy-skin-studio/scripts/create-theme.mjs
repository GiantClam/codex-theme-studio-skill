#!/usr/bin/env node

import { copyFile, mkdir, rm, rename, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTheme, validateManifest } from "./workbuddy.mjs";

function parseArgs(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i += 1) { const key = argv[i]; if (key === "--replace") values.replace = true; else if (key.startsWith("--")) values[key.slice(2)] = argv[++i]; else throw new Error(`unexpected argument: ${key}`); }
  for (const key of ["id", "name", "out", "hero", "accent", "secondary", "surface", "text"]) if (!values[key]) throw new Error(`missing required option: --${key}`);
  return values;
}

export async function createTheme(options) {
  const manifest = validateManifest({ schemaVersion: 1, id: options.id, name: options.name, hero: `hero${extname(options.hero).toLowerCase()}`, colors: { accent: options.accent, secondary: options.secondary, surface: options.surface, text: options.text }, ...(options.brand || options.headline || options.tagline ? { copy: { ...(options.brand ? { brand: options.brand } : {}), ...(options.headline ? { headline: options.headline } : {}), ...(options.tagline ? { tagline: options.tagline } : {}) } } : {}) });
  const destination = resolve(options.out); const temp = `${destination}.tmp-${process.pid}`;
  await rm(temp, { recursive: true, force: true }); await mkdir(temp, { recursive: true });
  await copyFile(resolve(options.hero), join(temp, manifest.hero));
  await writeFile(join(temp, "theme.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const theme = await loadTheme(temp);
  await writeFile(join(temp, "theme.json"), `${JSON.stringify(theme.manifest, null, 2)}\n`);
  if (options.replace) await rm(destination, { recursive: true, force: true });
  await rename(temp, destination);
  return { status: "created", themeDir: destination, themeId: manifest.id };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { try { console.log(JSON.stringify(await createTheme(parseArgs(process.argv.slice(2))), null, 2)); } catch (value) { console.error(JSON.stringify({ status: "failed", message: value.message })); process.exitCode = 1; } }
