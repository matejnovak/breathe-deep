# Architecture

Internal notes for working on Breathe Deep, a small static PWA for breath-pacing. Live at https://www.matejnovak.si/breathe-deep/. For a user-facing overview, see [README.md](README.md).

## Stack

- Vanilla HTML, CSS, JS. No build step, no bundler, no framework.
- Single-file `app.js` (classic script, IIFE) so the app works from `file://` (double-clicking `index.html` just opens it).
- `web-haptics` 0.0.6 by Lochie Axon lives in `vendor/web-haptics.js` (verbatim port of the upstream `dist/chunk-*.mjs`, ESM stripped, attaches to `window.WebHaptics`). Loaded as a classic `<script>` before `app.js`. Upgrade by replacing the file body following the procedure in its header comment.
- PWA: `manifest.webmanifest` + `sw.js` (cache-first for same-origin, network-with-cache-fallback for Google Fonts).
- Display font: Fraunces (Google Fonts CDN, with system serif fallback when offline).

## Files

| File | Purpose |
|------|---------|
| `index.html` | Markup. Topbar (streak + settings glyph), orb stage, slide-up settings sheet. |
| `style.css` | "Twilight Ritual" tokens (OKLCH `light-dark()`), watercolor orb, drifting aura, sheet styles. |
| `app.js` | App code. Store + Session controller + mount/render UI split + engine + storage + audio + reminders. |
| `vendor/web-haptics.js` | Third-party. **Do not edit.** Replace verbatim from upstream tarball when upgrading; bump `CACHE` in `sw.js`. |
| `sw.js` | Service worker. Bump `CACHE` constant when shipping new asset versions. |
| `manifest.webmanifest` | PWA install metadata. |
| `privacy-policy.html` | Static page linked from settings footer. |
| `img/` | Apple touch icons. |
| `tests/index.html` | Aggregator that loads every `*.test.html` in iframes and prints combined pass/fail. |
| `tests/lib/` | Shared test helpers (`assert.js`, `fake-clock.js`, `fixtures.js`). Classic scripts, attach to `window.TestAssert` / `window.TestClock` / `window.TestFixtures`. |
| `tests/unit/*.test.html` | Per-module browser-run unit suites (dates, storage, store, engine, reminder). Open one file or use the aggregator. |
| `tests/integration/session.test.html` | Mounts the full app on a fake DOM via `__breatheTest__.init()` and drives `Session.start/pause/resume/end`. |
| `tests/e2e/smoke.sh` | `dev-browser` smoke against a running server; click + keyboard shortcuts, asserts orb/SW/no console errors. |

## Conventions

- Never use em-dashes in user-facing copy. Use "." or "," instead (per global rule).
- `localStorage` keys are namespaced under `breathe-deep:v2`. Bump the suffix on breaking schema changes.
- Phase haptic presets live in the `HAPTIC_PRESET` map in `app.js`. Stick to web-haptics' named presets.
- Do not introduce ES modules. The single-file IIFE is intentional . it preserves `file://` double-click usability. Vendor code goes in `vendor/`, app code stays in `app.js`.
- All settings flow through the `Store` IIFE in `app.js` (`Store.set(patch)` writes localStorage and notifies subscribers). UI is split into one-time `mount*` (build DOM, attach listeners) and idempotent `render*` (state → DOM) functions called by `Store.subscribe(applyAll)`.
- Session lifecycle (engine, orb WAAPI animation, elapsed timer, orb dataset/aria) lives in the `Session` controller IIFE. Never poke the orb element or engine directly from UI handlers.
- Do not re-add jQuery, AdSense, cookie bars, or any third-party tracker. The app is intentionally local-only.

## Dev

```sh
# Serve locally so the service worker registers
python3 -m http.server 8000
open http://localhost:8000

# Or just double-click index.html . app works from file:// (SW + manifest gracefully degrade)
```

After SW changes, hard-reload (Cmd+Shift+R) or unregister via DevTools > Application.

## Deploy

The repo is host-agnostic. It is a folder of static files; copy them onto any web server and you are done. The maintainer's specific procedure (host, credentials, paths, sudo handling) is kept outside the repo and is not needed to develop or test the app.

A few things any deploy should respect, regardless of host:

- Ship the working tree minus `.git`, `.gitignore`, `.DS_Store`, `README.md`, `ARCHITECTURE.md`, `node_modules`, `tests`.
- Bump `CACHE` in `sw.js` whenever you ship new assets so old clients re-fetch.
- Purge any CDN cache in front of the origin for `/breathe-deep/*` after a `CACHE` bump or an `app.js` change.

Script-load ordering note: some CDNs (Cloudflare's Rocket Loader and similar) rewrite `<script>` tags. Both `vendor/web-haptics.js` and `app.js` are loaded with `defer`, which preserves document order even through such rewrites. `app.js` checks for `window.WebHaptics` at the top of its IIFE and bails with a console error if the vendor script failed to load, so an order break is loud rather than silent.

Do not commit secrets, hostnames, IPs, server usernames, or filesystem paths to this repo. Operational notes belong in private notes outside the working tree.

## Verify

```sh
# HTTP status + last-modified
curl -sI https://www.matejnovak.si/breathe-deep/

# End-to-end (renders orb, click + keyboard shortcuts, SW, no console errors)
tests/e2e/smoke.sh https://www.matejnovak.si/breathe-deep/

# Or against local server (defaults to http://localhost:8000/):
python3 -m http.server 8000 &
tests/e2e/smoke.sh
```

## Out of scope

- Backend, accounts, cloud sync. Everything stays in `localStorage`.
- True push notifications (would need VAPID + a backend). Daily reminder uses Notification API + `setInterval` while the tab is open.
- Build tooling. If you find yourself reaching for one, reconsider.
- ESLint, Prettier, or any other JS tooling stack. If a piece of code looks off, edit it directly. Adding a config file is not the answer.
- Test framework (Jest, Vitest, Playwright runner). Tests live as plain `*.test.html` files that load `app.js` with `?test` in the URL and use the lightweight `tests/lib/assert.js` helper. Keep it that way.

## Tests

Tests are split into `tests/unit/`, `tests/integration/`, and `tests/e2e/`. The aggregator at `tests/index.html` opens every page in an iframe and reports a combined pass/fail.

```sh
# Aggregator (preferred). Serve from repo root so iframes resolve relative paths.
python3 -m http.server 8000
open http://localhost:8000/tests/

# Or open a single file directly . it works from file:// too.
open tests/unit/engine.test.html
```

Helpers in `tests/lib/`:
- `assert.js` . `TestAssert.create({out, summary})` returns `{assert, eq, deepEq, near, throws, block, finish, installErrorTrap}`. `block()` traps thrown errors so one failing block doesn't kill the suite. `finish()` postMessages results to the aggregator.
- `fake-clock.js` . `TestClock.install/uninstall/tick/jump/flush` to drive `BreathEngine` deterministically without `setTimeout`.
- `fixtures.js` . `TWO_PHASE`, `BOX` techniques, `mountAppDom() / unmountAppDom()` for integration tests, and `withTempStorage(fn)` to namespace `localStorage` writes per test.

`app.js` exposes `window.__breatheTest__` only on local-dev hosts AND only when the URL contains `?test`. Production deploys never expose internals even if a crafted link includes `?test`. The export now also includes `init`, `scheduleDailyReminder`, `notifSupported`, and `REMINDER_KEY` for the integration test.

The end-to-end smoke (`tests/e2e/smoke.sh`) requires `dev-browser` on PATH and a running local server. Default URL is `http://localhost:8000/`.
