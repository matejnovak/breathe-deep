/* tests/lib/fixtures.js
   Shared fixtures + DOM scaffolding helpers for tests.
*/
(function () {
  'use strict';

  // Two-phase technique with very short phases. Useful for engine tests that
  // want fast cycles under the fake clock.
  const TWO_PHASE = {
    id: 'two', name: 'Two', phases: [
      { kind: 'inhale', seconds: 0.1, label: 'In' },
      { kind: 'exhale', seconds: 0.1, label: 'Out' },
    ],
  };

  // Box-style four-phase technique with 1 s phases. Used to verify phase
  // ordering and breathCount semantics.
  const BOX = {
    id: 'box-test', name: 'Box', phases: [
      { kind: 'inhale', seconds: 1, label: 'Inhale' },
      { kind: 'hold',   seconds: 1, label: 'Hold' },
      { kind: 'exhale', seconds: 1, label: 'Exhale' },
      { kind: 'hold',   seconds: 1, label: 'Hold' },
    ],
  };

  // Build the minimum DOM the app needs to mount via __breatheTest__.init().
  // Mirrors index.html structure but only the IDs cacheEls() looks up.
  function mountAppDom() {
    const root = document.createElement('div');
    root.id = 'test-app-root';
    root.innerHTML = [
      '<div id="streak-badge"><span id="streak-value">0</span></div>',
      '<button id="open-settings"></button>',
      '<button id="orb" data-state="idle" aria-pressed="false">',
      '  <svg><circle id="orb-circle"/></svg>',
      '  <span><span id="phase-label"></span></span>',
      '</button>',
      '<p id="session-timer"></p>',
      '<p id="start-hint">tap to begin</p>',
      '<dialog id="settings-sheet">',
      '  <div class="sheet__panel">',
      '    <button id="sheet-close"></button>',
      '    <div id="technique-chips"></div>',
      '    <p id="technique-description"></p>',
      '    <div id="duration-chips"></div>',
      '    <input id="toggle-audio" type="checkbox">',
      '    <input id="toggle-haptics" type="checkbox">',
      '    <select id="theme-select">',
      '      <option value="auto">Auto</option>',
      '      <option value="dark">Dark</option>',
      '      <option value="light">Light</option>',
      '    </select>',
      '    <select id="reminder-select"></select>',
      '    <span id="total-minutes">0</span>',
      '    <span id="total-sessions">0</span>',
      '  </div>',
      '</dialog>',
    ].join('\n');
    document.body.append(root);
    return root;
  }

  function unmountAppDom(root) {
    if (root && root.parentNode) root.parentNode.removeChild(root);
  }

  // Run `fn` with localStorage transparently namespaced under a unique prefix
  // so tests do not collide with each other or with real settings. The
  // namespace is removed after `fn` returns or throws.
  function withTempStorage(fn) {
    const ns = '__test-' + Math.random().toString(36).slice(2) + ':';
    const orig = {
      getItem: Storage.prototype.getItem,
      setItem: Storage.prototype.setItem,
      removeItem: Storage.prototype.removeItem,
    };
    const touched = new Set();
    Storage.prototype.getItem = function (k) { return orig.getItem.call(this, ns + k); };
    Storage.prototype.setItem = function (k, v) { touched.add(ns + k); return orig.setItem.call(this, ns + k, v); };
    Storage.prototype.removeItem = function (k) { return orig.removeItem.call(this, ns + k); };
    try {
      return fn();
    } finally {
      Storage.prototype.getItem = orig.getItem;
      Storage.prototype.setItem = orig.setItem;
      Storage.prototype.removeItem = orig.removeItem;
      for (const k of touched) orig.removeItem.call(localStorage, k);
    }
  }

  window.TestFixtures = {
    TWO_PHASE: TWO_PHASE,
    BOX: BOX,
    mountAppDom: mountAppDom,
    unmountAppDom: unmountAppDom,
    withTempStorage: withTempStorage,
  };
})();
