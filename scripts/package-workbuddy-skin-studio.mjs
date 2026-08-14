#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "skill", "workbuddy-skin-studio");
const OUTPUT = join(ROOT, "output", "workbuddy-skin-studio.skill");
export const EXPECTED = ["SKILL.md", "agents/openai.yaml", "scripts/create-theme.mjs", "scripts/image-metadata.mjs", "scripts/workbuddy.mjs", "templates/theme.json"];

function u16(value) { const bytes = Buffer.alloc(2); bytes.writeUInt16LE(value); return bytes; }
function u32(value) { const bytes = Buffer.alloc(4); bytes.writeUInt32LE(value >>> 0); return bytes; }
function crc32(data) { let value = 0xffffffff; for (const byte of data) { value ^= byte; for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); } return (value ^ 0xffffffff) >>> 0; }
function header(name, checksum, size, central = false, offset = 0) { const bytes = Buffer.from(name); return Buffer.concat([u32(central ? 0x02014b50 : 0x04034b50), u16(20), ...(central ? [u16(20)] : []), u16(0), u16(0), u16(0), u16(0x21), u32(checksum), u32(size), u32(size), u16(bytes.length), ...(central ? [u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset)] : [u16(0)]), bytes]); }
async function files(dir, prefix = "") { const result = []; for (const entry of (await readdir(join(dir, prefix), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) { const name = prefix ? `${prefix}/${entry.name}` : entry.name; if (entry.isDirectory()) result.push(...await files(dir, name)); else if (entry.isFile()) result.push(name); else throw new Error(`unsupported source entry: ${name}`); } return result; }

export async function packageSkill() {
  const actual = await files(SOURCE);
  const expected = [...EXPECTED].sort((a, b) => a.localeCompare(b));
  const actualSorted = [...actual].sort((a, b) => a.localeCompare(b));
  if (JSON.stringify(actualSorted) !== JSON.stringify(expected)) throw new Error(`unexpected WorkBuddy Skill files: ${actual.join(", ")}`);
  const entries = []; let offset = 0; const central = [];
  for (const name of actual) { const data = await readFile(join(SOURCE, name)); const checksum = crc32(data); const local = header(`workbuddy-skin-studio/${name}`, checksum, data.length); entries.push(local, data); central.push(header(`workbuddy-skin-studio/${name}`, checksum, data.length, true, offset)); offset += local.length + data.length; }
  const directory = Buffer.concat(central); const archive = Buffer.concat([...entries, directory, u32(0x06054b50), u16(0), u16(0), u16(actual.length), u16(actual.length), u32(directory.length), u32(offset), u16(0)]);
  await mkdir(dirname(OUTPUT), { recursive: true }); await writeFile(OUTPUT, archive); return { output: OUTPUT, sha256: createHash("sha256").update(archive).digest("hex"), bytes: archive.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { try { console.log((await packageSkill()).output); } catch (value) { console.error(value.message); process.exitCode = 1; } }
