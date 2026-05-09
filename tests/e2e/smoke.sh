#!/usr/bin/env bash
# tests/e2e/smoke.sh
# End-to-end smoke against a running local server.
# Usage:
#   python3 -m http.server 8000 &  # in repo root
#   tests/e2e/smoke.sh              # default URL is http://localhost:8000/
#   tests/e2e/smoke.sh https://www.matejnovak.si/breathe-deep/
#
# Requires `dev-browser` (Playwright wrapper) on PATH. Exits 0 on success.

set -euo pipefail

URL="${1:-http://localhost:8000/}"

dev-browser <<EOF
const page = await browser.getPage("breathe-deep-smoke");
const errors = [];
const consoleErrors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push('console.error: ' + msg.text());
});

await page.goto('${URL}', { waitUntil: 'networkidle' });

// Give the SW a moment to register.
await page.waitForTimeout(1500);

const result = await page.evaluate(() => ({
  orb:        document.querySelectorAll('#orb').length,
  orbCircle:  document.querySelectorAll('#orb-circle').length,
  techniques: document.querySelectorAll('#technique-chips button').length,
  durations:  document.querySelectorAll('#duration-chips button').length,
  streak:     document.querySelector('#streak-value')?.textContent,
  ariaPressedIdle: document.querySelector('#orb')?.getAttribute('aria-pressed'),
  dataStateIdle:   document.querySelector('#orb')?.dataset.state,
  swController:    navigator.serviceWorker?.controller?.scriptURL || null,
  hasManifest:     !!document.querySelector('link[rel="manifest"]'),
}));

// Click orb → should switch to running.
await page.click('#orb');
await page.waitForTimeout(300);
const afterClick = await page.evaluate(() => ({
  state: document.querySelector('#orb')?.dataset.state,
  pressed: document.querySelector('#orb')?.getAttribute('aria-pressed'),
}));

// Click orb again → paused.
await page.click('#orb');
await page.waitForTimeout(300);
const afterPause = await page.evaluate(() => document.querySelector('#orb')?.dataset.state);

// Open settings sheet via keyboard 's' (matches in-app shortcut).
await page.keyboard.press('s');
await page.waitForTimeout(200);
const sheetOpen = await page.evaluate(() => document.getElementById('settings-sheet').open);

// Close with Escape.
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
const sheetClosedClass = await page.evaluate(() =>
  document.getElementById('settings-sheet').classList.contains('sheet--open'));

const report = {
  initial: result,
  afterClick,
  afterPause,
  sheetOpen,
  sheetClosedClass,
  errors,
  consoleErrors,
};
console.log(JSON.stringify(report, null, 2));

const failures = [];
if (result.orb !== 1)              failures.push('expected exactly one #orb, got ' + result.orb);
if (result.techniques < 3)         failures.push('expected ≥3 technique chips, got ' + result.techniques);
if (result.durations  < 3)         failures.push('expected ≥3 duration chips, got '  + result.durations);
if (result.dataStateIdle !== 'idle') failures.push('initial data-state should be idle, got ' + result.dataStateIdle);
if (result.ariaPressedIdle !== 'false') failures.push('initial aria-pressed should be false, got ' + result.ariaPressedIdle);
if (afterClick.state !== 'running') failures.push('after click data-state should be running, got ' + afterClick.state);
if (afterClick.pressed !== 'true')  failures.push('after click aria-pressed should be true, got '  + afterClick.pressed);
if (afterPause !== 'paused')        failures.push('after second click data-state should be paused, got ' + afterPause);
if (!sheetOpen)                     failures.push('s key did not open settings sheet');
if (sheetClosedClass)               failures.push('Escape did not close settings sheet');
if (errors.length)                  failures.push('pageerror(s): ' + errors.join(' | '));

if (failures.length) {
  console.error('FAIL');
  for (const f of failures) console.error(' . ' + f);
  process.exit(1);
} else {
  console.log('OK');
}
EOF
