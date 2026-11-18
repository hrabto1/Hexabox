// Haptic feedback: uses the official Capacitor Haptics plugin when it's
// installed and running natively (it isn't currently — see package.json —
// so this stays a documented no-op there until `@capacitor/haptics` +
// `npx cap sync` are added), falling back to the plain Web Vibration API
// (works in Android/Chrome WebViews and mobile browsers; Safari/iOS has no
// Vibration API support, so it silently no-ops there too). Either way this
// file never throws and never blocks the game on haptics being unavailable
// — the same defensive shape as ads.js.
//
// Used sparingly on purpose: only on actions meaningful enough to deserve a
// buzz (a slide landing, a teleport, a blocked move, a win) — never on the
// highest-frequency trivial tap (pipe rotation), per the "haptics confirm
// meaningful actions, not trivial taps" guidance this was modeled on.
(function () {
  "use strict";
  var enabled = true;

  function setEnabled(v) { enabled = !!v; }

  function plugin() {
    return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
  }

  function impact(style, fallbackMs) {
    if (!enabled) return;
    var h = plugin();
    if (h && h.impact) { h.impact({ style: style }).catch(function () {}); return; }
    if (navigator.vibrate) { try { navigator.vibrate(fallbackMs); } catch (e) { /* ignore */ } }
  }

  function notify(type, fallbackPattern) {
    if (!enabled) return;
    var h = plugin();
    if (h && h.notification) { h.notification({ type: type }).catch(function () {}); return; }
    if (navigator.vibrate) { try { navigator.vibrate(fallbackPattern); } catch (e) { /* ignore */ } }
  }

  function light() { impact("LIGHT", 8); }
  function medium() { impact("MEDIUM", 15); }
  function success() { notify("SUCCESS", [10, 40, 10, 40, 20]); }
  function warning() { notify("WARNING", [15, 30, 15]); }

  window.HexaboxHaptics = { setEnabled: setEnabled, light: light, medium: medium, success: success, warning: warning };
})();
