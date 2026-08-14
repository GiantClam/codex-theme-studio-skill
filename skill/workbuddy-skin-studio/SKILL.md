---
name: workbuddy-skin-studio
description: Create, validate, apply, inspect, and pause reversible local WorkBuddy skins on macOS and Windows through loopback CDP.
---

# WorkBuddy Skin Studio

This Skill provides an experimental, local-only WorkBuddy skin adapter. WorkBuddy does not document an official custom-theme API; the runtime uses a reversible CDP style injection and never modifies `app.asar`, installed files, signatures, or official JavaScript.

## Runtime contract

- Supported platforms: macOS and Windows.
- Default CDP endpoint: `127.0.0.1:9223`.
- Eligible renderer: a page whose URL contains `renderer/index.html`.
- Compatibility probe: `body[data-application-name="workbuddy"]`, `#root`, at least one `[data-view-id]` anchor, and a `--cb-*` design variable.
- Theme assets stay local. Theme files must be validated before application.
- A failed probe fails closed and leaves the current renderer unchanged.
- CDP is loopback-only. Do not expose the debug port to a network.

## Commands

```bash
node "$SKILL_ROOT/scripts/workbuddy.mjs" doctor --json
node "$SKILL_ROOT/scripts/workbuddy.mjs" list --json
node "$SKILL_ROOT/scripts/workbuddy.mjs" validate "/absolute/path/to/theme" --json
node "$SKILL_ROOT/scripts/workbuddy.mjs" apply "/absolute/path/to/theme" --json
node "$SKILL_ROOT/scripts/workbuddy.mjs" apply "/absolute/path/to/theme" --confirm-restart --json
node "$SKILL_ROOT/scripts/workbuddy.mjs" status --json
node "$SKILL_ROOT/scripts/workbuddy.mjs" pause --json
```

`apply` first tries the already-running debug renderer. If it cannot reach CDP, stop and explain that WorkBuddy must be restarted with loopback debugging. Only use `--confirm-restart` after the user explicitly confirms that WorkBuddy may be restarted and active work has been saved. The runtime then launches WorkBuddy with `--remote-debugging-address=127.0.0.1` and the configured port.

`pause` removes the injected style when the renderer is reachable and marks local state inactive. A manual WorkBuddy restart also removes the ephemeral style.

## Theme creation

For a user-provided or generated hero, inspect it first, choose four colors with readable `surface` and `text`, then run:

```bash
node "$SKILL_ROOT/scripts/create-theme.mjs" \
  --id "theme-id" \
  --name "Theme Name" \
  --out "/absolute/path/to/theme-id" \
  --hero "/absolute/path/to/hero.webp" \
  --accent "#24C9D7" \
  --secondary "#EF8FD3" \
  --surface "#10202A" \
  --text "#FFFFFF"
```

Keep images and theme metadata local by default. Use only assets the user is authorized to use. Do not add arbitrary CSS or remote image URLs to a theme package.

## Community sharing

After a user creates and validates a theme, present the theme id, display name, summary, palette, and local directory. Then ask whether they want to upload it to the community. This is the same consent boundary as the Codex Skin Studio flow: do not upload, publish, or call a sharing endpoint without an explicit yes. A no or no response leaves the theme local.

Use the shared upload helper with `--targets workbuddy` only after explicit consent:

```bash
node "$SKILL_ROOT/scripts/upload-theme.mjs" \
  --theme-dir "/absolute/path/to/theme-id" \
  --title "Theme Name" \
  --slug "theme-id" \
  --summary "A concise public description." \
  --version "1.0.0" \
  --targets "workbuddy" \
  --categories "minimal" \
  --palette "mixed" \
  --author "Creator or studio name" \
  --confirm-share \
  --json
```

The server returns `pending_review` for accepted WorkBuddy submissions. Upload
does not mean published: the platform must review and publish the skin before it
appears in public catalog or download results.

Published WorkBuddy skins use the same read/download path:

```bash
node "$SKILL_ROOT/scripts/remote-skins.mjs" list \
  --target workbuddy \
  --json

node "$SKILL_ROOT/scripts/remote-skins.mjs" install \
  --slug "theme-id" \
  --confirm-install \
  --download-only \
  --json
```

## Reporting

Do not claim runtime success from static checks. In this repository, report real WorkBuddy verification separately from local tests. Real acceptance requires, on both macOS and Windows, `doctor -> apply -> status -> pause` against the installed WorkBuddy client and at least one current release. Because renderer selectors and `--cb-*` variables are implementation evidence rather than an official API, re-run this smoke test after WorkBuddy updates.
