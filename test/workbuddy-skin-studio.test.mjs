import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  COMPATIBILITY_PROBE,
  DEFAULT_PORT,
  REMOVE_EXPRESSION,
  STATUS_EXPRESSION,
  buildSkinCss,
  commandApply,
  commandPause,
  commandStatus,
  injectionVerified,
  listThemes,
  loadTheme,
  selectMainTarget,
  targets,
  validateManifest,
} from "../skill/workbuddy-skin-studio/scripts/workbuddy.mjs";
import { uploadTheme } from "../skill/workbuddy-skin-studio/scripts/upload-theme.mjs";
import { recommendSkins } from "../skill/workbuddy-skin-studio/scripts/remote-skins.mjs";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

function webpVp8xHeader(width = 1600, height = 900) {
  const bytes = new Uint8Array(30);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  view.setUint32(4, bytes.length - 8, true);
  bytes.set(new TextEncoder().encode("WEBPVP8X"), 8);
  view.setUint32(16, 10, true);
  const writeUint24 = (offset, value) => {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
    bytes[offset + 2] = (value >>> 16) & 0xff;
  };
  writeUint24(24, width - 1);
  writeUint24(27, height - 1);
  return bytes;
}

async function withTheme(callback) {
  const root = await mkdtemp(join(tmpdir(), "workbuddy-skin-"));
  try {
    await writeFile(join(root, "hero.png"), PNG);
    await writeFile(join(root, "theme.json"), JSON.stringify({ schemaVersion: 1, id: "test-theme", name: "Test Theme", hero: "hero.png", colors: { accent: "#24C9D7", secondary: "#EF8FD3", surface: "#10202A", text: "#FFFFFF" } }));
    return await callback(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

const target = { id: "renderer", type: "page", url: "http://workbuddy/renderer/index.html", webSocketDebuggerUrl: "ws://127.0.0.1:9223/devtools/page/renderer" };

class FakeSession {
  constructor() {}
  async open() { return this; }
  async evaluate(expression) {
    if (expression === COMPATIBILITY_PROBE) return { compatible: true, bodyMarker: true, root: true, viewCount: 3, cbVariable: "#fff" };
    if (expression === STATUS_EXPRESSION) return { installed: true, connected: true, themeId: "test-theme", heroLoaded: true, cssRules: 4, rootBackground: true };
    if (expression === REMOVE_EXPRESSION) return 0;
    return { connected: true, themeId: "test-theme", heroLoaded: true, cssRules: 4, rootBackground: true };
  }
  close() {}
}

test("validates the shared theme contract and rejects unsafe assets", () => {
  const manifest = validateManifest({ schemaVersion: 1, id: "dark-work", name: "Dark Work", hero: "hero.png", colors: { accent: "#24c9d7", secondary: "#ef8fd3", surface: "#10202a", text: "#ffffff" } });
  assert.equal(manifest.colors.surface, "#10202A");
  assert.throws(() => validateManifest({ ...manifest, hero: "../hero.png" }), /relative PNG/);
  assert.throws(() => validateManifest({ ...manifest, colors: { ...manifest.colors, text: "#111111" } }), /contrast ratio/);
});

test("filters renderer/index.html targets to loopback WebSockets", async () => {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    const cdpTarget = { ...target, webSocketDebuggerUrl: `ws://127.0.0.1:${server.address().port}/devtools/page/renderer` };
    response.end(JSON.stringify([
      cdpTarget,
      { ...cdpTarget, id: "wrong-page", url: "http://workbuddy/settings/index.html" },
      { ...cdpTarget, id: "remote", webSocketDebuggerUrl: "ws://192.168.1.4:9223/devtools/page/remote" },
    ]));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try { const result = await targets(server.address().port); assert.deepEqual(result.map((item) => item.id), ["renderer"]); } finally { server.close(); }
});

test("selects a compatible WorkBuddy renderer and fails closed", async () => {
  assert.equal((await selectMainTarget([target], { SessionImpl: FakeSession })).id, "renderer");
  class IncompatibleSession extends FakeSession { async evaluate(expression) { if (expression === COMPATIBILITY_PROBE) return { compatible: false, bodyMarker: false, root: true, viewCount: 0 }; return super.evaluate(expression); } }
  assert.equal(await selectMainTarget([target], { SessionImpl: IncompatibleSession }), null);
});

test("generates WorkBuddy CSS with cb variables and stable anchors", () => {
  const css = buildSkinCss({ id: "test-theme", colors: { accent: "#24C9D7", secondary: "#EF8FD3", surface: "#10202A", text: "#FFFFFF" }, copy: { brand: "TEST" } }, "data:image/png;base64,AA");
  assert.match(css, /body\[data-application-name="workbuddy"\]/);
  assert.match(css, /--cb-bg-primary/);
  assert.match(css, /data-view-id="sidebar"/);
  assert.match(css, /TEST/);
});

test("apply requires explicit restart confirmation when CDP is unavailable", async () => {
  await withTheme(async (themeDir) => {
    await assert.rejects(commandApply(themeDir, DEFAULT_PORT, { platformFn: () => "darwin", targetsFn: async () => { throw Object.assign(new Error("fetch failed"), { code: "ECONNREFUSED" }); }, discoverFn: () => "/Applications/WorkBuddy.app" }), (value) => value.code === "RESTART_CONFIRMATION_REQUIRED");
  });
});

test("apply writes active state only after verified mock injection", async () => {
  await withTheme(async (themeDir) => {
    const statePath = join(themeDir, "state.json");
    let launched = false;
    const result = await commandApply(themeDir, DEFAULT_PORT, {
      platformFn: () => "darwin",
      targetsFn: async () => { throw new Error("ECONNREFUSED"); },
      discoverFn: () => "/Applications/WorkBuddy.app",
      restartFn: () => { launched = true; },
      waitTargetsFn: async () => [target],
      selectTargetFn: async () => target,
      injectFn: async () => ({ connected: true, themeId: "test-theme", heroLoaded: true, cssRules: 2, rootBackground: true }),
      confirmRestart: true,
      statePath,
    });
    assert.equal(launched, true);
    assert.equal(result.status, "applied");
    assert.equal(JSON.parse(await readFile(statePath, "utf8")).active, true);
    assert.equal(injectionVerified(result.verified ? { connected: true, themeId: "test-theme", heroLoaded: true, cssRules: 2, rootBackground: true } : null, "test-theme"), true);
  });
});

test("status and pause use the same mock CDP contract", async () => {
  await withTheme(async (themeDir) => {
    const statePath = join(themeDir, "state.json");
    const state = { themeId: "test-theme", themeDir, active: true };
    const readStateFn = async () => state;
    const status = await commandStatus(DEFAULT_PORT, { platformFn: () => "darwin", targetsFn: async () => [target], selectTargetFn: async () => target, evaluateFn: async (_target, expression) => new FakeSession().evaluate(expression), readStateFn, SessionImpl: FakeSession });
    assert.equal(status.status, "active");
    const pause = await commandPause(DEFAULT_PORT, { platformFn: () => "darwin", targetsFn: async () => [target], selectTargetFn: async () => target, evaluateFn: async () => 0, readStateFn, writeStateFn: async (value) => Object.assign(state, value), statePath, SessionImpl: FakeSession });
    assert.deepEqual(pause, { status: "paused", removed: true });
    assert.equal(state.active, false);
  });
});

test("lists only valid local themes", async () => {
  await withTheme(async (themeDir) => { const themes = await listThemes(join(themeDir, "..")); assert.equal(themes.length, 1); assert.equal((await loadTheme(themeDir)).manifest.id, "test-theme"); });
});

test("uploads WorkBuddy themes with explicit consent and pending-review metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "workbuddy-upload-"));
  const secret = "workbuddy-upload-secret";
  let received;
  const server = createServer(async (request, response) => {
    try {
      const webRequest = new Request(`http://127.0.0.1${request.url}`, { method: request.method, headers: request.headers, body: request, duplex: "half" });
      const form = await webRequest.formData();
      const metadataJson = String(form.get("metadata"));
      const packageBytes = new Uint8Array(await form.get("package").arrayBuffer());
      const timestamp = String(request.headers["x-codex-skin-timestamp"]);
      const requestId = String(request.headers["x-codex-skin-request-id"]);
      const packageHash = createHash("sha256").update(packageBytes).digest("hex");
      const metadataHash = createHash("sha256").update(metadataJson).digest("hex");
      received = {
        metadata: JSON.parse(metadataJson),
        signature: request.headers["x-codex-skin-signature"],
        expectedSignature: createHmac("sha256", secret).update(["POST", "/api/submit", timestamp, requestId, packageHash, metadataHash].join("\n")).digest("hex"),
      };
      response.writeHead(201, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, slug: "workbuddy-focus" }));
    } catch (error) {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  try {
    await writeFile(join(root, "hero.webp"), webpVp8xHeader());
    await writeFile(join(root, "theme.json"), JSON.stringify({ schemaVersion: 1, id: "workbuddy-focus", name: "WorkBuddy Focus", hero: "hero.webp", colors: { accent: "#24C9D7", secondary: "#EF8FD3", surface: "#10202A", text: "#FFFFFF" } }));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const result = await uploadTheme({ themeDir: root, endpoint: `http://127.0.0.1:${server.address().port}/api/submit`, secret, confirmShare: true });
    assert.equal(result.status, "pending_review");
    assert.deepEqual(received.metadata.targets, ["workbuddy"]);
    assert.equal(received.signature, received.expectedSignature);
  } finally {
    server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("recommends WorkBuddy catalog entries by default", async () => {
  let requestedUrl;
  const previous = process.env.CODEX_SKIN_STUDIO_ALLOW_LOCAL_ENDPOINT;
  const server = createServer((request, response) => {
    requestedUrl = request.url;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ items: [{ slug: "workbuddy-focus", title: "WorkBuddy Focus", summary: "Focus mode", version: "1.0.0", targets: ["workbuddy"], categories: ["minimal"], palette: ["mixed"], downloads: 12, installable: true }] }));
  });
  try {
    process.env.CODEX_SKIN_STUDIO_ALLOW_LOCAL_ENDPOINT = "1";
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const result = await recommendSkins({ endpoint: `http://127.0.0.1:${server.address().port}`, prompt: "focus", limit: 3 });
    assert.equal(result.target, "workbuddy");
    assert.match(requestedUrl, /target=workbuddy/);
    assert.equal(result.recommendations[0].slug, "workbuddy-focus");
  } finally {
    server.close();
    if (previous === undefined) delete process.env.CODEX_SKIN_STUDIO_ALLOW_LOCAL_ENDPOINT;
    else process.env.CODEX_SKIN_STUDIO_ALLOW_LOCAL_ENDPOINT = previous;
  }
});
