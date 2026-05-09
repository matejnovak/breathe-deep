/* tests/lib/assert.js
   Browser-native assertion runner. No framework, no build step.
   Each test page does:
     const t = TestAssert.create({ out: el, summary: el });
     t.installErrorTrap();
     await t.block('block name', () => { t.eq(...); ... });
     t.finish();
*/
(function () {
  'use strict';

  function create(opts) {
    opts = opts || {};
    const out = opts.out || null;
    const summary = opts.summary || null;
    let passed = 0, failed = 0;
    const failures = [];

    function row(ok, name, detail) {
      if (ok) passed++;
      else { failed++; failures.push({ name: name, detail: detail }); }
      if (out) {
        const div = document.createElement('div');
        div.className = 'row ' + (ok ? 'pass' : 'fail');
        div.textContent = (ok ? '✓ ' : '✗ ') + name + (ok ? '' : ' . ' + (detail == null ? '' : detail));
        out.append(div);
      }
    }

    function assert(name, cond, detail) {
      row(!!cond, name, detail);
    }
    function eq(name, actual, expected) {
      assert(name, Object.is(actual, expected),
        'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
    }
    function deepEq(name, actual, expected) {
      const a = JSON.stringify(actual), b = JSON.stringify(expected);
      assert(name, a === b, 'expected ' + b + ', got ' + a);
    }
    function near(name, actual, expected, tolerance) {
      assert(name, Math.abs(actual - expected) <= tolerance,
        'expected ~' + expected + ' (±' + tolerance + '), got ' + actual);
    }
    function throws(name, fn, msg) {
      let threw = false;
      try { fn(); } catch (_e) { threw = true; }
      assert(name, threw, msg == null ? 'expected to throw' : msg);
    }

    async function block(name, fn) {
      try {
        await fn();
      } catch (e) {
        const msg = (e && e.stack) ? e.stack : String(e);
        row(false, '[block] ' + name, msg);
      }
    }

    function finish() {
      const ok = failed === 0;
      const text = passed + ' passed, ' + failed + ' failed';
      if (summary) {
        summary.textContent = text;
        summary.dataset.state = ok ? 'pass' : 'fail';
      }
      document.title = (ok ? '✓ ' : '✗ ') + document.title;
      window.__results__ = { passed: passed, failed: failed, failures: failures };
      try {
        window.parent.postMessage({
          type: 'breathe-test',
          file: location.pathname,
          passed: passed,
          failed: failed,
          failures: failures,
        }, '*');
      } catch (_e) { /* not in iframe */ }
    }

    function installErrorTrap(label) {
      window.addEventListener('error', function (e) {
        row(false, '[uncaught] ' + (label || location.pathname),
          e.message + (e.error && e.error.stack ? '\n' + e.error.stack : ''));
      });
      window.addEventListener('unhandledrejection', function (e) {
        const r = e.reason;
        row(false, '[unhandled rejection] ' + (label || location.pathname),
          (r && r.stack) ? r.stack : String(r));
      });
    }

    return {
      assert: assert, eq: eq, deepEq: deepEq, near: near, throws: throws,
      block: block, finish: finish, installErrorTrap: installErrorTrap,
      get passed() { return passed; },
      get failed() { return failed; },
    };
  }

  window.TestAssert = { create: create };
})();
