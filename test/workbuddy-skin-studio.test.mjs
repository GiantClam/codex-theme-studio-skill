import assert from "node:assert/strict";
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

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

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
