---
name: codex-skin-studio
description: Design, generate, validate, apply, inspect, or remove hero-led or paired theme and Pet skins for ChatGPT Desktop on macOS or Windows. Supports text-to-image generation, direct background images, subject-preserving image composition, style-reference generation, and multi-image composition. Use when the user asks to reskin ChatGPT Desktop, create a desktop theme or background, preserve a person, product, or object from an image, derive a skin from a style reference, apply a generated workspace, inspect the active skin, or restore the native interface.
---

# ChatGPT Desktop Skin Studio

Let Codex handle visual decisions. Delegate file validation, application discovery,
restart orchestration, and CDP injection to `scripts/apply.mjs`.

Every generated skin is a paired bundle by default: one ChatGPT Desktop theme and
one compatible Pet package. Generate a theme-only package only when the user
explicitly asks for a theme without a Pet, a theme-only package, or equivalent.
The theme is applied automatically and the Pet is installed locally. On supported
ChatGPT Desktop builds, `switch-paired.mjs` uses the versioned visible Settings >
Pets adapter to Refresh, select the matching Pet, and verify the selected row. It
does not write private app state or modify application resources. If the visible UI
is unavailable, the command keeps the theme result and returns a truthful
manual-refresh fallback.

The bundled default example is `examples/slayers-xellos-night/`. Use it as a
known-good reference for the one-shot theme file layout and as the starter skin
when a user asks to preview the included example. It is an example asset, not an
automatic replacement for the user's active theme.

## Operating rules

- Keep the runtime theme hero-led. Optional presentation assets are limited to a brand logo and one portrait card; do not create component packs, websites, or another runtime.
- Never modify `app.asar`, the application bundle, the code signature, or official JavaScript.
- Target ChatGPT Desktop on macOS or Windows. macOS uses the technical bundle identifier `com.openai.codex`; Windows uses the ChatGPT executable discovered from standard install locations, `where.exe`, or the Microsoft Store package install directory through PowerShell.
- Generate without restarting when the user asks only for a design. When the user explicitly asks to apply or replace a skin, complete application and enable persistence for the selected theme.
- When the user asks to generate or create a skin, generate a matching Pet by default, derive its character design from the theme brief, Hero, and brand treatment, and finish with a validated paired bundle. Do not wait for a separate Pet request. Use the theme-only workflow only after an explicit user request.
- After a theme or paired skin package is successfully created and validated, pause and ask whether the user wants to upload it to the Codex Skin community. Never silently skip this consent step and never upload from generation alone.
- Use the built-in `$imagegen` skill by default. When a generated or edited image is required, invoke `$imagegen` before creating theme files or running `apply.mjs`; do not treat a prompt such as "use imagegen" as a completed generation step.
- `$imagegen` must use the native `image_gen` tool by default. Do not replace it with a Node script, an HTTP request, an OpenAI API call, or the CLI fallback. If native generation is unavailable or returns an error, report the exact error and ask for a final local background image. Do not request an API key or switch to an external image service automatically.
- Use one canonical role schema for multi-image inputs: `subject/object`, `style-reference`, `composition/layout-reference`, or `brand/logo`. Direct background and single-image subject workflows are separate modes and do not use this multi-image role schema.
- For a specified subject, preserve identity, silhouette, proportions, materials, clothing, defining details, colors, markings, or product geometry. Change only the environment, lighting, shadows, framing space, and placement.
- For a style reference, carry over visual traits such as color, materials, lighting, rendering, density, mood, and period. Do not copy its subject or unique composition by default.
- Do not generate buttons, menus, chat text, watermarks, shortcut instructions, or fake UI. Preserve a source logo only when explicitly requested and authorized.
- Optional presentation assets are allowed only when explicitly requested: `logo` replaces the ChatGPT workspace label in the left menu, and `polaroid` adds a non-interactive portrait card at the lower right. Every generated theme gets a styled `copy.brand` label when no logo is supplied: use the explicit brand name when provided, otherwise default to the theme name. `copy.headline` and `copy.tagline` create a right-side information card only when explicitly requested; do not add them by default.
- Do not use one universal brand treatment. After inspecting the final Hero, choose a matching `--brand-style` preset from `anime`, `cyberpunk`, `editorial`, `military`, `mystic`, or `romantic` based on its visual signals: palette, materials, lighting, era, subject, and energy. Store the selected preset as `copy.brandStyle.preset` so the runtime can render theme-specific typography and decoration.
- Keep the brand text clean: do not add `//`, slash separators, pipes, or synthetic punctuation to a generated brand name unless the user explicitly requests that exact text. Decorative lines may appear outside the text above, below, or at the sides; never cross through the glyphs.
- The injected `Skins` menu must refresh the loopback `/themes` endpoint when opened and while it remains mounted, so a successfully created local theme appears without restarting ChatGPT Desktop or manually re-injecting CSS. Keep the initial injected list as a fallback when the optional control worker is unavailable.
- When a `Skins` menu item has a matching local paired Bundle, switch the theme and its Pet as one operation: install or refresh the Bundle's Pet, select the stable Custom Pet slot through the visible native Pets UI, and verify `petSelection.selection === "native-ui-confirmed"` before reporting success. A theme-only result is not a successful paired switch.
- Serialize theme application through the persistence worker. Do not allow the control endpoint and the background renderer-recovery loop to inject different themes at the same time.
- Keep large raster assets usable in a Renderer stylesheet: decode the Hero first and compress oversized Hero data to a smaller WebP data URL before assigning CSS. Do not rely on a multi-megabyte PNG data URL surviving CSS parsing.
- Write every distributed artifact, script comment, diagnostic, log message, example, and template in English ASCII. Reply in the user's language.

## Brand workbench composition contract

Every generated hero must be designed as a background for a layered ChatGPT Desktop workbench, not as a standalone poster or a baked UI mockup. Include these zones in the visual brief and generation prompt:

- Left: reserve quiet, low-contrast space for the brand logo and the dedicated navigation system. The real sidebar and its navigation remain live UI; never draw them into the image.
- Center: provide the immersive background scene and preserve room for the runtime gradient safety layer behind conversation content.
- Right: place the preserved person or product subject in the open right third and reserve nearby breathing room for an optional brand information card.
- Bottom: keep the lower 20% calm and low-contrast for the dedicated input workbench and approval controls.
- Lower right: treat the optional portrait card as a secondary non-core accent. It must never cover the subject, the composer, or the primary brand information.

The generated image supplies the scene, atmosphere, subject, and negative space. The injector supplies the live logo, navigation styling, gradient safety layer, optional brand copy, composer treatment, and optional portrait card. Do not generate text, cards, menus, buttons, chat bubbles, or fake UI inside the hero image.

## Runtime readability contract

The hero is never the only contrast layer. The injector must keep live controls
readable above the image by using opaque or nearly opaque theme-derived surfaces
for the composer, send button, menus, dialogs, right-side file or document
previews, selected items, and keyboard focus. Prefer the theme surface and text
colors over white or black defaults. Pick a foreground for the accent button
that has the strongest contrast against the accent. Never rely on opacity alone
for disabled or secondary controls, and never allow a light default panel token
to remain behind light theme text.

## Five-zone generation contract

Every visual brief and image-generation prompt must explicitly reserve these five zones:

1. Left: a quiet brand-logo and dedicated-navigation safe zone. The live ChatGPT Desktop navigation remains interactive and is overlaid by the injector.
2. Center: an immersive scene with a readable gradient safety layer behind conversation content.
3. Right: the preserved person or product in the open right third, with adjacent breathing room for an optional brand information card.
4. Bottom: a calm, low-contrast input-workbench safe zone covering roughly the lower 20 percent of the hero.
5. Lower right: an optional portrait card area treated as secondary decoration; it must not cover the subject or composer.

The hero must be a background asset, not a screenshot or poster. Do not draw UI controls, fake navigation, chat content, cards, buttons, logos, or text into it.

When no logo asset is supplied, `copy.brand` replaces the live top workspace label with scoped styled text. The creator defaults this value to the theme name unless the user provides an explicit brand name. The selector must target only the top navigation mode button; never use a broad sidebar `:first-child`, generic menu-button, project-action, or account-button selector.

## Runtime discovery

Treat the directory containing this file as `SKILL_ROOT`. Prefer the current
`node` executable. If it is unavailable, use the Node executable bundled with
Codex:

```bash
node "$SKILL_ROOT/scripts/apply.mjs" doctor --json
```

```bash
"/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node" \
  "$SKILL_ROOT/scripts/apply.mjs" doctor --json
```

On Windows, use the same `node` command from PowerShell or Command Prompt. The runtime discovers ChatGPT Desktop from `%LOCALAPPDATA%\\Programs\\ChatGPT\\ChatGPT.exe`, other standard install locations, `where.exe`, or the Microsoft Store package install directory; it does not require a hard-coded user name or drive letter.

For Windows apply or update operations, use the external runner from a separate
PowerShell process. It keeps the restart and CDP handshake outside the Codex
renderer that is being restarted:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File `
  "$env:USERPROFILE\\.codex\\skills\\codex-skin-studio\\scripts\\windows\\apply.ps1" `
  -ThemeDir "C:\\absolute\\path\\to\\theme" -Persist
```

The runner validates the theme, reuses an existing loopback CDP session when
available, otherwise closes the visible Codex app, starts the MSIX app through
its AUMID, waits for port `9341`, and then runs `apply.mjs apply`. Its final
result must be `{"status":"applied"}`. If the Codex app does not preserve the
debugging arguments, the runner stops with a diagnostic instead of retrying.

## Classify input images

1. Inspect every local image with `view_image` before editing or composing it.
2. Select the workflow mode from the user's wording:
   - Direct background: use the image itself as the final background.
   - Single-image subject: preserve the specified subject and rebuild the rest.
   - Style reference: derive visual language only.
   - Multi-image composition: assign each input exactly one role from the canonical four-role schema.
3. Label multi-image inputs explicitly, such as `Image 1: subject/object` and `Image 2: style-reference`.
4. State what each image may contribute and what must remain unchanged. Do not assign conflicting or ambiguous roles.
5. Prioritize subject fidelity over style matching, and safe zones over reference composition. Validate subject, style, and layout separately.
6. Do not ask again when the user already specified a role. If subject preservation versus style-only use is unclear, ask only that question.
7. Reject empty files and formats other than PNG, JPEG, or WebP.

## Invoke image generation

Use this gate for every workflow that is not `direct-background`:

1. Finish the visual brief and label every input image role before calling `$imagegen`.
2. Add the full brand workbench composition contract to the prompt: left logo/navigation, center immersive scene plus gradient safety layer, right subject plus brand information card, bottom input workbench, and optional lower-right portrait card.
3. For a local subject or reference image, pass its exact absolute path as the native tool's reference input after `view_image` has succeeded. For an image attached only to the current conversation, use the native tool's conversation-image input instead.
4. For subject preservation, use edit or compositing semantics and repeat the invariants in the prompt. For style-only references, use generation semantics and explicitly forbid copying the source subject.
5. Wait for the native tool result. Do not create `hero`, `theme.json`, or claim that generation completed before a result is returned.
6. If the native tool returns `404 Not Found`, first verify that the referenced file exists and is readable. Retry once only with the corrected input or an image that is actually available in the current visual context. If the tool reports that no conversation images are available, stop and ask the user to reattach the source image in the current task or provide a final local background. Do not loop and do not switch to CLI/API mode.
7. Inspect the returned image with Vision. If one invariant fails, make one targeted `$imagegen` retry; otherwise continue to theme creation.

## Use a final background directly

1. Use the direct-background mode and skip Image Generation.
2. Check aspect ratio, safe zones, text, watermarks, and interface readability.
3. Explain any failure. Switch to edit mode only when the user allows image modification.
4. Save an accepted image as the final `hero.<ext>`.

## Preserve a specified subject

1. Use the single-image subject mode.
2. Invoke `$imagegen` and use its native `image_gen` edit or composition flow directly. Do not create a transparent cutout first.
3. Repeat these invariants in the prompt: identity, face, silhouette, proportions, clothing, colors, materials, markings, source logo, and product geometry as applicable.
4. Allow changes only to the background, environment, lighting, shadows, framing space, canvas extension, and subject placement.
5. Create a reusable transparent cutout only when explicitly requested. Start with the built-in chroma-key workflow.
6. For hair, glass, smoke, translucent materials, or other complex edges that require true native transparency, explain the API or CLI fallback and API-key requirement, then wait for explicit approval before using it.
7. Compare source and result with Vision. If identity or product structure drifts, retry once with only the failed invariant strengthened.

## Use a style reference

1. Mark the image as `style-reference` and use generation, not source-image editing.
2. Extract colors, contrast, materials, brushwork or rendering, lighting, density, mood, and period.
3. Create a new scene and composition. Do not copy people, characters, text, logos, trademarks, or unique arrangement unless explicitly requested and authorized.
4. Combine the style traits with the Codex safe-zone constraints in the `$imagegen` prompt.
5. Verify that the result matches the requested visual language while remaining a new skin image.

## Generate from multiple images

1. Inspect every input with Vision and assign each image exactly one explicit role: `subject/object`, `style-reference`, `composition/layout-reference`, or `brand/logo`.
2. State the role and permitted contribution before generation. Preserve the subject or object source's identity, silhouette, proportions, materials, colors, markings, and geometry. Transfer only visual language from the style reference. Use the composition/layout reference only for camera, framing, balance, and spatial relationships. Preserve a brand or logo only when the user explicitly requests it and is authorized to use it; otherwise omit it.
3. Combine the inputs in one generation prompt with the brand workbench contract: create a 16:9 landscape ChatGPT Desktop hero; reserve the left 26% for the brand logo and live navigation; keep the center immersive but readable behind the gradient safety layer; place the preserved subject or object in the right third with space for a brand information card; keep the bottom 20% low-contrast for the input workbench; treat the lower-right portrait card as optional and secondary.
4. Do not add text, logos, watermarks, buttons, menus, fake panels, chat bubbles, or code unless the user explicitly requests them. Do not copy a reference image's subject or unique arrangement when its role is style or composition only.
5. After generation, inspect the result with Vision for subject or object preservation, layout safety in the left sidebar and bottom composer zones, and UI contrast/readability. If any check fails, regenerate once with only the failed constraint strengthened.
6. After the result passes inspection, create `hero.png` and `theme.json` in the theme directory. Add `logo.png` and/or `polaroid.png` only when the user explicitly requests those presentation assets. Do not retain input copies, reference images, cutouts, or intermediate files. Continue with the default paired Pet workflow below before reporting the generated skin. Use the theme-only validation and apply commands only when the user explicitly requests a theme-only package:

```bash
node "$SKILL_ROOT/scripts/apply.mjs" validate "/absolute/path/to/theme" --json
node "$SKILL_ROOT/scripts/apply.mjs" apply "/absolute/path/to/theme" --json
```

## Generate from text

1. Create a visual brief covering theme, mood, palette, subject placement, safe zones, prohibited content, and the matching Pet's character identity and motion language.
2. Invoke `$imagegen` and use the native `image_gen` tool to generate a 16:9 landscape hero image.
3. Follow the brand workbench contract: keep the left 26% quiet for the brand logo and dedicated navigation, make the center immersive but readable behind a gradient safety layer, place the main subject and optional brand information card in the right third, keep the bottom 20% low-contrast for the dedicated input workbench, and keep any portrait card secondary in the lower right.
4. Keep important faces and objects out of the left sidebar safe zone. Avoid dense detail, bright highlights behind text, centered subjects, fake panels, cropped faces, text, logos, watermarks, buttons, chat bubbles, and code.
5. Use Vision to verify readability. If the result fails, make one targeted regeneration; do not iterate without a bound.

## One-shot theme output contract

When the user asks to create a skin, finish the full paired file-producing workflow in one pass: obtain or generate the final Hero, inspect it, derive colors and the brand name, generate a matching Pet canonical reference and action frames, assemble and validate the Pet against the observed contract, create and validate `theme.json`, create and validate the paired bundle, and report the bundle directory plus its theme and Pet contents. Do not leave a partially written theme, Pet, or bundle, and do not ask the user to assemble files manually. A theme-only output is permitted only after the user explicitly requests one.

When the user asks to create and apply, use the one-shot paired switch path. Do not stop after writing files, and do not report success from a CDP command alone. The final evidence must include an applied or active theme and either `petSelection.selection: "native-ui-confirmed"` with a loaded sprite asset or the truthful `refresh-required` manual fallback.

## Create theme files

1. Decide the final theme id, display name, matching Pet id, Hero path, four colors, and any explicitly requested optional assets before writing files. Use the same source id for the theme, Pet, and paired bundle unless a low-level migration requires otherwise.
2. Create one clean output directory. For generated output, copy the final image returned by `$imagegen` from its reported local output path into that directory; never reference only the cache path. If no local output path is reported, ask for a final local background instead of guessing a cache filename.
3. For a supplied or directly accepted image, copy it into the output directory as the hero asset.
4. Derive six-digit hex values for `accent`, `secondary`, `surface`, and `text` from the final hero image.
5. Inspect the final Hero for its dominant visual language and select a brand style preset. Use `military` for patriotic, insignia, uniform, or bold national visual language; `anime` for graphic character art; `cyberpunk` for neon, technical, or digital scenes; `mystic` for magic, gothic, occult, or arcane scenes; `romantic` for soft celestial or relationship-focused scenes; and `editorial` for restrained premium or photographic scenes.
6. Use `scripts/create-theme.mjs` once to create the complete theme directory and manifest in one operation. Add `--replace` when replacing an existing generated directory:

```bash
node "$SKILL_ROOT/scripts/create-theme.mjs" \
  --id "theme-id" \
  --name "Theme Name" \
  --out "/absolute/path/to/theme-id" \
  --hero "/absolute/path/to/final-hero.webp" \
  --accent "#00AAFF" \
  --secondary "#FF00AA" \
  --surface "#101018" \
  --text "#FFFFFF" \
  --brand "Brand Name" \
  --brand-style "mystic" \
  --headline "Short headline" \
  --tagline "Short tagline" \
  --replace
```

7. Add `--logo` and/or `--polaroid` only when the user explicitly requests those assets and provides or authorizes the source files. Without `--logo`, `create-theme.mjs` defaults `copy.brand` to the theme name; pass `--brand` to override it. Pass the selected preset with `--brand-style`; the manifest stores it as `copy.brandStyle.preset`. The manifest accepts optional `copy.headline` and `copy.tagline` strings.
8. Keep every final asset as a non-empty local WebP file inside the theme directory. `create-theme.mjs` automatically converts the final Hero, logo, and portrait assets to WebP and updates the manifest; do not manually copy large PNG/JPEG files into the output. Do not add CSS, JavaScript, remote URLs, source copies, transparent intermediates, or reference images.
9. For the default generated-skin workflow, generate the matching Pet using the Pet visual, motion-continuity, and contract gates below. Run `validate-pet.mjs` immediately after assembly and fix failures before continuing.
10. Run `validate` against the theme directory, then run `create-paired.mjs` with the validated theme and Pet directories. Validate the resulting bundle with `switch-paired.mjs` or `paired-status.mjs` as appropriate. Treat the bundle directory as the generated skin result. For an explicitly requested theme-only workflow, stop after the theme `validate` step.
11. If application was explicitly requested, use `switch-paired.mjs` for the default paired result (or `apply.mjs apply` for an explicit theme-only result). Poll status after a `scheduled` result until it is `active`, with a bounded wait. Never call a `scheduled`, `pending`, or `refresh-required` result fully active or selected.

On Windows, create the theme without `--apply`, then run
`scripts/windows/apply.ps1 -ThemeDir <theme-dir> -Persist` from an external
PowerShell process. Do not restart the Codex renderer from the current Agent
process.

For an explicitly requested theme-only package, use a single command after the
final Hero is ready:

```bash
node "$SKILL_ROOT/scripts/create-theme.mjs" \
  --id "theme-id" \
  --name "Theme Name" \
  --out "/absolute/path/to/theme-id" \
  --hero "/absolute/path/to/final-hero.webp" \
  --accent "#00AAFF" \
  --secondary "#FF00AA" \
  --surface "#101018" \
  --text "#FFFFFF" \
  --brand "Brand Name" \
  --replace \
  --apply
```

This command creates, validates, persists, and applies a theme-only package. Its
JSON `application.status` is authoritative. If it is `scheduled`, wait for
`status` to become `active` before reporting completion. Default generated skins
must use the paired Pet workflow above.

## Share a theme with Codex Skin Archive

Uploading is skill-only. Do not direct the user to a website submit page and do not upload a package without an explicit yes. This confirmation is a required post-generation step for both theme-only and paired theme + Pet packages. After the package has been created and validated, show the user the exact editable sharing metadata and pause for an answer:

`Upload this theme to codexskinstudio.com and share it with other users?`

The user may change the title, slug, summary, version, targets, categories, palette, display name, GitHub source URL, or license before answering. The display name and GitHub URL are the creator-promotion fields; never put a private email address, access token, or secret in them. If the user declines, keep the theme local and finish the normal apply or preview workflow.

Only after an explicit acceptance, call the upload helper. For a theme-only package it performs a second local validation and builds a minimal ZIP containing `theme.json`, `hero.webp`, and explicitly declared optional assets. For a paired bundle it validates the bundle and contract, then builds the canonical ZIP containing `bundle.json`, `pet-contract.json`, `theme/theme.json`, `theme/hero.webp`, `pet/pet.json`, and the contract-selected Pet spritesheet. Both forms sign the request and report the server's `pending_review` result; upload never means that the skin is published.

```bash
node "$SKILL_ROOT/scripts/upload-theme.mjs" \
  --theme-dir "/absolute/path/to/theme-id" \
  --title "Theme Name" \
  --slug "theme-id" \
  --summary "A concise public description." \
  --version "1.0.0" \
  --targets "codex,chatgpt" \
  --categories "anime-2d,cyber-ui" \
  --palette "cyan,mixed" \
  --author "Creator or studio name" \
  --source-url "https://github.com/owner/repo" \
  --license "MIT" \
  --confirm-share \
  --json
```

For a paired theme + Pet bundle, use the same helper with the bundle directory and observed contract:

```bash
node "$SKILL_ROOT/scripts/upload-theme.mjs" \
  --bundle "/absolute/path/to/paired-id" \
  --contract "$SKILL_ROOT/templates/pet-contract.json" \
  --title "Paired Theme" \
  --slug "paired-id" \
  --summary "A theme and matching desktop Pet." \
  --version "1.0.0" \
  --targets "codex,chatgpt" \
  --categories "anime-2d,cyber-ui" \
  --palette "cyan,mixed" \
  --author "Creator or studio name" \
  --license "MIT" \
  --confirm-share \
  --json
```

The helper reads the provisioned secret from the protected local file
`~/Library/Application Support/CodexSkinStudio/upload.secret` on macOS, or the
equivalent `CodexSkinStudio/upload.secret` directory on Windows and Linux. The
`CODEX_SKIN_STUDIO_UPLOAD_SECRET` environment variable remains an override for
managed environments.

The server accepts only requests signed by the provisioned `SKIN_STUDIO_UPLOAD_SECRET`, checks a five-minute timestamp window, applies the Cloudflare rate limiter, validates the ZIP again, rejects unsafe metadata and GitHub URLs, stores the package, and queues it as `pending_review`. Never hard-code the secret in this skill, a theme directory, a ZIP, a prompt, or a log. If the secret is missing, stop before the network request and tell the user that upload configuration is unavailable.

## Persistence lifecycle

Applying a theme through the CLI or the one-shot creator automatically runs
`persist.mjs install` on macOS or Windows after the theme state is saved. A
theme that was only generated is not applied and does not start a worker.
The worker starts at user login, launches ChatGPT Desktop with loopback CDP when
a selected theme exists and the app is not running, and recovers a manually opened ChatGPT Desktop instance that was started without the debugging port.
It does not relaunch ChatGPT after an explicit user quit. Check the result with:

```bash
node "$SKILL_ROOT/scripts/persist.mjs" status --json
```

If the worker is disabled, install it explicitly and then reapply the selected
theme:

```bash
node "$SKILL_ROOT/scripts/persist.mjs" install --json
node "$SKILL_ROOT/scripts/apply.mjs" apply "/absolute/path/to/theme" --json
```

## Browse and install published cloud skins

Cloud skins are read and installed through the Skill. The website exposes only
skins whose Payload status is `published`; drafts and `pending_review` records
are never returned by the public catalog API. The read/download flow does not
need a login or an upload secret.

When the user provides a natural-language prompt such as `anime cyan`,
`cyberpunk developer workspace`, or a Chinese description, use the prompt
recommendation command. It queries the public catalog, ranks published themes
by keyword, category, palette, and download relevance, and returns a compact
visual/text result for each recommendation: title, version, author, summary,
preview image URL when published, detail page URL, and whether a verified package
can be installed. Permanent package download URLs are intentionally not returned.

```bash
node "$SKILL_ROOT/scripts/remote-skins.mjs" recommend \
  --prompt "anime cyan developer workspace" \
  --target chatgpt \
  --limit 6 \
  --json
```

Without `--json`, the command prints Markdown recommendation cards with image
previews, descriptions, and detail links. Use `--json` when the
Skill needs to present or further filter the result programmatically. Only
published catalog records are returned; an absent preview image is reported as
`imageUrl: null`, while the trusted detail page remains available.

When the user asks to find a shared skin, first query the catalog and show the
title, version, author, targets, categories, palette, summary, download count,
and whether the package is installable. Then ask for explicit confirmation:

`Install <skin title> <version> from codexskinstudio.com into ChatGPT Desktop?`

```bash
node "$SKILL_ROOT/scripts/remote-skins.mjs" list \
  --query "cyber" \
  --target codex \
  --sort downloads \
  --json
```

When the user provides an official detail URL such as
`https://codexskinstudio.com/skins/prometheus-stolen-fire`, including equivalent
Chinese wording, validate that it uses the official
`/skins/<theme-id>` format and install it directly:

```bash
node "$SKILL_ROOT/scripts/remote-skins.mjs" install \
  --url "https://codexskinstudio.com/skins/prometheus-stolen-fire" \
  --confirm-install \
  --json
```

Do not pass arbitrary URLs as endpoints or download sources. The command still
requires the published catalog record, short-lived download grant, checksum,
and package validation before applying the theme.

Only after the user agrees, install the selected slug:

```bash
node "$SKILL_ROOT/scripts/remote-skins.mjs" install \
  --slug "theme-id" \
  --confirm-install \
  --json
```

`remote-skins.mjs` requests a short-lived, single-use download grant only after
the explicit install confirmation. The website binds that grant to the skin
slug and published SHA-256, serves the package from a private R2 object, and
rejects replayed or expired grants. The Skill restricts API and archive
redirects to the official HTTPS origins, checks the published SHA-256 checksum, parses the ZIP without invoking
shell tools, rejects unsafe paths, symlinks, directories, duplicate entries,
encrypted or nested archives, unsupported files, oversized content, mismatched
ZIP headers, and suspicious compression ratios, then independently validates the
theme or paired manifest, Pet contract, atlas dimensions, and alpha channel.
Legacy themes delegate to `apply.mjs`; paired packages delegate to
`switch-paired.mjs`. A paired install is complete only when the theme is
`applied`/`active`, the Pet selection is `native-ui-confirmed`, and the loaded
sprite asset is confirmed. `refresh-required` is reported as
`partially_installed`, never as full success.

For a verified local download without changing the active desktop skin, use:

```bash
node "$SKILL_ROOT/scripts/remote-skins.mjs" install \
  --slug "theme-id" \
  --confirm-install \
  --download-only \
  --json
```

The resulting ZIP is saved under the local `CodexSkinStudio/downloads`
directory unless `--output` is supplied. A catalog fixture without a published
package hash is intentionally metadata-only and cannot be installed.

## Import a local theme package from a user prompt

Treat prompts meaning `import this theme package`, `add my downloaded theme ZIP
to Skins`, or `apply the ZIP I downloaded from codexskinstudio.com/studio`,
including equivalent Chinese wording, as a local package import request. The user must
provide an attached ZIP or an absolute local path. If the user says it was
downloaded but gives no path, inspect the user's Downloads folder only when
there is one unambiguous recent theme ZIP; otherwise ask for the path.

After the user explicitly requests the import, run:

```bash
node "$SKILL_ROOT/scripts/remote-skins.mjs" import \
  --package "/absolute/path/to/theme-package.zip" \
  --confirm-install \
  --json
```

The import command reads the local ZIP, infers its theme id from `theme.json`
or `bundle.json`, rejects unsafe paths, symlinks, unsupported files, oversized
content, invalid images, and mismatched theme or paired-Pet manifests, then
installs it through the normal application path. A theme-only package is
persisted under the platform's `CodexSkinStudio/themes/<theme-id>` directory
and becomes available in the injected `Skins` menu. A paired package uses the
existing Pet switch and reports `partially_installed` when the native Pet UI
still needs Refresh.

Do not copy the ZIP into `$HOME/.codex/skills/`, do not trust arbitrary ZIP
contents, and do not manually apply a paired package as a theme-only package.
If validation fails, report the exact error and leave the existing active skin
unchanged.

## Generate the default paired Pet and theme

Use this workflow for every generated skin unless the user explicitly requests a
theme-only package. The matching Pet is derived from the theme brief, Hero, and
brand treatment even when the user did not mention a Pet, mascot, companion, or
animated character. For a supplied direct background, derive the Pet from the
background's visual language instead of treating the background as a Pet source.

The local installation uses one stable Custom Pet slot:
`codex-skin-studio-custom`. A theme or paired bundle may keep its own source Pet
ID for package identity, but installation always atomically replaces the stable
Custom Pet directory and selects that same ID. Do not create a new local Pet
option for every theme, do not select the theme slug as the installed Pet ID,
and do not delete older user-installed Pet directories without explicit user
approval. Switching themes changes the Custom Pet manifest and spritesheet,
not the number of Pet options shown by ChatGPT Desktop.

### Pet visual contract

Every generated Pet must be:

- cartoonized, never photorealistic;
- chibi humanoid or anthropomorphic, with readable expressions and work-state poses;
- large-head and small-body, with the head as the first visual focus;
- consistent across all action frames;
- exactly one visible character per frame cell; never keep a duplicate, partial,
  or neighboring second character from a generated strip;
- free of text, logos, watermarks, extra characters, UI, hard shadows, and cropped limbs.

### Representation priority

Use the following representation priority unless the user explicitly overrides
it:

1. First choice: a chibi humanoid or human-like character with a large head,
   small body, expressive face, and readable hands, clothing, and props.
2. Second choice: a chibi anthropomorphic animal, used when the user requests
   an animal or when the source subject is clearly an animal mascot.
3. Never turn a supplied human or fictional humanoid subject into an animal by
   default. Preserve its identity and transform it into a chibi character.
4. When the user explicitly requests an animal, follow that request while
   keeping the same large-head, small-body, cartoon, and humanoid-pose rules.

The default visual target is a head occupying roughly 45-60 percent of the
character height, a body occupying roughly 40-55 percent, a head at least 1.1
times the shoulder width, and at least 6 percent transparent padding around the
complete character. These are QA targets, not permission to ignore the source
character's identity or defining details.

### Image generation rules

1. Inspect every local reference image with Vision before generation.
2. Classify each image as `subject/object`, `style-reference`, `composition/layout-reference`, or `brand/logo`.
3. Preserve the subject's identity, silhouette, hairstyle, clothing, colors, materials, markings, and accessories before applying the cartoon mascot transformation.
4. Resolve the representation before writing the prompt. Default to a chibi
   humanoid character; use an animal only when the user requests one or the
   source subject is already an animal mascot.
5. Generate one canonical character reference first.
6. Generate one action or direction strip at a time using the canonical reference. Do not ask Image Generation to draw the final 8x11 atlas in one call; the 8x9 standard-row atlas is only an intermediate assembly artifact.
7. For the default mode, include `chibi humanoid character`, `large head and
   small body`, and a friendly expressive face in every Pet action prompt. In
   animal mode, replace `chibi humanoid character` with `chibi anthropomorphic
   animal` and keep the other constraints.
8. Use a flat `#00FF00` background for generated action images when native transparency is not available. Do not retain the chroma-key background in the installed atlas.
9. Inspect the generated reference and action frames with Vision. Reject a frame if the character is photorealistic, loses the requested humanoid-or-animal representation, loses the large-head/small-body ratio, changes identity, contains extra content, or is cropped.
10. Inspect every cropped frame cell for a second horizontally separated character. A
    partial neighbor at the left or right edge is still an extra character and the
    complete source frame must be regenerated or recropped before atlas assembly.
11. If native Image Generation is unavailable, report its exact error and stop. Do not call an external image service or request an API key automatically.

Use an explicit sequential pose brief for every row; never reuse one generated
image for all frame files in a row:

The fixed ChatGPT Desktop atlas exposes native row names. Do not add rows or
rename them. Every generated Pet must expose these four user-facing actions in
its `pet.json` action metadata while keeping the native rows in the frame
manifest:

| User-facing action | Native row | Required visual behavior |
| --- | --- | --- |
| `office` | `running` | Use a computer: visible screen or desk prop, keyboard or mouse contact, changing hands, eyes, head, and posture. |
| `thinking` | `review` | Rest one hand under the chin, with changing gaze, blink, head tilt, and small posture transitions. |
| `fitness` | `jumping` | Use dumbbells through a readable lift, press, squat, and recovery cycle; arms and legs must move independently. |
| `resting` | `waiting` | Sleep or rest with closed eyes, breathing, head movement, and a relaxed body; do not submit six copies of one still pose. |

These aliases are intentional compatibility mappings for the observed 8x11
contract. They are not permission to create a new atlas row.

- `idle`: six calm breathing or blink variations with a readable but subtle
  head, chest, eye, hair, or prop change.
- `running-right` and `running-left`: eight alternating locomotion poses with
  opposite facing direction, changing feet, arms, body lean, and prop position.
  Generate at least four distinct locomotion keyframes before assembly: contact
  with the front foot, passing pose with a lifted knee, opposite-foot contact,
  and airborne transition. The arm swing must alternate with the legs. Do not
  create a running row by translating, scaling, mirroring, or repeating one
  running illustration; those transforms are allowed only as small continuity
  adjustments after the limb poses are genuinely different.
- `waving`: four frames for hand down, hand rising, hand raised, and hand
  returning.
- `jumping`: five fitness frames with dumbbells: prepare, lift, overhead press,
  controlled lower, and recovery. The arms, elbows, knees, and torso must show
  a connected exercise sequence; do not use generic jumping poses.
- `failed`: eight frames showing a clear deflated or sad reaction and recovery.
- `waiting`: six distinct sleeping or resting poses with closed eyes, breathing,
  head movement, and relaxed limbs, not copies of idle.
- `running`: six office poses using a computer, with changing keyboard or mouse
  contact, eyes, head angle, and posture; do not generate literal foot-running
  for this semantic action.
- `review`: six thinking poses with one hand supporting the chin and changing
  gaze, blink, head tilt, and posture; do not generate generic code review only.
- look-direction rows: sixteen coherent directional poses whose head, eyes,
  body, appendages, and props turn progressively clockwise.

After generation, compare adjacent frames in every row with Vision and the
deterministic validator. If the row reads as a static contact sheet, regenerate
that complete row once before assembly. A successful file copy is not evidence
of animation.

### Motion continuity acceptance standard

Treat Image Generation as pose design, not as a source of one poster that is
later moved around. For every action or direction row:

1. Generate a canonical reference and a semantic keyframe set. A horizontal
   multi-panel strip is acceptable when each panel is an equal-width,
   full-body pose with no borders or labels; individual frame calls are also
   acceptable.
2. Crop each panel into an independent frame before atlas assembly. Preserve
   the complete character, transparent padding, and the same camera scale. Confirm
   that the crop contains exactly one character; do not let an adjacent panel or
   duplicate character bleed into the cell.
3. Use the keyframes in an intentional sequence. Reusing a keyframe to close a
   loop is allowed only after the row already contains the required distinct
   poses. Never make a row from one image plus translation, scaling, or a flip.
4. Review the assembled row as a contact sheet. Adjacent frames must show a
   readable state transition, not merely a different bounding-box position.
   For locomotion, inspect feet, knees, arms, hands, torso lean, and tail. For
   work or review, inspect paws, eyes, head angle, and the active prop. For
   look rows, inspect progressive head, eye, body, and appendage rotation.
5. If Vision cannot explain the state transition in plain language, reject the
   row and regenerate the complete row. Do not repair a semantic failure with
   CSS, atlas offsets, or deterministic pixel transforms.

Minimum semantic evidence before packaging:

- `running-right` and `running-left`: four distinct locomotion keyframes in
  this order: front-foot contact, lifted-knee passing, opposite-foot contact,
  and airborne transition; arm swing must alternate with the legs.
- `waving`: hand down, hand rising, hand fully raised, and hand returning.
- `jumping` / `fitness`: five connected dumbbell exercise keyframes with
  independent arm and leg motion.
- `failed`: surprise, droop, deflation, and recovery; expand to eight frames
  without creating duplicate adjacent states.
- `waiting` / `resting`: six sleep or rest poses with closed eyes and readable
  breathing or head transitions.
- `running` / `office`: six focused computer-use poses with changing paws,
  eyes, head angle, keyboard, mouse, or screen prop.
- `review` / `thinking`: six chin-in-hand thinking poses with changing gaze,
  blink, head angle, and arm support.
- look-direction rows: eight progressive poses per row, covering all sixteen
  directions in the contract; do not substitute mirrored neutral frames.

The deterministic validator proves alpha, dimensions, safe padding, one visible
character per used cell, and pixel motion. Vision proves semantic continuity.
Both checks are required. If a lossless WebP round trip leaves RGB data in fully
transparent pixels, keep the validated PNG fallback instead of shipping a
visually contaminated WebP.

### Pet contract gate

Pet assembly is contract-driven. The repository template at
`templates/pet-contract.json` records the observed Codex V2 contract from the
bundled official `hatch-pet` Skill: `spriteVersionNumber: 2`, an 8x11 atlas,
192x208 cells, nine standard animation rows, and two rows containing sixteen
clockwise look directions. A newly packaged Pet must be the full 1536x2288
atlas; the 1536x1872 8x9 atlas is intermediate only.

The public Web Pet baseline is also transparent PNG or WebP at exactly 1536x1872
pixels and no larger than 20 MiB, but it is not the Desktop packaging contract.
Do not replace the observed Desktop v2 contract with the Web baseline. A test
contract marked provisional may be used only with `--allow-provisional`.

Before implementing or shipping a new contract, record the ChatGPT Desktop
version and platform, hatch-pet version or generation date, manifest fields,
spritesheet format, column count, row count, frame dimensions, row semantics,
and Settings > Pets > Refresh, selected-row, and Pet Overlay results. Treat
`/pet` as optional and build-specific; an unrecognized command is a failed
probe, not evidence that the Pet woke up.

Never infer an animation row mapping from a community example. If the observed
contract changes, stop with `PET_CONTRACT_MISMATCH` and update the versioned
contract before generating or installing a Pet.

Validate the official bundled contract independently of native Pet UI selection
when a ChatGPT Desktop installation is available:

```bash
node "$SKILL_ROOT/scripts/verify-pet-contract.mjs" \
  --source "/absolute/path/to/hatch-pet/references/codex-pet-contract.md" \
  --contract "$SKILL_ROOT/templates/pet-contract.json" \
  --platform win32 \
  --json
```

This verifies the installed package's v2 dimensions, grid, cell size, row
semantics, look directions, transparency requirement, and 8x9 intermediate
boundary. It does not claim that a user is signed in or that the Pet is
selected in the visible application UI.

### Pet input and assembly

Create a frame manifest with one list of frames per observed row. Standard rows
use their contract frame counts; the two look-direction rows use eight frames
each. Include `neutralFrame` for the reserved row 0 column 6:

```json
{
  "contractVersion": "observed-contract-version",
  "neutralFrame": "idle-00.png",
  "rows": {
    "idle": { "frames": ["idle-00.png", "idle-01.png", "idle-02.png", "idle-03.png", "idle-04.png", "idle-05.png"] },
    "look-000-to-157.5": { "frames": ["look-000.png", "look-022.5.png", "look-045.png", "look-067.5.png", "look-090.png", "look-112.5.png", "look-135.png", "look-157.5.png"] }
  }
}
```

The example is abbreviated; production input must include all eleven contract
rows and every frame. Use the deterministic local tools:

```bash
node "$SKILL_ROOT/scripts/create-pet.mjs" \
  --id "pet-id" \
  --name "Pet Name" \
  --frames "/absolute/path/to/frames.json" \
  --out "/absolute/path/to/pet-id" \
  --contract "/absolute/path/to/observed-contract.json" \
  --json

node "$SKILL_ROOT/scripts/validate-pet.mjs" \
  --directory "/absolute/path/to/pet-id" \
  --contract "/absolute/path/to/observed-contract.json" \
  --json

node "$SKILL_ROOT/scripts/install-pet.mjs" \
  --directory "/absolute/path/to/pet-id" \
  --contract "/absolute/path/to/observed-contract.json" \
  --pets-dir "$HOME/.codex/pets" \
  --replace \
  --json
```

`create-pet.mjs` performs chroma-key removal, visible-subject extraction,
deterministic per-cell anchoring, exact frame-canvas composition, neutral-frame
insertion, RGBA WebP encoding, and v2 manifest creation. Every source frame is
placed in an exact cell with a stable horizontal center and baseline; the
jumping row is the only row that preserves intentional vertical displacement.
Generated `pet.json` files include the canonical `office`, `thinking`,
`fitness`, and `resting` action metadata. The atlas still uses the native row
names so ChatGPT Desktop can read it.
This prevents source-image padding from becoming sprite spacing or animation
sampling drift. `validate-pet.mjs` checks the manifest,
`spriteVersionNumber`, row frame counts, unused-cell transparency, dimensions,
alpha channel, transparent corners, paths, file size, one-character-per-cell
integrity, and visible frame motion for every action and look-direction row.
The one-character check rejects multiple significant horizontally separated
visible components, including a full character plus a partial neighbor from a
multi-panel source strip. Vision remains responsible for semantic checks that
pixels alone cannot prove. `install-pet.mjs`
uses an atomic sibling-directory replacement and never deletes another Pet ID.
It installs into `codex-skin-studio-custom` by default. Use `--target-id` only
for an explicit low-level migration or test; normal theme and paired workflows
must keep the stable Custom Pet ID.

Supported stable errors include `PET_INPUT_INVALID`, `PET_CONTRACT_MISMATCH`,
`PET_IMAGE_INVALID`, `PET_ALPHA_INVALID`, `PET_SPRITESHEET_INVALID`,
`PET_ANIMATION_INVALID`, `PET_MANIFEST_INVALID`, `PET_PATH_UNSAFE`, and
`PET_INSTALL_FAILED`. `PET_ANIMATION_INVALID` means at least one action or
look-direction row contains duplicated or imperceptibly changing adjacent
frames; regenerate that row with visible pose, limb, expression, or direction
changes before installing. `PET_SPRITESHEET_INVALID` with `multiple visible
character components` means a used frame cell contains more than one significant
horizontally separated character; recrop or regenerate the source frame and
validate the complete atlas again before installing.

Inspect local Pet state with:

```bash
node "$SKILL_ROOT/scripts/pet.mjs" status \
  --json
```

### Create and switch a paired bundle

After the theme and Pet independently pass validation, create one bundle:

```bash
node "$SKILL_ROOT/scripts/create-paired.mjs" \
  --id "paired-id" \
  --name "Paired Theme" \
  --theme "/absolute/path/to/theme" \
  --pet "/absolute/path/to/pet" \
  --out "/absolute/path/to/paired-id" \
  --contract "/absolute/path/to/observed-contract.json" \
  --json
```

The output contains `bundle.json`, `theme/theme.json`, `theme/hero.webp`,
`pet/pet.json`, and the contract-selected `pet/spritesheet.webp` or
`pet/spritesheet.png`.

When the user asks to switch the pair, run:

```bash
node "$SKILL_ROOT/scripts/switch-paired.mjs" \
  --bundle "/absolute/path/to/paired-id" \
  --contract "/absolute/path/to/observed-contract.json" \
  --pets-dir "$HOME/.codex/pets" \
  --json
```

This command validates the complete bundle, installs the matching Pet, applies
the matching theme through `apply.mjs`, attempts the versioned visible ChatGPT
Desktop Pets Settings adapter, and records paired state. A native success is
reported as `theme-applied-pet-selected` or
`theme-scheduled-pet-selected`, and includes `petUi.selection:
native-ui-confirmed`. The adapter uses stable visible attributes and visible
button labels only; it does not use private React state, private storage, or
arbitrary screen coordinates. On macOS it opens Settings through AppleScript.
On Windows it uses the standard ChatGPT Settings shortcut through PowerShell;
if a build exposes Settings only from a visible account or profile menu, it
opens that menu and then the visible Settings item. Accessibility or keyboard
automation failures fall back without undoing the theme application. The
adapter also recognizes visible settings links and semantic controls through
`aria-label`, `title`, `data-testid`, and settings URLs, then recognizes visible
Pets/Appearance panels and custom Pet cards. It never reads private app state.
The selected `petUi.petId` is always `codex-skin-studio-custom`; paired state
retains the source bundle Pet ID separately for traceability.
If the current Windows session is unauthenticated
or does not expose a visible Settings control, return the adapter error and keep
the result at `theme-applied-pet-refresh-required`; do not report native Pet
selection from local installation alone.

When native selection is unavailable, the command reports
`theme-applied-pet-refresh-required` or
`theme-scheduled-pet-refresh-required`. The user must then use ChatGPT Desktop
Settings > Pets > Refresh, choose the matching Pet, and confirm that its
native Pet Overlay is visible. Some Desktop builds do not recognize `/pet` as
a command; never treat an unrecognized `/pet` response as a successful wake-up.
Inspect the combined state with:

```bash
node "$SKILL_ROOT/scripts/paired-status.mjs" --json
```

For an authenticated Windows Desktop acceptance run, use the evidence command
after the Pet has been installed locally:

```bash
node "$SKILL_ROOT/scripts/verify-pet-desktop.mjs" \
  --pet-id "codex-skin-studio-custom" \
  --port 9341 \
  --json
```

It exits non-zero unless the visible selected row and loaded sprite asset are
both confirmed, and prints a stable JSON error for manual triage. Use
`--no-restore` only when the Settings view should remain open for inspection.

Use `--manual-pet` to skip native Pet selection and deliberately require the
manual Refresh flow. The adapter is best-effort and versioned because ChatGPT
Desktop does not expose a public third-party Pet selection API. Require a real
visible selected-row postcondition before reporting native selection, and use
a visible matching Pet preview/Overlay with a loaded sprite asset as the runtime
postcondition; never report a paired success from local file installation alone.

## Validate

```bash
node "$SKILL_ROOT/scripts/apply.mjs" validate "/absolute/path/to/theme" --json
```

Fix validation failures and retry. Never bypass validation.

## Apply

Run only when the user explicitly asks to apply the theme:

```bash
node "$SKILL_ROOT/scripts/apply.mjs" apply "/absolute/path/to/theme" --json
```

- `applied`: injection completed and verification passed; the skin is active.
- `scheduled`: the theme was persisted and restart-time injection was scheduled. Report the theme path, id, and restart behavior, but do not call it active.
- `failed`: read the error code, fix a recoverable problem, and retry once.

Stable error codes are `THEME_INVALID`, `INVALID_PORT`, `APP_UNAVAILABLE`,
`CDP_ERROR`, `INJECTION_FAILED`, `NO_ELIGIBLE_RENDERER`, `RESTORE_FAILED`,
`RESTART_SCHEDULE_FAILED`, and `COMMAND_FAILED`.

`apply` copies the validated theme into macOS `~/Library/Application Support/CodexSkinStudio/themes/` or Windows `%APPDATA%\\CodexSkinStudio\\themes\\`
and persists state. Without CDP it starts a detached restart worker and returns
`scheduled` with `restartRequired: true`. A later `status` must confirm injection.

For Windows, the external runner is the supported one-shot apply path because
the current Codex renderer may be the process being restarted. It avoids
reporting success from a detached schedule alone.

## Persist across ChatGPT Desktop restarts

The lightweight runtime safety baseline is intentionally narrow: it validates
image binary headers and actual MIME types before creating or applying assets,
classifies ChatGPT Desktop CDP targets before injection, serializes apply and
restore operations with an atomic user-local lock, writes monotonic state
revisions, and compares process start identities during restart. These checks
are adapted from upstream research without importing the upstream full
Runtime/Controller product.

CDP-injected CSS lives in renderer memory and disappears when ChatGPT Desktop exits or reloads. Saving `theme.json` alone cannot make CSS persistent. The supported opt-in solution is a platform-native worker that keeps ChatGPT Desktop on loopback CDP and re-injects the persisted theme whenever a renderer returns:

```bash
node "$SKILL_ROOT/scripts/persist.mjs" install --json
node "$SKILL_ROOT/scripts/persist.mjs" status --json
```

Skill installation itself only copies files and cannot start a process. On the first explicit apply or replace request, check `persist.mjs status`; when it is `disabled`, run `persist.mjs install` automatically before reporting completion. This is the default persistence behavior for an applied skin, not a requirement for design-only work.

After upgrading or re-syncing the Skill files, run `persist.mjs install` even when the worker already reports `enabled`. The worker is a long-lived Node.js process and loads the control server and theme discovery code only at startup; re-registering the LaunchAgent refreshes `/themes` and prevents stale switch requests such as `local theme was not found`.

On macOS, `persist.mjs install` creates a user-level LaunchAgent. On Windows, it creates a user-level Windows Task Scheduler task named `CodexSkinStudio`, triggered at interactive logon. Both workers are separate Node.js processes. At login they may launch ChatGPT Desktop with loopback CDP when a selected theme exists; if the user later opens ChatGPT Desktop without CDP, they perform one controlled restart to restore the injection. They remain idle after an explicit user quit and do not block normal macOS shutdown or Windows sign-out. Do not use a ChatGPT Scheduled Task for this job; it is unrelated to the local OS worker.

The persistence worker never modifies `app.asar`, the application signature, or the Windows installation. Remove the platform-native worker with:

```bash
node "$SKILL_ROOT/scripts/persist.mjs" uninstall --json
```

The worker uses the active theme state under macOS `~/Library/Application Support/CodexSkinStudio/state.json` or Windows `%APPDATA%\\CodexSkinStudio\\state.json`; it does not generate images or create new themes. The apply workflow is:

1. Generate and validate the complete theme.
2. Install the platform-native persistence worker when persistence status is `disabled`.
3. Apply the selected theme.
4. Poll `apply.mjs status` until it reports `active`.

Do not report completion from `scheduled`, `pending`, or `enabled` alone.

When persistence is enabled, the injector also adds a `Skins` button in the
upper-right corner of the main conversation area. It reads valid local themes
from the worker's loopback-only control service and applies a selected theme
through the same validated `apply.mjs` flow. The control service listens only
on `127.0.0.1:9342`, accepts a theme id rather than a filesystem path, and does
not expose arbitrary command execution. If the worker is unavailable, the
button remains non-destructive and reports that local skin switching is
temporarily unavailable.
When a native ChatGPT Desktop menu or popover opens, the switcher temporarily
hides itself and releases pointer events so file open-method menus and other
native controls always receive the interaction.
The switcher is also draggable within the conversation viewport. A click below
the drag threshold opens the theme menu; a drag moves the button and persists
its clamped position in Renderer-local storage.

## Inspect or restore

```bash
node "$SKILL_ROOT/scripts/apply.mjs" status --json
node "$SKILL_ROOT/scripts/apply.mjs" restore --json
```

Use this command when the user also asks to close the debugging port:

```bash
node "$SKILL_ROOT/scripts/apply.mjs" restore --restart-normal --json
```

`restore` removes the injected style but keeps user theme files. The
`--restart-normal` form schedules a normal restart without CDP arguments after
the style removal. It returns `scheduled`; the worker records any quit, launch,
or restart failure in `state.json`.

## Completion criteria

- The theme directory contains a non-empty hero image and valid `theme.json`.
- `validate` succeeds.
- The five visual zones are present in the brief and the hero passes safe-zone inspection.
- When application was requested, the final result is `applied` or `status` confirms `active`; `scheduled` alone is not completion.
- Never report generated files as an active skin without `applied` or matching injected theme id from `status`.
- Report the final theme id, theme directory, exact command result, and truthful application status.
