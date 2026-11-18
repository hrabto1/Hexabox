// AdMob integration for the native Android/iOS app only. On the web (and the
// Claude Artifact) this file no-ops completely: third-party ad SDKs can't run
// there anyway (the sandbox blocks everything outside its CDN allowlist), and
// the web version is meant to stay ad-free regardless.
//
// Cadence is deliberately gentle: a small banner only on the level-select
// screen (never on the game screen, so it can never cover the puzzle), and an
// interstitial only once every few level wins, shown between levels rather
// than interrupting play.
//
// IMPORTANT: the ad unit IDs below are Google's official PUBLIC TEST IDs —
// https://developers.google.com/admob/android/test-ads — they always serve
// clearly-labeled test creatives and never earn real revenue. Swap them (and
// the AdMob application ID in AndroidManifest.xml / Info.plist) for your own
// AdMob account's IDs before any real store release.
(function () {
  "use strict";
  // Launching ad-free: there's no real AdMob account/ad-unit IDs yet, and
  // shipping Google's public TEST ad IDs to real Play Store users isn't
  // allowed by AdMob policy (test ads are for the developer's own test
  // devices only). The integration below is otherwise complete — flip this
  // back to true once TEST_IDS is replaced with real IDs from
  // https://admob.google.com (see NATIVE_APP_README.md) to re-enable ads in
  // a future update.
  var ADS_ENABLED = false;

  var TEST_IDS = {
    android: { banner: "ca-app-pub-3940256099942544/6300978111", interstitial: "ca-app-pub-3940256099942544/1033173712" },
    ios: { banner: "ca-app-pub-3940256099942544/2934735716", interstitial: "ca-app-pub-3940256099942544/4411468910" }
  };
  var INTERSTITIAL_EVERY = 5;
  var ready = false;
  var winsSinceInterstitial = 0;

  function isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }
  function platformIds() {
    var p = (window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform()) || "android";
    return TEST_IDS[p] || TEST_IDS.android;
  }
  function plugin() {
    return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob;
  }

  function init() {
    if (!ADS_ENABLED || !isNative() || !plugin()) return; // web/Artifact and ad-free builds: stays ad-free, no-op
    plugin().initialize({ initializeForTesting: true })
      .then(function () { ready = true; })
      .catch(function () { /* ads are optional — never block the game on this */ });
  }

  function showBannerOnSelect() {
    if (!ready) return;
    plugin().showBanner({
      adId: platformIds().banner, adSize: "ADAPTIVE_BANNER", position: "BOTTOM_CENTER", margin: 0
    }).catch(function () {});
  }

  function hideBanner() {
    if (!ready) return;
    plugin().hideBanner().catch(function () {});
  }

  function notifyLevelWon() {
    if (!ready) return;
    winsSinceInterstitial++;
    if (winsSinceInterstitial < INTERSTITIAL_EVERY) return;
    winsSinceInterstitial = 0;
    var adId = platformIds().interstitial;
    plugin().prepareInterstitial({ adId: adId })
      .then(function () { return plugin().showInterstitial(); })
      .catch(function () {});
  }

  window.HexaboxAds = { init: init, showBannerOnSelect: showBannerOnSelect, hideBanner: hideBanner, notifyLevelWon: notifyLevelWon };
})();
