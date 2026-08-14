# WorkBuddy Skin Feasibility Research

Date: 2026-08-14

## Conclusion

WorkBuddy can be reskinned on macOS and Windows through a reversible local CDP
injection workflow. WorkBuddy does not appear to expose an official custom-theme
API. The practical path is runtime CSS and DOM injection into the live desktop
renderer, without modifying the official installation, `app.asar`, or code
signing.

This repository's current `codex-skin-studio` implementation targets ChatGPT
Desktop/Codex and is not directly compatible with WorkBuddy. A WorkBuddy adapter
would need its own executable discovery, renderer target, CSS variable map, DOM
anchors, and relaunch/persistence logic.

## Findings

### Official WorkBuddy information

- The official site describes WorkBuddy as an AI Agent for everyday office work
  and attributes it to Tencent Cloud CodeBuddy: [WorkBuddy official site](https://www.workbuddy.ai/).
- Official installation documentation supports macOS 12+ and Windows 10+ desktop
  clients: [macOS installation guide](https://www.workbuddy.ai/docs/zh/workbuddy/From-Beginner-to-Expert-Guide/Installation-Mac-Guide),
  [Windows installation guide](https://www.workbuddy.ai/docs/zh/workbuddy/From-Beginner-to-Expert-Guide/Installation-Win-Guide).
- Official system settings document language, font size, and display mode. It
  describes simplified mode but does not document arbitrary wallpaper, color
  palette, or custom skin loading: [system settings](https://www.workbuddy.ai/docs/zh/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Setting).
- The official public documentation therefore establishes a desktop renderer
  and limited built-in display preferences, but not an official custom-skin
  extension point.

### WorkBuddy-specific implementation evidence

The open-source [cdredfox/workbuddy-skin-studio](https://github.com/cdredfox/workbuddy-skin-studio)
is a directly relevant implementation. Its README and source specify:

- macOS and Windows support, with WorkBuddy relaunched using
  `--remote-debugging-port=9223`.
- Renderer discovery through `http://127.0.0.1:9223/json/list`, filtering for
  `renderer/index.html`.
- CDP `Runtime.evaluate` injection of a `<style>` element and an in-app theme
  menu.
- WorkBuddy-specific `body[data-application-name=workbuddy]` and
  `[data-view-id]` selectors, plus the `--cb-*` design-variable family.
- Theme packages containing a local `hero` image and color values such as
  `accent`, `secondary`, `surface`, and `text`.
- Reversible removal of the injected style/menu and restoration of the native
  appearance.

Relevant source files:

- [SKILL.md](https://github.com/cdredfox/workbuddy-skin-studio/blob/main/SKILL.md)
- [src/cdp-client.mjs](https://github.com/cdredfox/workbuddy-skin-studio/blob/main/src/cdp-client.mjs)
- [src/skin-css.mjs](https://github.com/cdredfox/workbuddy-skin-studio/blob/main/src/skin-css.mjs)
- [src/injector.mjs](https://github.com/cdredfox/workbuddy-skin-studio/blob/main/src/injector.mjs)
- [scripts/apply.command](https://github.com/cdredfox/workbuddy-skin-studio/blob/main/scripts/apply.command)
- [scripts/apply.ps1](https://github.com/cdredfox/workbuddy-skin-studio/blob/main/scripts/apply.ps1)

## Feasibility assessment

| Capability | Assessment | Evidence or limitation |
| --- | --- | --- |
| Background image and color palette | Feasible | WorkBuddy-specific CSS variables and transparent container anchors are implemented in `skin-css.mjs`. |
| Instant theme switching | Feasible | The third-party implementation injects a theme menu into the live renderer. |
| Native app files unchanged | Feasible | CDP injection only; the project explicitly avoids `app.asar` and install-directory changes. |
| macOS and Windows | Feasible | Separate launchers and official installation docs exist for both platforms. |
| Persistent skin after full restart | Conditional | CDP styles live with the renderer; a launcher or background watcher must relaunch and reinject after restart. |
| Stable compatibility across updates | Conditional | WorkBuddy-specific selectors and `--cb-*` variables may change; every update needs smoke testing. |
| Official support | Not established | Official docs reviewed here do not expose a custom-theme API. |
| Current repository support | Not available directly | Current tooling is explicitly built for ChatGPT Desktop/Codex and uses different bundle IDs, renderer hints, and selectors. |

## Security and operational limits

- CDP is bound to loopback, but an exposed debugging endpoint has no normal
  application-level authentication. Only run trusted local tooling while the
  debug port is active.
- Applying the skin requires restarting WorkBuddy into debug mode; save active
  work first.
- Renderer injection is ephemeral. A manual restart or renderer reload removes
  the injected CSS and menu unless a reinjection worker is running.
- Do not modify `WorkBuddy.app`, `app.asar`, Windows installation files, code
  signatures, or official JavaScript. Those changes increase update and
  integrity risk and are unnecessary for the CDP approach.
- Use only images and character assets that the user is authorized to use.

## Recommendation for this repository

Add WorkBuddy as a separate adapter rather than broadening the existing Codex
adapter with app-name conditionals. Reuse the theme manifest and image
validation concepts, but keep WorkBuddy-specific runtime code isolated:

1. Detect `/Applications/WorkBuddy.app` or a Windows `WorkBuddy.exe`.
2. Launch it with a configurable loopback CDP port and verify the renderer URL.
3. Inject WorkBuddy's CSS variable overrides and stable DOM anchors.
4. Add explicit `status`, `pause`, and `restore` verification.
5. Add bounded reinjection after renderer reloads.
6. Test against both light and dark display modes and at least one current
   WorkBuddy release.

## Source quality

The official WorkBuddy site and docs are primary sources for product identity,
platforms, and documented settings. The skin feasibility and selector details
come from the third-party implementation's public source code, which is direct
implementation evidence but not Tencent endorsement or an official API.
