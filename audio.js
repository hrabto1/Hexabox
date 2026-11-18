// Synthesized sound effects via Web Audio — no audio files, so both the
// Artifact/web build and the native build get sound with zero asset
// pipeline. Every effect is a short (<250ms) oscillator blip with a quick
// attack/decay envelope; nothing loops or sustains, so there's no "annoying
// after a while" risk from a droning tone, and intensity is scaled to how
// meaningful the action is (a pipe tap stays near-silent; a 3-star win gets
// the full fanfare) rather than playing everything at the same volume.
(function () {
  "use strict";
  var ctx = null;
  var muted = false;

  function ensureCtx() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { ctx = null; }
    return ctx;
  }

  // Browsers refuse to start an AudioContext until a user gesture; app.js
  // calls this from a document-level pointerdown listener so the very first
  // tap anywhere in the app (not just on the board) unblocks sound.
  function unlock() {
    var c = ensureCtx();
    if (c && c.state === "suspended") c.resume().catch(function () {});
  }

  function setMuted(v) { muted = !!v; }

  function tone(opts) {
    if (muted) return;
    var c = ensureCtx();
    if (!c) return;
    var t0 = c.currentTime + (opts.delay || 0);
    var dur = opts.dur || 0.12;
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = opts.type || "sine";
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), t0 + dur);
    var peak = opts.gain != null ? opts.gain : 0.15;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + Math.min(0.012, dur * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function playSlide() { tone({ freq: 760, dur: 0.055, type: "triangle", gain: 0.14 }); }

  // Quiet on purpose: pipe rotation is the most frequent single tap in the
  // game (whole levels are solved by rotating pipes over and over), so it
  // gets a near-subliminal click rather than anything that could fatigue.
  function playRotatePipe() { tone({ freq: 560, freqEnd: 480, dur: 0.045, type: "square", gain: 0.06 }); }

  function playRotateHub() {
    [520, 620, 720].forEach(function (f, i) {
      tone({ freq: f, dur: 0.05, type: "triangle", gain: 0.12, delay: i * 0.03 });
    });
  }

  function playTeleport() {
    tone({ freq: 320, freqEnd: 920, dur: 0.16, type: "sine", gain: 0.15 });
    tone({ freq: 660, dur: 0.12, type: "triangle", gain: 0.07, delay: 0.04 });
  }

  // A redirect that fizzled out — distinct from playLocked below: this is a
  // "stopped short" sound, not a "that's not allowed" sound.
  function playBlocked() { tone({ freq: 200, freqEnd: 90, dur: 0.13, type: "square", gain: 0.12 }); }

  // Tapping a fixed tile: a duller double-bonk, paired with the existing
  // shake animation so the "no" reads through sound and motion together.
  function playLocked() {
    tone({ freq: 150, dur: 0.09, type: "sine", gain: 0.12 });
    tone({ freq: 130, dur: 0.08, type: "sine", gain: 0.08, delay: 0.05 });
  }

  // Scales with star count so the celebration matches the achievement
  // instead of always playing the same fixed jingle — a 1-star clear still
  // feels like a win, a 3-star clear feels like THE win.
  function playWin(stars) {
    var notes = [523.25, 659.25];
    if (stars >= 2) notes.push(783.99);
    if (stars >= 3) notes.push(1046.5);
    notes.forEach(function (f, i) {
      tone({ freq: f, dur: 0.16, type: "triangle", gain: 0.17, delay: i * 0.09 });
    });
    if (stars >= 3) tone({ freq: 1318.51, dur: 0.22, type: "sine", gain: 0.14, delay: notes.length * 0.09 + 0.02 });
  }

  function playCoin() {
    tone({ freq: 1567.98, dur: 0.05, type: "sine", gain: 0.12 });
    tone({ freq: 2093, dur: 0.09, type: "sine", gain: 0.12, delay: 0.045 });
  }

  function playPurchase() {
    [783.99, 1046.5, 1318.51].forEach(function (f, i) {
      tone({ freq: f, dur: i === 2 ? 0.2 : 0.12, type: "triangle", gain: 0.15, delay: i * 0.06 });
    });
  }

  window.HexaboxAudio = {
    unlock: unlock, setMuted: setMuted,
    playSlide: playSlide, playRotatePipe: playRotatePipe, playRotateHub: playRotateHub,
    playTeleport: playTeleport, playBlocked: playBlocked, playLocked: playLocked,
    playWin: playWin, playCoin: playCoin, playPurchase: playPurchase
  };
})();
