/* ─────────────────────────────────────────────────────────────────────────
   web-haptics 0.0.6   MIT  ·  Lochie Axon  ·  https://haptics.lochie.me

   ⚠ DO NOT EDIT BY HAND. Verbatim port of the upstream `dist/chunk-*.mjs`
   bundle with ESM `export`s stripped and `WebHaptics` exposed on `window`.

   Upgrade procedure:
     1. npm pack web-haptics@<new-version>
     2. Open dist/chunk-*.mjs from the tarball
     3. Replace the body below from `var defaultPatterns` through `class
        WebHaptics { ... }` with the new contents
     4. Bump the version in this comment header
     5. Bump CACHE in sw.js so PWAs pick up the new asset

   Loaded as a classic <script> before app.js so file:// double-click works
   without CORS or module-loading concerns.
   ───────────────────────────────────────────────────────────────────────── */

(function (root) {
  'use strict';

  var defaultPatterns = {
    success: { pattern: [{ duration: 30, intensity: 0.5 }, { delay: 60, duration: 40, intensity: 1 }] },
    warning: { pattern: [{ duration: 40, intensity: 0.8 }, { delay: 100, duration: 40, intensity: 0.6 }] },
    error:   { pattern: [{ duration: 40, intensity: 0.9 }, { delay: 40, duration: 40, intensity: 0.9 }, { delay: 40, duration: 40, intensity: 0.9 }] },
    light:     { pattern: [{ duration: 15, intensity: 0.4 }] },
    medium:    { pattern: [{ duration: 25, intensity: 0.7 }] },
    heavy:     { pattern: [{ duration: 35, intensity: 1   }] },
    soft:      { pattern: [{ duration: 40, intensity: 0.5 }] },
    rigid:     { pattern: [{ duration: 10, intensity: 1   }] },
    selection: { pattern: [{ duration:  8, intensity: 0.3 }] },
    nudge:     { pattern: [{ duration: 80, intensity: 0.8 }, { delay: 80, duration: 50, intensity: 0.3 }] },
    buzz:      { pattern: [{ duration: 1000, intensity: 1 }] },
  };
  var MIN_ON = 16, MAX_OFF = 184, MAX_DURATION = 1000, FRAME = 20;

  function normaliseInput(o) {
    if (typeof o === 'number') return { vibrations: [{ duration: o }] };
    if (typeof o === 'string') {
      const i = defaultPatterns[o];
      if (!i) { console.warn(`[web-haptics] Unknown preset: "${o}"`); return null; }
      return { vibrations: i.pattern.map(t => ({ ...t })) };
    }
    if (Array.isArray(o)) {
      if (o.length === 0) return { vibrations: [] };
      if (typeof o[0] === 'number') {
        const t = [];
        for (let e = 0; e < o.length; e += 2) {
          const n = e > 0 ? o[e - 1] : 0;
          t.push({ ...(n > 0 && { delay: n }), duration: o[e] });
        }
        return { vibrations: t };
      }
      return { vibrations: o.map(i => ({ ...i })) };
    }
    return { vibrations: o.pattern.map(i => ({ ...i })) };
  }
  function pulseFor(duration, intensity) {
    if (intensity >= 1) return [duration];
    if (intensity <= 0) return [];
    const onMs = Math.max(1, Math.round(FRAME * intensity));
    const offMs = FRAME - onMs;
    const out = [];
    let remaining = duration;
    while (remaining >= FRAME) { out.push(onMs); out.push(offMs); remaining -= FRAME; }
    if (remaining > 0) {
      const a = Math.max(1, Math.round(remaining * intensity));
      out.push(a);
      const r = remaining - a;
      if (r > 0) out.push(r);
    }
    return out;
  }
  function buildPattern(vibs, baseIntensity) {
    const out = [];
    for (const v of vibs) {
      const intensity = Math.max(0, Math.min(1, v.intensity ?? baseIntensity));
      const delay = v.delay ?? 0;
      if (delay > 0) {
        if (out.length > 0 && out.length % 2 === 0) out[out.length - 1] += delay;
        else { if (out.length === 0) out.push(0); out.push(delay); }
      }
      const ons = pulseFor(v.duration, intensity);
      if (ons.length === 0) {
        if (out.length > 0 && out.length % 2 === 0) out[out.length - 1] += v.duration;
        else if (v.duration > 0) { out.push(0); out.push(v.duration); }
        continue;
      }
      for (const d of ons) out.push(d);
    }
    return out;
  }

  let instanceCounter = 0;
  class WebHaptics {
    static isSupported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
    constructor(opts) {
      this.instanceId = ++instanceCounter;
      this.debug = opts?.debug ?? false;
      this.showSwitch = opts?.showSwitch ?? false;
      this.hapticLabel = null;
      this.domInitialized = false;
      this.rafId = null;
      this.patternResolve = null;
      this.audioCtx = null;
      this.audioFilter = null;
      this.audioGain = null;
      this.audioBuffer = null;
    }
    async trigger(input = [{ duration: 25, intensity: 0.7 }], opts) {
      const e = normaliseInput(input);
      if (!e) return;
      const { vibrations: vibs } = e;
      if (vibs.length === 0) return;
      const base = Math.max(0, Math.min(1, opts?.intensity ?? 0.5));
      for (const v of vibs) {
        if (v.duration > MAX_DURATION) v.duration = MAX_DURATION;
        if (!Number.isFinite(v.duration) || v.duration < 0 ||
            (v.delay !== undefined && (!Number.isFinite(v.delay) || v.delay < 0))) {
          console.warn('[web-haptics] Invalid vibration values.');
          return;
        }
      }
      if (WebHaptics.isSupported) navigator.vibrate(buildPattern(vibs, base));
      if (!WebHaptics.isSupported || this.debug) {
        this.ensureDOM();
        if (!this.hapticLabel) return;
        if (this.debug) await this.ensureAudio();
        this.stopPattern();
        const fireFirst = (vibs[0]?.delay ?? 0) === 0;
        if (fireFirst) {
          this.hapticLabel.click();
          if (this.debug && this.audioCtx) {
            const d = Math.max(0, Math.min(1, vibs[0].intensity ?? base));
            this.playClick(d);
          }
        }
        await this.runPattern(vibs, base, fireFirst);
      }
    }
    cancel() { this.stopPattern(); if (WebHaptics.isSupported) navigator.vibrate(0); }
    destroy() {
      this.stopPattern();
      if (this.hapticLabel) { this.hapticLabel.remove(); this.hapticLabel = null; this.domInitialized = false; }
      if (this.audioCtx) { this.audioCtx.close(); this.audioCtx = null; this.audioFilter = null; this.audioGain = null; this.audioBuffer = null; }
    }
    setDebug(d) {
      this.debug = d;
      if (!d && this.audioCtx) { this.audioCtx.close(); this.audioCtx = null; this.audioFilter = null; this.audioGain = null; this.audioBuffer = null; }
    }
    setShowSwitch(s) {
      this.showSwitch = s;
      if (this.hapticLabel) {
        const t = this.hapticLabel.querySelector('input');
        this.hapticLabel.style.display = s ? '' : 'none';
        if (t) t.style.display = s ? '' : 'none';
      }
    }
    stopPattern() {
      if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
      this.patternResolve?.();
      this.patternResolve = null;
    }
    runPattern(vibs, base, alreadyFired) {
      return new Promise(resolve => {
        this.patternResolve = resolve;
        const segments = [];
        let acc = 0;
        for (const v of vibs) {
          const intensity = Math.max(0, Math.min(1, v.intensity ?? base));
          const delay = v.delay ?? 0;
          if (delay > 0) { acc += delay; segments.push({ end: acc, isOn: false, intensity: 0 }); }
          acc += v.duration;
          segments.push({ end: acc, isOn: true, intensity });
        }
        const total = acc;
        let start = 0, lastClick = -1;
        const tick = (ts) => {
          if (start === 0) start = ts;
          const elapsed = ts - start;
          if (elapsed >= total) { this.rafId = null; this.patternResolve = null; resolve(); return; }
          let seg = segments[0];
          for (const s of segments) if (elapsed < s.end) { seg = s; break; }
          if (seg.isOn) {
            const interval = MIN_ON + (1 - seg.intensity) * MAX_OFF;
            if (lastClick === -1) {
              lastClick = ts;
              if (!alreadyFired) {
                this.hapticLabel?.click();
                if (this.debug && this.audioCtx) this.playClick(seg.intensity);
                alreadyFired = true;
              }
            } else if (ts - lastClick >= interval) {
              this.hapticLabel?.click();
              if (this.debug && this.audioCtx) this.playClick(seg.intensity);
              lastClick = ts;
            }
          }
          this.rafId = requestAnimationFrame(tick);
        };
        this.rafId = requestAnimationFrame(tick);
      });
    }
    playClick(intensity) {
      if (!this.audioCtx || !this.audioFilter || !this.audioGain || !this.audioBuffer) return;
      const data = this.audioBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / 25);
      this.audioGain.gain.value = 0.5 * intensity;
      const freq = (2000 + intensity * 2000) * (1 + (Math.random() - 0.5) * 0.3);
      this.audioFilter.frequency.value = freq;
      const src = this.audioCtx.createBufferSource();
      src.buffer = this.audioBuffer;
      src.connect(this.audioFilter);
      src.onended = () => src.disconnect();
      src.start();
    }
    async ensureAudio() {
      if (!this.audioCtx && typeof AudioContext !== 'undefined') {
        this.audioCtx = new AudioContext();
        this.audioFilter = this.audioCtx.createBiquadFilter();
        this.audioFilter.type = 'bandpass';
        this.audioFilter.frequency.value = 4000;
        this.audioFilter.Q.value = 8;
        this.audioGain = this.audioCtx.createGain();
        this.audioFilter.connect(this.audioGain);
        this.audioGain.connect(this.audioCtx.destination);
        const seconds = 0.004;
        this.audioBuffer = this.audioCtx.createBuffer(1, this.audioCtx.sampleRate * seconds, this.audioCtx.sampleRate);
        const data = this.audioBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / 25);
      }
      if (this.audioCtx?.state === 'suspended') await this.audioCtx.resume();
    }
    ensureDOM() {
      if (this.domInitialized || typeof document === 'undefined') return;
      const id = `web-haptics-${this.instanceId}`;
      const label = document.createElement('label');
      label.setAttribute('for', id);
      label.textContent = 'Haptic feedback';
      Object.assign(label.style, {
        position: 'fixed', bottom: '10px', left: '10px', padding: '5px 10px',
        backgroundColor: 'rgba(0,0,0,0.7)', color: 'white', fontFamily: 'sans-serif',
        fontSize: '14px', borderRadius: '4px', zIndex: '9999', userSelect: 'none',
      });
      this.hapticLabel = label;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.id = id;
      input.style.all = 'initial';
      input.style.appearance = 'auto';
      if (!this.showSwitch) { label.style.display = 'none'; input.style.display = 'none'; }
      label.appendChild(input);
      document.body.appendChild(label);
      this.domInitialized = true;
    }
  }

  root.WebHaptics = WebHaptics;
})(typeof window !== 'undefined' ? window : globalThis);
