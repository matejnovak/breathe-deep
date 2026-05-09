/* Breathe Deep, single-file IIFE.
   Loads after vendor/web-haptics.js (which exposes window.WebHaptics).
   No build step, no modules, no framework. Works from file:// directly. */

(() => {
  'use strict';

  const WebHaptics = window.WebHaptics;
  if (!WebHaptics) {
    console.error('[breathe-deep] vendor/web-haptics.js failed to load');
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Domain
  // ─────────────────────────────────────────────────────────────────────────
  const TECHNIQUES = [
    { id: 'classic',  name: 'Classic',  summary: 'Gentle 4 · 2 · 6 rhythm. Begin here.', phases: [
      { kind: 'inhale', seconds: 4, label: 'Inhale' },
      { kind: 'hold',   seconds: 2, label: 'Hold' },
      { kind: 'exhale', seconds: 6, label: 'Exhale' },
    ]},
    { id: 'box',      name: 'Box',      summary: 'Equal 4 · 4 · 4 · 4. Steady focus.', phases: [
      { kind: 'inhale', seconds: 4, label: 'Inhale' },
      { kind: 'hold',   seconds: 4, label: 'Hold' },
      { kind: 'exhale', seconds: 4, label: 'Exhale' },
      { kind: 'hold',   seconds: 4, label: 'Hold' },
    ]},
    { id: '478',      name: '4 · 7 · 8', summary: 'Long exhale. Eases the body toward sleep.', phases: [
      { kind: 'inhale', seconds: 4, label: 'Inhale' },
      { kind: 'hold',   seconds: 7, label: 'Hold' },
      { kind: 'exhale', seconds: 8, label: 'Exhale' },
    ]},
    { id: 'coherent', name: 'Coherent', summary: 'Even 5.5 · 5.5. Tunes heart-rate variability.', phases: [
      { kind: 'inhale', seconds: 5.5, label: 'Inhale' },
      { kind: 'exhale', seconds: 5.5, label: 'Exhale' },
    ]},
    { id: 'extended', name: 'Extended', summary: 'Inhale 4, exhale 8. Strong calming shift.', phases: [
      { kind: 'inhale', seconds: 4, label: 'Inhale' },
      { kind: 'exhale', seconds: 8, label: 'Exhale' },
    ]},
  ];

  const DURATIONS = [
    { min: 1, label: '1' },
    { min: 3, label: '3' },
    { min: 5, label: '5' },
    { min: 10, label: '10' },
    { min: 0, label: '∞' },
  ];

  const DEFAULTS = {
    techniqueId: 'classic',
    durationMin: 0,
    audio: false,
    haptics: true,
    theme: 'auto',
    reminderHour: null,
    totalSessions: 0,
    totalMinutes: 0,
    streak: 0,
    lastSessionDate: null,
  };

  const STORAGE_KEY = 'breathe-deep:v2';
  const REMINDER_KEY = 'breathe-deep:v2:reminder-fired';
  const REMINDER_HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

  // Defensive: localStorage is user-controlled. Validate each key against an
  // expected type and (for counters) a non-negative range. Stops a tampered
  // payload like { theme: { x: 1 } } from rendering as "[object Object]" or
  // negative streaks/totals from leaking into the UI.
  const NON_NEGATIVE = new Set(['durationMin', 'totalSessions', 'totalMinutes', 'streak']);
  function sanitizeSettings(s) {
    const out = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS)) {
      const v = s[k];
      const def = DEFAULTS[k];
      const isFiniteNum = typeof v === 'number' && Number.isFinite(v);
      if (def === null) {
        // reminderHour: 0..23 ; lastSessionDate: ISO-ish YYYY-MM-DD
        if (v === null) { out[k] = null; }
        else if (k === 'reminderHour' && isFiniteNum && v >= 0 && v < 24) out[k] = v;
        else if (k === 'lastSessionDate' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) out[k] = v;
      } else if (typeof v === typeof def && (typeof v !== 'number' || isFiniteNum)) {
        if (NON_NEGATIVE.has(k) && v < 0) continue;
        out[k] = v;
      }
    }
    return out;
  }
  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULTS };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return { ...DEFAULTS };
      return sanitizeSettings(parsed);
    } catch { return { ...DEFAULTS }; }
  }
  function writeSettings(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }
  function localDateKey(d = new Date()) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  function isYesterdayLocal(prev, today) {
    if (!prev) return false;
    const [y, m, d] = today.split('-').map(Number);
    const t = new Date(y, m - 1, d);
    t.setDate(t.getDate() - 1);
    return localDateKey(t) === prev;
  }
  function recordSession(elapsedMs) {
    const state = loadSettings();
    const minutes = elapsedMs / 60000;
    const today = localDateKey();
    let streak = state.streak;
    if (state.lastSessionDate === today) {
      // already counted streak today
    } else if (isYesterdayLocal(state.lastSessionDate, today)) {
      streak += 1;
    } else {
      streak = 1;
    }
    const next = {
      ...state,
      totalSessions: state.totalSessions + 1,
      totalMinutes: state.totalMinutes + minutes,
      streak,
      lastSessionDate: today,
    };
    writeSettings(next);
    return next;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Store
  //  Single observable wrapper around settings. All mutations go through
  //  Store.set() so subscribers re-render in one pass. External writes
  //  (other tabs) come in via Store.refresh().
  // ─────────────────────────────────────────────────────────────────────────
  const Store = (() => {
    let state = loadSettings();
    const listeners = new Set();

    function emit() {
      for (const fn of listeners) {
        try { fn(state); } catch (err) { console.warn('[store] listener threw', err); }
      }
    }

    return {
      get: () => state,
      set(patch) {
        // In-memory merge + single write. Avoids the read-then-write cycle
        // of the previous patchSettings() helper so successive writes don't
        // each round-trip localStorage.
        state = sanitizeSettings({ ...state, ...patch });
        writeSettings(state);
        emit();
      },
      // External update path: re-load from storage (e.g. another tab wrote,
      // or recordSession() bypassed Store directly during a session end).
      refresh() {
        state = loadSettings();
        emit();
      },
      subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    };
  })();

  // ─────────────────────────────────────────────────────────────────────────
  //  Breath engine
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Phase engine for a breathing technique.
   *
   * Lifecycle: idle → running ⇄ paused → idle.
   *   start()  . begin from phase 0 (resets all counters)
   *   pause()  . cancel the pending phase timer, keep counters
   *   resume() . re-arm the timer for the remaining phase time
   *   stop()   . cancel everything; safe to call repeatedly
   *
   * Wakes only at phase boundaries (one setTimeout per phase). Visuals are
   * driven by WAAPI from onPhase, so per-frame ticking is unnecessary.
   * sessionElapsedMs computes the live value for the running phase.
   *
   * @param {{id:string, name:string, phases:Array<{kind:'inhale'|'hold'|'exhale', seconds:number, label:string}>}} technique
   * @param {object} callbacks
   * @param {(p:{kind:string, label:string, durationMs:number, index:number}) => void} [callbacks.onPhase]
   * @param {(c:{elapsedMs:number, breathCount:number}) => void} [callbacks.onComplete]
   * @param {number} [callbacks.durationMs=Infinity]
   */
  class BreathEngine {
    constructor(technique, { onPhase, onComplete, durationMs = Infinity } = {}) {
      this.technique = technique;
      this.onPhase = onPhase ?? (() => {});
      this.onComplete = onComplete ?? (() => {});
      this.durationMs = durationMs;
      this._state = 'idle';
      this._timerId = null;
      this._phaseStart = 0;
      this._scheduledWait = 0;
      this._sessionElapsed = 0;
      this._phaseElapsed = 0;
      this._phaseIndex = 0;
      this._breathCount = 0;
    }
    get state() { return this._state; }
    start() {
      if (this._state === 'running') return;
      this._state = 'running';
      this._sessionElapsed = 0;
      this._phaseElapsed = 0;
      this._phaseIndex = 0;
      this._breathCount = 0;
      this._emitPhase();
      this._scheduleNext();
    }
    pause() {
      if (this._state !== 'running') return;
      this._state = 'paused';
      if (this._timerId !== null) { clearTimeout(this._timerId); this._timerId = null; }
      const elapsed = performance.now() - this._phaseStart;
      this._phaseElapsed += elapsed;
      this._sessionElapsed += elapsed;
      this._phaseStart = 0;
    }
    resume() {
      if (this._state !== 'paused') return;
      this._state = 'running';
      this._scheduleNext();
    }
    stop() {
      this._state = 'idle';
      if (this._timerId !== null) { clearTimeout(this._timerId); this._timerId = null; }
      this._phaseStart = 0;
    }
    get sessionElapsedMs() {
      if (this._state === 'running' && this._phaseStart > 0) {
        return this._sessionElapsed + (performance.now() - this._phaseStart);
      }
      return this._sessionElapsed;
    }
    get breathCount() { return this._breathCount; }
    _emitPhase() {
      const p = this.technique.phases[this._phaseIndex];
      this.onPhase({ kind: p.kind, label: p.label, durationMs: p.seconds * 1000, index: this._phaseIndex });
    }
    _scheduleNext() {
      if (this._state !== 'running') return;
      const phase = this.technique.phases[this._phaseIndex];
      const phaseMs = phase.seconds * 1000;
      const phaseRemaining = phaseMs - this._phaseElapsed;
      const sessionRemaining = this.durationMs - this._sessionElapsed;
      const wait = Math.max(0, Math.min(phaseRemaining, sessionRemaining));
      this._scheduledWait = wait;
      this._phaseStart = performance.now();
      this._timerId = setTimeout(() => this._handleTimer(), wait);
    }
    _handleTimer() {
      this._timerId = null;
      if (this._state !== 'running') return;
      // Treat the scheduled wait as authoritative. A throttled background tab
      // can fire setTimeout very late; advancing by wall-clock would silently
      // skip through breaths the user never paced.
      this._phaseElapsed += this._scheduledWait;
      this._sessionElapsed += this._scheduledWait;
      this._phaseStart = 0;
      if (this._sessionElapsed >= this.durationMs) {
        this.stop();
        this.onComplete({ elapsedMs: this._sessionElapsed, breathCount: this._breathCount });
        return;
      }
      const phase = this.technique.phases[this._phaseIndex];
      const phaseMs = phase.seconds * 1000;
      if (this._phaseElapsed + 0.5 >= phaseMs) {
        this._phaseElapsed = 0;
        const wasInhale = phase.kind === 'inhale';
        this._phaseIndex = (this._phaseIndex + 1) % this.technique.phases.length;
        if (!wasInhale && this._phaseIndex === 0) this._breathCount += 1;
        this._emitPhase();
      }
      this._scheduleNext();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Audio (Web Audio chime per phase)
  // ─────────────────────────────────────────────────────────────────────────
  let audioCtx = null;
  let audioMaster = null;
  function ensureAudio() {
    if (audioCtx) return audioCtx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    audioMaster = audioCtx.createGain();
    audioMaster.gain.value = 0.05;
    audioMaster.connect(audioCtx.destination);
    return audioCtx;
  }
  function unlockAudio() {
    const c = ensureAudio();
    if (c && c.state === 'suspended') c.resume();
  }
  function closeAudio() {
    if (audioCtx) {
      try { audioCtx.close(); } catch {}
      audioCtx = null;
      audioMaster = null;
    }
  }
  const CHIME_FREQ = { inhale: 528, hold: 432, exhale: 396 };
  function chime(kind) {
    const c = ensureAudio();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    const freq = CHIME_FREQ[kind] ?? 432;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const now = c.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    osc.connect(gain).connect(audioMaster);
    osc.start(now);
    osc.stop(now + 1);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Daily reminder (local Notification API)
  //
  //  Reminder is a single setTimeout to the next configured hour, then
  //  re-arms. Avoids per-minute polling and stays cheap when backgrounded.
  //  sync(hour) is a no-op when nothing changed, so a flurry of storage /
  //  visibility events doesn't churn the timer.
  // ─────────────────────────────────────────────────────────────────────────
  const NOTIF_OK = typeof Notification !== 'undefined';
  function notifSupported() { return NOTIF_OK; }
  async function requestNotifPermission() {
    if (!NOTIF_OK) return 'unsupported';
    if (Notification.permission !== 'default') return Notification.permission;
    return Notification.requestPermission();
  }

  const Reminder = (() => {
    let timer = null;
    let armedHour = null;

    function clear() {
      if (timer !== null) { clearTimeout(timer); timer = null; }
      armedHour = null;
    }
    function nextFireDelay(hour, now = new Date()) {
      const target = new Date(now);
      target.setHours(hour, 0, 0, 0);
      if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
      return target.getTime() - now.getTime();
    }
    function fire(hour) {
      const today = localDateKey();
      if (localStorage.getItem(REMINDER_KEY) !== today) {
        try {
          new Notification('Breathe Deep', {
            body: 'A minute of breath. That is all.',
            tag: 'breathe-deep-daily',
          });
          localStorage.setItem(REMINDER_KEY, today);
        } catch {}
      }
      schedule(hour);
    }
    function schedule(hour) {
      clear();
      if (hour == null || !NOTIF_OK || Notification.permission !== 'granted') return;
      armedHour = hour;
      timer = setTimeout(() => fire(hour), nextFireDelay(hour));
    }

    return {
      schedule,
      clear,
      get armedHour() { return armedHour; },
      sync(hour) {
        if (hour === armedHour) return;
        schedule(hour);
      },
      // Test hook so unit tests can drive the timer deterministically.
      _fireNow(hour) { fire(hour); },
      _nextFireDelay: nextFireDelay,
    };
  })();
  const scheduleDailyReminder = Reminder.schedule;

  // ─────────────────────────────────────────────────────────────────────────
  //  UI infrastructure
  // ─────────────────────────────────────────────────────────────────────────
  const REDUCED_MOTION_QUERY = matchMedia('(prefers-reduced-motion: reduce)');
  function isReducedMotion() { return REDUCED_MOTION_QUERY.matches; }

  // WebHaptics.trigger() is a no-op when navigator.vibrate is unavailable.
  const haptics = new WebHaptics({ debug: false });
  const HAPTIC_PRESET = { inhale: 'soft', hold: 'selection', exhale: 'medium' };
  const SESSION_RECORD_THRESHOLD_MS = 30_000;

  const $ = (sel) => document.querySelector(sel);
  const els = {};

  function cacheEls() {
    els.orb = $('#orb');
    els.orbCircle = $('#orb-circle');
    els.phaseLabel = $('#phase-label');
    els.startHint = $('#start-hint');
    els.sessionTimer = $('#session-timer');
    els.streakBadge = $('#streak-badge');
    els.streakValue = $('#streak-value');
    els.openSettings = $('#open-settings');
    els.sheet = $('#settings-sheet');
    els.sheetClose = $('#sheet-close');
    els.techniqueChips = $('#technique-chips');
    els.techniqueDescription = $('#technique-description');
    els.durationChips = $('#duration-chips');
    els.toggleAudio = $('#toggle-audio');
    els.toggleHaptics = $('#toggle-haptics');
    els.themeSelect = $('#theme-select');
    els.reminderSelect = $('#reminder-select');
    els.totalMinutes = $('#total-minutes');
    els.totalSessions = $('#total-sessions');
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Session controller
  //  Owns engine + orb animation + elapsed timer + UI side effects of
  //  start/pause/resume/end. The only place that mutates orb.dataset.state
  //  and the start hint. UI render functions never touch session state.
  // ─────────────────────────────────────────────────────────────────────────
  const Session = (() => {
    let engine = null;
    let orbAnim = null;
    let elapsedTimer = null;

    function setUi(state) {
      els.orb.dataset.state = state;
      els.orb.setAttribute('aria-pressed', String(state === 'running'));
      if (state === 'running') {
        els.startHint.classList.add('start-hint--hidden');
      } else if (state === 'paused') {
        els.startHint.textContent = 'tap to resume';
        els.startHint.classList.remove('start-hint--hidden');
      } else {
        els.startHint.textContent = 'tap to begin';
        els.startHint.classList.remove('start-hint--hidden');
        els.orb.dataset.phase = '';
        els.phaseLabel.textContent = '';
        els.sessionTimer.textContent = '';
      }
    }

    function startElapsedTimer() {
      stopElapsedTimer();
      const update = () => {
        if (!engine) return;
        const sec = Math.floor(engine.sessionElapsedMs / 1000);
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        els.sessionTimer.textContent = `${m}:${String(s).padStart(2, '0')}`;
      };
      update();
      elapsedTimer = setInterval(update, 1000);
    }
    function stopElapsedTimer() {
      if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
    }
    function cancelOrbAnim() {
      if (orbAnim) { try { orbAnim.cancel(); } catch {} orbAnim = null; }
    }

    return {
      get engine() { return engine; },
      get state() { return engine ? engine.state : 'idle'; },
      get orbAnim() { return orbAnim; },
      setOrbAnim(anim) { orbAnim = anim; },
      cancelOrbAnim,

      start() {
        const settings = Store.get();
        if (settings.audio) unlockAudio();
        cancelOrbAnim();
        const tech = TECHNIQUES.find(t => t.id === settings.techniqueId) ?? TECHNIQUES[0];
        const durationMs = settings.durationMin === 0 ? Infinity : settings.durationMin * 60_000;
        engine = new BreathEngine(tech, { onPhase, onComplete, durationMs });
        engine.start();
        setUi('running');
        startElapsedTimer();
      },
      pause() {
        if (!engine || engine.state !== 'running') return;
        engine.pause();
        if (orbAnim) { try { orbAnim.pause(); } catch {} }
        stopElapsedTimer();
        setUi('paused');
      },
      resume() {
        if (!engine || engine.state !== 'paused') return;
        engine.resume();
        if (orbAnim && orbAnim.playState === 'paused') {
          try { orbAnim.play(); } catch {}
        }
        startElapsedTimer();
        setUi('running');
      },
      end({ record = true } = {}) {
        if (engine) {
          if (record && engine.sessionElapsedMs >= SESSION_RECORD_THRESHOLD_MS) {
            recordSession(engine.sessionElapsedMs);
            Store.refresh();
          }
          engine.stop();
          engine = null;
        }
        cancelOrbAnim();
        if (!isReducedMotion()) {
          try {
            orbAnim = els.orbCircle.animate(
              [{ transform: `scale(${currentOrbScale})` }, { transform: 'scale(0.4)' }],
              { duration: 700, easing: 'ease-out', fill: 'forwards' },
            );
            currentOrbScale = 0.4;
          } catch {}
        }
        stopElapsedTimer();
        setUi('idle');
      },
      toggle() {
        const s = this.state;
        if (s === 'idle') this.start();
        else if (s === 'running') this.pause();
        else this.resume();
      },
    };
  })();

  // ─────────────────────────────────────────────────────────────────────────
  //  UI: phase callbacks (consumed by BreathEngine via Session)
  //
  //  currentOrbScale tracks the orb's logical scale so we can hand WAAPI a
  //  precise starting transform without forcing a sync style read.
  // ─────────────────────────────────────────────────────────────────────────
  let currentOrbScale = 0.4;

  function onPhase({ kind, label, durationMs }) {
    els.phaseLabel.textContent = label;
    els.phaseLabel.dataset.kind = kind;
    els.orb.dataset.phase = kind;
    const settings = Store.get();
    if (settings.haptics) haptics.trigger(HAPTIC_PRESET[kind] ?? 'light');
    if (settings.audio) chime(kind);
    if (isReducedMotion()) return;
    const target = kind === 'inhale' ? 1 : kind === 'exhale' ? 0.4 : null;
    if (target == null) return;
    Session.cancelOrbAnim();
    const from = currentOrbScale;
    const anim = els.orbCircle.animate(
      [{ transform: `scale(${from})` }, { transform: `scale(${target})` }],
      { duration: durationMs, easing: 'cubic-bezier(0.42, 0, 0.58, 1)', fill: 'forwards' },
    );
    currentOrbScale = target;
    Session.setOrbAnim(anim);
  }
  function onComplete() {
    if (Store.get().haptics) haptics.trigger('success');
    Session.end({ record: true });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  UI: settings sheet
  //
  //  Backed by the native <dialog> element. showModal() handles inert page,
  //  focus trap, and Escape-to-close for free. We wrap close() in a tiny
  //  delay so the slide-down transition has a chance to play.
  // ─────────────────────────────────────────────────────────────────────────
  const SHEET_CLOSE_MS = 320;
  let sheetCloseTimer = null;

  function mountSettingsSheet() {
    els.openSettings.addEventListener('click', openSheet);
    els.sheetClose.addEventListener('click', closeSheet);
    // Click on the dialog backdrop (anywhere outside the panel) closes.
    els.sheet.addEventListener('click', (e) => {
      if (e.target === els.sheet) closeSheet();
    });
    // Native dialog dispatches 'cancel' on Escape; intercept so our close
    // animation runs instead of an instant dismiss.
    els.sheet.addEventListener('cancel', (e) => { e.preventDefault(); closeSheet(); });
  }
  function openSheet() {
    if (sheetCloseTimer !== null) { clearTimeout(sheetCloseTimer); sheetCloseTimer = null; }
    if (els.sheet.open) return;
    try { els.sheet.showModal(); } catch { els.sheet.setAttribute('open', ''); }
    // Two-step so CSS transitions can animate from the closed state.
    requestAnimationFrame(() => els.sheet.classList.add('sheet--open'));
    if (Store.get().haptics) haptics.trigger('selection');
  }
  function closeSheet() {
    if (!els.sheet.open && !els.sheet.classList.contains('sheet--open')) return;
    els.sheet.classList.remove('sheet--open');
    if (sheetCloseTimer !== null) clearTimeout(sheetCloseTimer);
    sheetCloseTimer = setTimeout(() => {
      try { els.sheet.close(); } catch { els.sheet.removeAttribute('open'); }
      sheetCloseTimer = null;
    }, SHEET_CLOSE_MS);
    // showModal() restores focus to the dialog's invoker on close, but we
    // close async via setTimeout so the focus restore can race the keyboard
    // shortcut. Re-target explicitly.
    try { els.openSettings.focus(); } catch {}
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  UI: mount (one-time wiring), builds DOM and attaches listeners.
  // ─────────────────────────────────────────────────────────────────────────
  function mountTechniqueChips() {
    els.techniqueChips.replaceChildren();
    for (const tech of TECHNIQUES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip';
      btn.dataset.id = tech.id;
      const span = document.createElement('span');
      span.textContent = tech.name;
      btn.append(span);
      btn.addEventListener('click', () => selectTechnique(tech.id));
      els.techniqueChips.append(btn);
    }
  }
  function mountDurationChips() {
    els.durationChips.replaceChildren();
    for (const d of DURATIONS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip chip--sm';
      btn.dataset.min = String(d.min);
      btn.textContent = d.label;
      btn.setAttribute('aria-label', d.min === 0 ? 'Unlimited' : `${d.label} minutes`);
      btn.addEventListener('click', () => selectDuration(d.min));
      els.durationChips.append(btn);
    }
  }
  function mountReminderOptions() {
    // Build the hour list dynamically. Adding/removing slots is one-line and
    // we cannot accidentally skip an hour like the previous static <option>s.
    els.reminderSelect.replaceChildren();
    const off = document.createElement('option');
    off.value = '';
    off.textContent = 'Off';
    els.reminderSelect.append(off);
    for (const h of REMINDER_HOURS) {
      const opt = document.createElement('option');
      opt.value = String(h);
      opt.textContent = String(h).padStart(2, '0') + ':00';
      els.reminderSelect.append(opt);
    }
  }
  function mountSettingsControls() {
    els.toggleAudio.addEventListener('change', onAudioToggleChange);
    els.toggleHaptics.addEventListener('change', onHapticsToggleChange);
    els.themeSelect.addEventListener('change', onThemeChange);
    if (NOTIF_OK) {
      els.reminderSelect.addEventListener('change', onReminderChange);
    } else {
      els.reminderSelect.disabled = true;
    }
  }
  function mountOrb() {
    els.orb.addEventListener('click', () => Session.toggle());
  }
  function mountKeyboard() {
    window.addEventListener('keydown', (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const sheetOpen = els.sheet.open || els.sheet.classList.contains('sheet--open');
      const onInteractive = tag === 'BUTTON' || tag === 'A';
      if (e.key === ' ' || e.key === 'Spacebar') {
        // Don't intercept Space when a button/link has focus or sheet is open;
        // otherwise we'd both start the engine AND swallow chip selection.
        if (onInteractive || sheetOpen) return;
        e.preventDefault();
        Session.toggle();
      } else if (e.key.toLowerCase() === 'm') {
        els.toggleAudio.checked = !els.toggleAudio.checked;
        els.toggleAudio.dispatchEvent(new Event('change'));
      } else if (e.key.toLowerCase() === 't') {
        cycleTechnique();
      } else if (e.key.toLowerCase() === 's') {
        sheetOpen ? closeSheet() : openSheet();
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  UI: render (idempotent state→DOM, no listener attachment).
  // ─────────────────────────────────────────────────────────────────────────
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
  }
  function renderTechniques(s) {
    for (const c of els.techniqueChips.children) {
      c.setAttribute('aria-pressed', String(c.dataset.id === s.techniqueId));
    }
    const t = TECHNIQUES.find(x => x.id === s.techniqueId) ?? TECHNIQUES[0];
    els.techniqueDescription.textContent = t.summary;
  }
  function renderDurations(s) {
    for (const c of els.durationChips.children) {
      c.setAttribute('aria-pressed', String(Number(c.dataset.min) === s.durationMin));
    }
  }
  function renderSettings(s) {
    els.toggleAudio.checked = s.audio;
    els.toggleHaptics.checked = s.haptics;
    els.themeSelect.value = s.theme;
    if (NOTIF_OK) {
      els.reminderSelect.value = s.reminderHour == null ? '' : String(s.reminderHour);
    }
  }
  function renderStats(s) {
    els.streakValue.textContent = String(s.streak);
    els.totalMinutes.textContent = String(Math.round(s.totalMinutes));
    els.totalSessions.textContent = String(s.totalSessions);
    els.streakBadge.classList.toggle('streak--lit', s.streak > 0);
  }
  function applyAll(s) {
    applyTheme(s.theme);
    renderTechniques(s);
    renderDurations(s);
    renderSettings(s);
    renderStats(s);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  UI: action handlers (push into Store, then trigger any side-effect
  //  that isn't a pure DOM render, e.g. engine reset, audio unlock.)
  // ─────────────────────────────────────────────────────────────────────────
  function selectTechnique(id) {
    Store.set({ techniqueId: id });
    if (Store.get().haptics) haptics.trigger('selection');
    if (Session.engine) Session.end();
  }
  function selectDuration(min) {
    Store.set({ durationMin: min });
    if (Store.get().haptics) haptics.trigger('selection');
    // BreathEngine captures durationMs at construction. End any running
    // session so the new duration applies on the next start.
    if (Session.engine) Session.end();
  }
  function cycleTechnique() {
    const cur = Store.get().techniqueId;
    const idx = TECHNIQUES.findIndex(t => t.id === cur);
    selectTechnique(TECHNIQUES[(idx + 1) % TECHNIQUES.length].id);
  }
  function onAudioToggleChange() {
    const audio = els.toggleAudio.checked;
    Store.set({ audio });
    if (audio) unlockAudio();
    else closeAudio();
  }
  function onHapticsToggleChange() {
    const enabled = els.toggleHaptics.checked;
    Store.set({ haptics: enabled });
    if (enabled) haptics.trigger('light');
  }
  function onThemeChange() {
    Store.set({ theme: els.themeSelect.value });
  }
  async function onReminderChange() {
    const value = els.reminderSelect.value;
    if (value === '') {
      Store.set({ reminderHour: null });
      Reminder.schedule(null);
      return;
    }
    const permission = await requestNotifPermission();
    if (permission !== 'granted') {
      // Permission denied or dismissed: persist Off so UI and storage agree.
      Store.set({ reminderHour: null });
      Reminder.schedule(null);
      return;
    }
    const hour = Number(value);
    Store.set({ reminderHour: hour });
    Reminder.schedule(hour);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Init + lifecycle
  // ─────────────────────────────────────────────────────────────────────────
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol === 'file:') return;
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  function init() {
    cacheEls();

    // Build DOM and attach listeners (once).
    mountSettingsSheet();
    mountTechniqueChips();
    mountDurationChips();
    mountReminderOptions();
    mountSettingsControls();
    mountOrb();
    mountKeyboard();

    // Subscribe renders to store, then push initial render.
    Store.subscribe(applyAll);
    // Reminder follows the Store: any path that changes reminderHour
    // (own UI, another tab, refresh()) re-arms via Reminder.sync().
    Store.subscribe((s) => Reminder.sync(s.reminderHour));
    applyAll(Store.get());

    // External lifecycle.
    registerSW();
    Reminder.schedule(Store.get().reminderHour);

    // Multi-tab safety: another tab wrote settings → re-pull and re-render.
    window.addEventListener('storage', (e) => {
      if (e.key !== STORAGE_KEY) return;
      Store.refresh();
    });
    // Best-effort session record on tab close.
    window.addEventListener('pagehide', () => {
      const eng = Session.engine;
      if (eng && eng.sessionElapsedMs >= SESSION_RECORD_THRESHOLD_MS) {
        try { recordSession(eng.sessionElapsedMs); } catch {}
      }
    });
    // bfcache restore: storage may have been written by another tab while
    // we were frozen. Pull fresh state so the badge stays in sync.
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) Store.refresh();
    });
    // Long-throttled timers can drift in background; nudge on visibility.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) Reminder.sync(Store.get().reminderHour);
    });
  }

  // Test-only export: opt-in via `?test`, AND only on local dev hosts
  // (localhost / 127.0.0.1 / file://). Production deploys never expose the
  // internals even if a crafted link includes ?test.
  const isLocalDev = typeof location !== 'undefined' && (
    location.protocol === 'file:' ||
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.hostname === '[::1]' ||
    location.hostname === ''
  );
  if (isLocalDev && /[?&]test(=|&|$)/.test(location.search)) {
    window.__breatheTest__ = {
      BreathEngine,
      Store,
      Session,
      Reminder,
      TECHNIQUES,
      DURATIONS,
      REMINDER_HOURS,
      DEFAULTS,
      STORAGE_KEY,
      REMINDER_KEY,
      SESSION_RECORD_THRESHOLD_MS,
      localDateKey,
      isYesterdayLocal,
      recordSession,
      loadSettings,
      writeSettings,
      sanitizeSettings,
      notifSupported,
      scheduleDailyReminder,
      init,
    };
  }

  // Tests drive the engine themselves; skip auto-init when ?test is set.
  if (typeof window !== 'undefined' && window.__breatheTest__) {
    // no-op
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
