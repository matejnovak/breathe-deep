# Breathe Deep

A small space to breathe. Pick a rhythm, follow the orb, exhale.

[**Open the app →**](https://www.matejnovak.si/breathe-deep/)

## Features

- One tap to start. `Space` pauses, `T` cycles techniques, `M` mutes, `S` opens settings.
- Five rhythms out of the box: Classic 4·2·6, Box, 4·7·8, Coherent, Extended Exhale.
- Optional gentle chimes (Web Audio) and haptic feedback (`web-haptics`).
- Light, dark, and auto themes. Honors `prefers-reduced-motion`.
- Local streak counter and total minutes.
- Installable PWA, fully offline after the first load. Optional daily reminder.

## Quick start

```sh
git clone https://github.com/matejnovak/breathe-deep.git
cd breathe-deep
python3 -m http.server 8000
open http://localhost:8000
```

Static files only, no build step. You can also just double-click
`index.html`. The app degrades gracefully on `file://` (the service worker
and install banner are skipped, everything else still works).

## Stack

Vanilla HTML, CSS, and JavaScript.

- Single-file `app.js` (classic IIFE) so the same source runs from `file://`
  and from any static server.
- Modern CSS: OKLCH color, `light-dark()`, `color-mix`, native `<dialog>`.
- Web Animations API for the orb, Web Audio API for chimes,
  [`web-haptics`](https://haptics.lochie.me) for richer vibration patterns.
- Service Worker plus Web App Manifest for offline use and installability.
- Display font: Fraunces variable serif, with a system serif fallback when
  offline.

No bundler, no framework, no transpiler, no lockfile.

## Accessibility

- Real `<button>` and `<dialog>` elements. The settings sheet inherits the
  browser's focus trap and `Esc` handling.
- Phase changes are announced via `aria-live`.
- Animations respect `prefers-reduced-motion`.
- Keyboard shortcuts cover every primary action.
- Color tokens use OKLCH so dark and light themes keep consistent contrast.

## Privacy

No accounts. No analytics. No third-party trackers. The only remote request
is to Google Fonts, and the app falls back to a system serif when that
request fails.

Settings, streaks, and totals live in your browser's `localStorage` and
never leave your device.

See [Privacy](privacy-policy.html).

## Tests

Tests live as plain `*.test.html` files. The aggregator at `tests/index.html`
opens every page in an iframe and reports a combined pass/fail.

```sh
python3 -m http.server 8000
open http://localhost:8000/tests/
```

Single suites also work standalone (open any `tests/unit/*.test.html` from
`file://`). Helpers live in `tests/lib/`.

## Browser support

Latest Chrome, Safari, Firefox, and Edge. Older browsers may miss the
service worker, haptics, or some CSS color features and gracefully fall
back.

## License

MIT
