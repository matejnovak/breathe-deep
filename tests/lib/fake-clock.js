/* tests/lib/fake-clock.js
   Manual-advance replacement for performance.now / setTimeout / clearTimeout /
   setInterval / clearInterval. Lets engine tests be deterministic without
   sleeping the real event loop.

   The real BreathEngine uses setTimeout to wake at phase boundaries. We mock
   the timer functions and advance virtual time on demand.

   Usage:
     TestClock.install();          // baseline now = 1000 ms
     try {
       eng.start();                // schedules setTimeout(handler, 1000)
       TestClock.tick(2000);       // fires due timers as virtual time passes
       TestClock.jump(5000);       // bumps clock without firing timers
       TestClock.flush();          // fires all timers whose fireAt <= now
     } finally {
       TestClock.uninstall();
     }
*/
(function () {
  'use strict';

  let installed = false;
  let now = 0;
  let nextId = 0;
  let timers = [];
  let real = null;

  // Engine relies on `phaseStart > 0` as a sentinel meaning "phase is in
  // flight". Starting the fake clock above zero avoids the false negative
  // where performance.now() == 0 looks like the sentinel.
  function install(baseNow) {
    if (installed) return;
    real = {
      perfNow: performance.now.bind(performance),
      setTimeout: window.setTimeout.bind(window),
      clearTimeout: window.clearTimeout.bind(window),
      setInterval: window.setInterval.bind(window),
      clearInterval: window.clearInterval.bind(window),
    };
    now = baseNow == null ? 1000 : baseNow;
    nextId = 0;
    timers = [];
    performance.now = function () { return now; };
    window.setTimeout = function (cb, ms) {
      const id = ++nextId;
      timers.push({ id: id, fireAt: now + (ms || 0), cb: cb, kind: 'timeout' });
      return id;
    };
    window.clearTimeout = function (id) {
      timers = timers.filter(function (t) { return t.id !== id; });
    };
    window.setInterval = function (cb, ms) {
      const id = ++nextId;
      timers.push({ id: id, fireAt: now + (ms || 0), cb: cb, kind: 'interval', interval: ms || 0 });
      return id;
    };
    window.clearInterval = function (id) {
      timers = timers.filter(function (t) { return t.id !== id; });
    };
    installed = true;
  }

  function uninstall() {
    if (!installed) return;
    performance.now = real.perfNow;
    window.setTimeout = real.setTimeout;
    window.clearTimeout = real.clearTimeout;
    window.setInterval = real.setInterval;
    window.clearInterval = real.clearInterval;
    real = null;
    installed = false;
    now = 0;
    nextId = 0;
    timers = [];
  }

  function nextDue() {
    let best = null, bestIdx = -1;
    for (let i = 0; i < timers.length; i++) {
      const t = timers[i];
      if (best === null || t.fireAt < best.fireAt) { best = t; bestIdx = i; }
    }
    return { timer: best, index: bestIdx };
  }

  function tick(ms) {
    const target = now + ms;
    let safety = 100_000;
    while (safety-- > 0) {
      const d = nextDue();
      if (!d.timer || d.timer.fireAt > target) {
        now = target;
        return;
      }
      now = d.timer.fireAt;
      timers.splice(d.index, 1);
      if (d.timer.kind === 'interval') {
        timers.push({ id: ++nextId, fireAt: now + d.timer.interval, cb: d.timer.cb, kind: 'interval', interval: d.timer.interval });
      }
      try { d.timer.cb(); } catch (e) { console.error('[fake-clock]', e); }
    }
    console.error('[fake-clock] tick safety limit hit');
  }

  function jump(ms) {
    now += ms;
  }

  function flush() {
    let safety = 100_000;
    while (safety-- > 0) {
      const d = nextDue();
      if (!d.timer || d.timer.fireAt > now) return;
      timers.splice(d.index, 1);
      if (d.timer.kind === 'interval') {
        timers.push({ id: ++nextId, fireAt: now + d.timer.interval, cb: d.timer.cb, kind: 'interval', interval: d.timer.interval });
      }
      try { d.timer.cb(); } catch (e) { console.error('[fake-clock]', e); }
    }
  }

  window.TestClock = {
    install: install,
    uninstall: uninstall,
    tick: tick,
    jump: jump,
    flush: flush,
    get now() { return now; },
    get queueLength() { return timers.length; },
  };
})();
