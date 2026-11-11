(function () {
  "use strict";
  var L = window.HexLogic;
  var LEVELS = window.HEXABOX_LEVELS;

  var COLOR_HEX = { keyA: "#3FE1C3", keyB: "#FFC857", keyC: "#B47CFF", obstacle: "#3a4356" };
  // Rarity roughly tracks cost: common (free–60) / rare (90–140) / epic
  // (160–230, a "special" render flair) / legendary (280+, animated shimmer).
  // Every skin is built around real gemstones, and within each skin the three
  // key colors are deliberately pulled from different hue families (never
  // shades of the same stone) so two-or-more-gem levels stay legible at a
  // glance — on top of the distinct per-key-id gem CUT (see drawGemGlyph),
  // which is the second, color-independent way to tell them apart.
  var SKINS = [
    { id: "default", name: "Hexabox", cost: 0, rarity: "výchozí", colors: { keyA: "#3FE1C3", keyB: "#FFC857", keyC: "#B47CFF", obstacle: "#3a4356" } },
    { id: "ruby", name: "Rubín", cost: 40, rarity: "běžný", colors: { keyA: "#E0294B", keyB: "#FFD23F", keyC: "#2D7DD2", obstacle: "#2a1016" } },
    { id: "sapphire", name: "Safír", cost: 60, rarity: "běžný", colors: { keyA: "#2176FF", keyB: "#C6F24E", keyC: "#FF4D6D", obstacle: "#10172a" } },
    { id: "emerald", name: "Smaragd", cost: 60, rarity: "běžný", colors: { keyA: "#15B371", keyB: "#9B5DE5", keyC: "#FFB238", obstacle: "#0f2318" } },
    { id: "garnet", name: "Granát", cost: 90, rarity: "vzácný", colors: { keyA: "#C2184D", keyB: "#3FD1C9", keyC: "#FFCA3A", obstacle: "#220a14" } },
    { id: "amethyst", name: "Ametyst", cost: 110, rarity: "vzácný", colors: { keyA: "#8E54E8", keyB: "#2EC4A6", keyC: "#FF6F59", obstacle: "#1c1430" } },
    { id: "aquamarine", name: "Akvamarín", cost: 140, rarity: "vzácný", colors: { keyA: "#4FD3E8", keyB: "#FF86B3", keyC: "#FFE066", obstacle: "#0c1f24" } },
    { id: "topaz", name: "Zlatý topaz", cost: 190, rarity: "epický", special: "shine", colors: { keyA: "#FFC233", keyB: "#3E7CFF", keyC: "#FF4365", obstacle: "#241a08" } },
    { id: "onyx", name: "Onyx", cost: 230, rarity: "epický", special: "shine", colors: { keyA: "#F4F7FB", keyB: "#FF3B5C", keyC: "#2FD492", obstacle: "#07070a" } },
    { id: "galaxy", name: "Galaktický opál", cost: 300, rarity: "legendární", special: "animated", colors: { keyA: "#8B5CF6", keyB: "#38F2E0", keyC: "#FFB74D", obstacle: "#0a0a1a" } },
    { id: "aurora", name: "Polární záře", cost: 380, rarity: "legendární", special: "animated", colors: { keyA: "#39FF8A", keyB: "#6E7BFF", keyC: "#FF4FD8", obstacle: "#04131a" } }
  ];
  var activeSkinSpecial = null;
  function applySkin(id) {
    var skin = SKINS.filter(function (s) { return s.id === id; })[0] || SKINS[0];
    COLOR_HEX.keyA = skin.colors.keyA; COLOR_HEX.keyB = skin.colors.keyB;
    COLOR_HEX.keyC = skin.colors.keyC; COLOR_HEX.obstacle = skin.colors.obstacle;
    activeSkinSpecial = skin.special || null;
  }
  function hexToHsl(hex) {
    var r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; } else {
      var d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0); else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h /= 6;
    }
    return [h * 360, s * 100, l * 100];
  }
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360; s /= 100; l /= 100;
    function hue2rgb(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }
    var r, g, b;
    if (s === 0) { r = g = b = l; } else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3);
    }
    function toHex(x) { var hx = Math.round(x * 255).toString(16); return hx.length === 1 ? "0" + hx : hx; }
    return "#" + toHex(r) + toHex(g) + toHex(b);
  }
  // Legendary skins get a slow hue shimmer instead of a flat tint; everything
  // else just uses its fixed color, so the flashiest look is reserved for the
  // priciest tier rather than applied everywhere.
  function liveTint(baseHex) {
    if (activeSkinSpecial !== "animated") return baseHex;
    var hsl = hexToHsl(baseHex);
    return hslToHex(hsl[0] + Math.sin(performance.now() / 900) * 20, Math.min(100, hsl[1] + 10), hsl[2]);
  }
  var DIR_TO_EDGE = [0, 5, 4, 3, 2, 1];
  var EDGE_ANGLE = function (dir) { return Math.PI / 180 * (60 * DIR_TO_EDGE[dir]); };
  var STORAGE_KEY = "hexabox_progress_v2";

  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveProgress(p) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ }
  }
  var progress = loadProgress();

  function getMeta() {
    if (!progress._meta) progress._meta = { coins: 0, ownedSkins: ["default"], activeSkin: "default" };
    if (!progress._meta.ownedSkins) progress._meta.ownedSkins = ["default"];
    if (typeof progress._meta.coins !== "number") progress._meta.coins = 0;
    if (!progress._meta.activeSkin) progress._meta.activeSkin = "default";
    return progress._meta;
  }
  function totalStars() {
    var sum = 0;
    LEVELS.forEach(function (lv) { sum += starsFor(lv.id); });
    return sum;
  }
  // Unlocking the next level costs stars, not just a clear — on average you
  // need a genuine 2-star showing on each level behind you, which pushes
  // players to replay and improve rather than just limp through every level.
  function unlockThreshold(id) { return (id - 1) * 2; }
  function isUnlocked(id) { return id === 1 || totalStars() >= unlockThreshold(id); }
  function starsFor(id) { return progress[id] ? progress[id].stars : 0; }

  var viewSelect = document.getElementById("view-select");
  var viewGame = document.getElementById("view-game");
  var levelGrid = document.getElementById("levelGrid");
  var totalStarsEl = document.getElementById("totalStars");
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var canvasWrap = document.getElementById("canvasWrap");
  var hudTitle = document.getElementById("hudTitle");
  var hudSub = document.getElementById("hudSub");
  var moveCountEl = document.getElementById("moveCount");
  var mechChipsEl = document.getElementById("mechChips");
  var winModal = document.getElementById("winModal");
  var modalStars = document.getElementById("modalStars");
  var modalMoves = document.getElementById("modalMoves");
  var confettiLayer = document.getElementById("confettiLayer");
  var unlockProgressEl = document.getElementById("unlockProgress");
  var unlockProgressLabelEl = document.getElementById("unlockProgressLabel");
  var unlockProgressFillEl = document.getElementById("unlockProgressFill");
  var coinsEl = document.getElementById("coinsCount");
  var shopModal = document.getElementById("shopModal");
  var shopGrid = document.getElementById("shopGrid");

  function renderStarsHtml(n) {
    var s = "";
    for (var i = 0; i < 3; i++) s += '<span class="' + (i < n ? "star-on" : "star-off") + '">★</span>';
    return s;
  }

  function renderLevelSelect() {
    levelGrid.innerHTML = "";
    var total = totalStars();
    totalStarsEl.textContent = "★ " + total + " / " + (LEVELS.length * 3);
    coinsEl.textContent = "✦ " + getMeta().coins;
    var nextLocked = LEVELS.filter(function (lv) { return !isUnlocked(lv.id); })[0];
    if (nextLocked) {
      var need = unlockThreshold(nextLocked.id);
      unlockProgressEl.hidden = false;
      unlockProgressLabelEl.textContent = "Ještě " + (need - total) + " ★ k odemčení úrovně " + nextLocked.id + ".";
      unlockProgressFillEl.style.width = Math.min(100, Math.round((total / need) * 100)) + "%";
    } else {
      unlockProgressEl.hidden = true;
    }
    LEVELS.forEach(function (lv) {
      var unlocked = isUnlocked(lv.id);
      var st = starsFor(lv.id);
      var card = document.createElement("button");
      card.className = "level-card" + (unlocked ? "" : " locked") + (st > 0 ? " cleared" : "");
      card.type = "button";
      card.disabled = !unlocked;
      var lockedDesc = "Potřeba " + unlockThreshold(lv.id) + " ★ celkem (máš " + total + ").";
      card.innerHTML =
        '<span class="level-num">' + lv.id + "</span>" +
        '<span class="level-name">' + (unlocked ? escapeHtml(lv.title) : "?") + "</span>" +
        '<span class="level-desc">' + (unlocked ? escapeHtml(lv.subtitle) : lockedDesc) + "</span>" +
        '<span class="level-stars">' + (unlocked ? renderStarsHtml(st) : "🔒") + "</span>";
      if (unlocked) card.addEventListener("click", function () { startLevel(lv.id); });
      levelGrid.appendChild(card);
    });
  }

  function renderShop() {
    var meta = getMeta();
    shopGrid.innerHTML = "";
    SKINS.forEach(function (skin) {
      var owned = meta.ownedSkins.indexOf(skin.id) !== -1;
      var active = meta.activeSkin === skin.id;
      var card = document.createElement("div");
      card.className = "skin-card rarity-" + (skin.special || "plain") + (active ? " active" : "");
      var swatches = ["keyA", "keyB", "keyC"].map(function (k) {
        return '<span class="skin-swatch" style="background:' + skin.colors[k] + '"></span>';
      }).join("");
      var actionHtml;
      if (active) actionHtml = '<span class="skin-status">Aktivní</span>';
      else if (owned) actionHtml = '<button class="btn" data-use="' + skin.id + '">Použít</button>';
      else actionHtml = '<button class="btn primary" data-buy="' + skin.id + '" ' + (meta.coins < skin.cost ? "disabled" : "") + '>Koupit za ✦' + skin.cost + "</button>";
      card.innerHTML =
        '<span class="skin-rarity">' + escapeHtml(skin.rarity) + "</span>" +
        '<div class="skin-swatches">' + swatches + "</div>" +
        '<div class="skin-name">' + escapeHtml(skin.name) + "</div>" +
        actionHtml;
      shopGrid.appendChild(card);
    });
    shopGrid.querySelectorAll("[data-buy]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-buy");
        var skin = SKINS.filter(function (s) { return s.id === id; })[0];
        var m = getMeta();
        if (m.coins < skin.cost) return;
        m.coins -= skin.cost;
        m.ownedSkins.push(id);
        m.activeSkin = id;
        applySkin(id);
        saveProgress(progress);
        renderShop();
        coinsEl.textContent = "✦ " + m.coins;
      });
    });
    shopGrid.querySelectorAll("[data-use]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-use");
        getMeta().activeSkin = id;
        applySkin(id);
        saveProgress(progress);
        renderShop();
      });
    });
  }
  function escapeHtml(s) { return s.replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }

  var game = null;

  function startLevel(id) {
    var def = LEVELS.filter(function (l) { return l.id === id; })[0];
    if (!def) return;
    game = {
      def: def,
      board: def.board,
      teleportPairs: def.teleportPairs,
      tiles: L.cloneTiles(def.tiles),
      initialTiles: L.cloneTiles(def.tiles),
      moves: 0,
      history: [],
      selected: null,
      highlights: [],
      anims: [],
      blockedFlashes: [],
      teleportFlashes: [],
      won: false,
      layout: null,
      deliveries: L.flattenGoals(def.goal).filter(function (g) { return g.type === "deliver"; })
        .reduce(function (acc, g) { return acc.concat(g.deliveries); }, [])
    };
    hudTitle.textContent = def.id + ". " + def.title;
    hudSub.textContent = def.subtitle;
    moveCountEl.textContent = "0";
    mechChipsEl.innerHTML = def.mechanics.map(function (m) { return '<span class="chip">' + escapeHtml(m) + "</span>"; }).join("");
    viewSelect.hidden = true;
    viewGame.hidden = false;
    winModal.hidden = true;
    if (window.HexaboxAds) window.HexaboxAds.hideBanner(); // never show an ad over the puzzle
    computeLayout();
    requestAnimationFrame(renderLoop);
  }

  function backToSelect() {
    game = null;
    viewGame.hidden = true;
    viewSelect.hidden = false;
    renderLevelSelect();
    if (window.HexaboxAds) window.HexaboxAds.showBannerOnSelect();
  }

  function resetLevel() {
    if (!game) return;
    game.tiles = L.cloneTiles(game.initialTiles);
    game.moves = 0;
    game.history = [];
    game.selected = null;
    game.highlights = [];
    game.anims = [];
    game.blockedFlashes = [];
    game.teleportFlashes = [];
    game.won = false;
    moveCountEl.textContent = "0";
    winModal.hidden = true;
  }

  function undo() {
    if (!game || !game.history.length || game.won) return;
    game.tiles = game.history.pop();
    game.moves = Math.max(0, game.moves - 1);
    moveCountEl.textContent = String(game.moves);
    game.selected = null;
    game.highlights = [];
  }

  function computeLayout() {
    var keys = Object.keys(game.board);
    var pts = keys.map(function (k) { var p = L.parseKey(k); return { q: p.q, r: p.r }; });
    var rect = canvasWrap.getBoundingClientRect();
    var w = Math.max(220, rect.width);
    var h = Math.max(220, rect.height);
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    function bboxFor(size) {
      var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      pts.forEach(function (p) {
        var x = size * Math.sqrt(3) * (p.q + p.r / 2);
        var y = size * 1.5 * p.r;
        minX = Math.min(minX, x - size); maxX = Math.max(maxX, x + size);
        minY = Math.min(minY, y - size); maxY = Math.max(maxY, y + size);
      });
      return { minX: minX, maxX: maxX, minY: minY, maxY: maxY, w: maxX - minX, h: maxY - minY };
    }
    var trial = 10;
    var bb = bboxFor(trial);
    // Small, scale-proportional margin (not a flat pixel count) and a size
    // cap tied to the canvas itself, not a fixed constant — so every level,
    // however few cells it has, fills as much of the available screen as it
    // can rather than floating in a fixed-size island.
    var pad = Math.max(8, Math.min(w, h) * 0.025);
    var scale = Math.min((w - pad * 2) / bb.w, (h - pad * 2) / bb.h);
    var size = Math.max(13, Math.min(trial * scale, Math.min(w, h) * 0.5));
    bb = bboxFor(size);
    game.layout = {
      size: size, w: w, h: h,
      offX: w / 2 - (bb.minX + bb.maxX) / 2,
      offY: h / 2 - (bb.minY + bb.maxY) / 2
    };
  }

  function axialToPixel(q, r) {
    var s = game.layout.size;
    return { x: s * Math.sqrt(3) * (q + r / 2) + game.layout.offX, y: s * 1.5 * r + game.layout.offY };
  }
  function pixelToAxial(x, y) {
    var s = game.layout.size;
    var px = x - game.layout.offX, py = y - game.layout.offY;
    var qf = (Math.sqrt(3) / 3 * px - (1 / 3) * py) / s;
    var rf = (2 / 3 * py) / s;
    return cubeRound(qf, rf);
  }
  function cubeRound(qf, rf) {
    var xf = qf, zf = rf, yf = -xf - zf;
    var x = Math.round(xf), y = Math.round(yf), z = Math.round(zf);
    var dx = Math.abs(x - xf), dy = Math.abs(y - yf), dz = Math.abs(z - zf);
    if (dx > dy && dx > dz) x = -y - z; else if (dy > dz) y = -x - z; else z = -x - y;
    return { q: x, r: z };
  }

  function currentState() { return { board: game.board, teleportPairs: game.teleportPairs, tiles: game.tiles }; }

  canvas.addEventListener("pointerdown", function (e) {
    if (!game || game.won) return;
    var rect = canvas.getBoundingClientRect();
    var ax = pixelToAxial(e.clientX - rect.left, e.clientY - rect.top);
    var key = L.key(ax.q, ax.r);
    if (!(key in game.board)) return;
    handleTap(key);
  });

  function handleTap(key) {
    var type = game.board[key];
    if (type === "rotator") { doHubRotate(key); return; }
    // A highlighted move target takes priority over "select the tile sitting
    // there" — this matters specifically for a blocked teleport highlight,
    // whose key IS the occupied paired cell (unlike a blocked slide, whose
    // highlighted dest is always the last free cell before the obstruction).
    if (game.selected && game.selected !== key) {
      var hit = null;
      for (var i = 0; i < game.highlights.length; i++) { if (game.highlights[i].key === key) { hit = game.highlights[i]; break; } }
      if (hit) {
        if (hit.isTeleport) { if (hit.blocked) flashBlocked(hit.blocked); else doTeleport(game.selected, hit.key); }
        else { doSlide(game.selected, hit.dir); if (hit.blocked) flashBlocked(hit.blocked); }
        return;
      }
    }
    var tile = game.tiles[key];
    if (tile) {
      if (game.selected === key) {
        if (tile.isPipe && !tile.fixed) doPipeRotate(key);
        else { game.selected = null; game.highlights = []; if (tile.fixed) flashLocked(); }
        return;
      }
      if (tile.fixed) { flashLocked(); game.selected = null; game.highlights = []; return; }
      selectTile(key);
      return;
    }
    game.selected = null; game.highlights = [];
  }

  // A teleport hop is its own move, separate from sliding: arriving at a
  // portal always just stops there (computeSlideOutcome never hops), so a
  // tile already sitting on one shows the paired cell as a second, distinct
  // tap target instead of jumping there automatically.
  function selectTile(key) {
    game.selected = key;
    game.highlights = [];
    var state = currentState();
    for (var d = 0; d < 6; d++) {
      var outcome = L.computeSlideOutcome(state, key, d);
      if (outcome.dest && outcome.dest !== key) game.highlights.push({ key: outcome.dest, dir: d, blocked: outcome.blocked });
    }
    var tele = L.computeTeleportOutcome(state, key);
    if (tele) {
      if (tele.dest) game.highlights.push({ key: tele.dest, dir: null, isTeleport: true, blocked: null });
      else if (tele.blocked) game.highlights.push({ key: tele.blocked, dir: null, isTeleport: true, blocked: tele.blocked });
    }
  }

  // A redirect (conveyor belt, or the hop at a teleport) that couldn't
  // complete still lets the move land short, silently — this flashes the
  // cell that stopped it (the occupied/unreachable far side) so the player
  // understands WHY, instead of wondering why nothing happened.
  function flashBlocked(key) {
    game.blockedFlashes.push({ key: key, start: performance.now(), duration: 650 });
  }

  function flashLocked() {
    canvasWrap.classList.add("shake");
    setTimeout(function () { canvasWrap.classList.remove("shake"); }, 220);
  }

  function pushHistory() {
    game.history.push(L.cloneTiles(game.tiles));
    if (game.history.length > 60) game.history.shift();
  }

  function doSlide(fromKey, dir) {
    var state = currentState();
    var destKey = L.computeSlideDestinationKey(state, fromKey, dir);
    var next = L.applySlide(state, fromKey, dir);
    if (!next || !destKey) return;
    pushHistory();
    var fp = L.parseKey(fromKey), tp = L.parseKey(destKey);
    var fromPix = axialToPixel(fp.q, fp.r), toPix = axialToPixel(tp.q, tp.r);
    game.tiles = next.tiles;
    game.selected = null; game.highlights = [];
    game.anims.push({ key: destKey, fromX: fromPix.x, fromY: fromPix.y, toX: toPix.x, toY: toPix.y, start: performance.now(), duration: 180 });
    afterMove();
  }

  function doTeleport(fromKey, toKey) {
    var state = currentState();
    var next = L.applyTeleport(state, fromKey);
    if (!next) return;
    pushHistory();
    game.tiles = next.tiles;
    game.selected = null; game.highlights = [];
    var now = performance.now();
    game.teleportFlashes.push({ key: fromKey, start: now, duration: 450 });
    game.teleportFlashes.push({ key: toKey, start: now, duration: 450 });
    afterMove();
  }

  function doHubRotate(hubKey) {
    var state = currentState();
    var next = L.applyHubRotate(state, hubKey);
    if (!next) return;
    pushHistory();
    var hub = L.parseKey(hubKey);
    var neighKeys = L.CW_ORDER.map(function (di) { var d = L.DIRS[di]; return L.key(hub.q + d.q, hub.r + d.r); });
    var oldTiles = game.tiles;
    for (var p = 0; p < 6; p++) {
      var srcKey = neighKeys[(p - 1 + 6) % 6];
      var dstKey = neighKeys[p];
      if (oldTiles[srcKey]) {
        var sp = L.parseKey(srcKey), dp = L.parseKey(dstKey);
        var fp = axialToPixel(sp.q, sp.r), tp = axialToPixel(dp.q, dp.r);
        game.anims.push({ key: dstKey, fromX: fp.x, fromY: fp.y, toX: tp.x, toY: tp.y, start: performance.now(), duration: 260 });
      }
    }
    game.tiles = next.tiles;
    game.selected = null; game.highlights = [];
    afterMove();
  }

  function doPipeRotate(key) {
    var state = currentState();
    var next = L.applyPipeRotate(state, key);
    if (!next) return;
    pushHistory();
    game.tiles = next.tiles;
    afterMove();
  }

  function afterMove() {
    game.moves++;
    moveCountEl.textContent = String(game.moves);
    if (L.checkGoal(currentState(), game.def.goal)) {
      game.won = true;
      setTimeout(onWin, 280);
    }
  }

  function onWin() {
    var par = game.def.par;
    var stars = game.moves <= par ? 3 : (game.moves <= par + 3 ? 2 : 1);
    var prev = progress[game.def.id];
    var bestStars = Math.max(stars, prev ? prev.stars : 0);
    var bestMoves = prev ? Math.min(prev.bestMoves, game.moves) : game.moves;
    progress[game.def.id] = { stars: bestStars, bestMoves: bestMoves };
    var reward = prev ? 2 : (10 + stars * 8);
    // A small, transparent chance of a surprise bonus — an unpredictable
    // reward on top of the guaranteed one reads as a nice surprise rather
    // than a manipulative drip-feed, since the base reward never depends on it.
    var bonus = 0;
    if (Math.random() < 0.15) bonus = 5 + Math.floor(Math.random() * 11);
    getMeta().coins += reward + bonus;
    saveProgress(progress);
    modalStars.innerHTML = renderStarsHtml(stars);
    var msg = "Vyřešeno na " + game.moves + " tahů (par " + par + "). +" + reward + " ✦";
    if (bonus) msg += " a bonus +" + bonus + " ✦!";
    else if (stars < 3 && game.moves - par <= 2) msg += " Jen o " + (game.moves - par) + " tah" + (game.moves - par === 1 ? "" : "y") + " víc pro 3 ★!";
    modalMoves.textContent = msg;
    var btnNext = document.getElementById("btnNext");
    btnNext.textContent = game.def.id < LEVELS.length ? "Dalš\xED \xFAroveň" : "Zpět na mapu";
    winModal.hidden = false;
    spawnConfetti();
    if (window.HexaboxAds) window.HexaboxAds.notifyLevelWon();
  }

  function spawnConfetti() {
    confettiLayer.innerHTML = "";
    var palette = Object.keys(COLOR_HEX).map(function (k) { return COLOR_HEX[k]; });
    for (var i = 0; i < 26; i++) {
      var el = document.createElement("span");
      el.className = "confetti-piece";
      el.style.left = (Math.random() * 100) + "%";
      el.style.background = palette[i % palette.length];
      el.style.animationDelay = (Math.random() * 0.25) + "s";
      el.style.transform = "rotate(" + (Math.random() * 360) + "deg)";
      confettiLayer.appendChild(el);
    }
    setTimeout(function () { confettiLayer.innerHTML = ""; }, 1600);
  }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function tilePixel(key, ts) {
    for (var i = 0; i < game.anims.length; i++) {
      var a = game.anims[i];
      if (a.key === key) {
        var t = Math.min(1, (ts - a.start) / a.duration);
        var e = easeOutCubic(t);
        return { x: a.fromX + (a.toX - a.fromX) * e, y: a.fromY + (a.toY - a.fromY) * e };
      }
    }
    var p = L.parseKey(key);
    return axialToPixel(p.q, p.r);
  }

  function hexPath(x, y, size) {
    ctx.beginPath();
    for (var i = 0; i < 6; i++) {
      var ang = Math.PI / 180 * (60 * i - 30);
      var px = x + size * Math.cos(ang), py = y + size * Math.sin(ang);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function drawHubGlyph(x, y, r) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#B47CFF";
    for (var i = 0; i < 6; i++) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(r * 0.5, -r * 0.08, r * 0.55, r * 0.2);
      ctx.quadraticCurveTo(r * 0.3, r * 0.14, 0, 0);
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = "#17101f";
    ctx.beginPath(); ctx.arc(x, y, r * 0.17, 0, Math.PI * 2); ctx.fill();
  }

  function drawCell(x, y, type) {
    var size = game.layout.size;
    var r = size * 0.96;
    if (type === "wall") {
      hexPath(x, y, r);
      ctx.fillStyle = "#0a0f17"; ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.32, y - r * 0.38); ctx.lineTo(x + r * 0.04, y - r * 0.02);
      ctx.lineTo(x - r * 0.12, y + r * 0.1); ctx.lineTo(x + r * 0.34, y + r * 0.42);
      ctx.stroke();
      return;
    }
    var oneway = L.taggedDir(type, "oneway:");
    var conveyor = L.taggedDir(type, "conveyor:");
    var fill = "#141C2B";
    if (type === "ice") fill = "#17374a";
    else if (type === "teleportA" || type === "teleportB") fill = "#1d1733";
    else if (type === "rotator") fill = "#201732";
    else if (type === "source" || type === "target") fill = "#121c22";
    else if (oneway !== null) fill = "#241a1a";
    else if (conveyor !== null) fill = "#1a2420";
    hexPath(x, y, r);
    ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(255,255,255,0.07)"; ctx.stroke();

    if (type === "ice") {
      ctx.strokeStyle = "rgba(170,225,255,0.4)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - r * 0.42, y + r * 0.12); ctx.lineTo(x + r * 0.42, y - r * 0.28); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - r * 0.1, y + r * 0.42); ctx.lineTo(x + r * 0.2, y + r * 0.1); ctx.stroke();
    } else if (type === "teleportA" || type === "teleportB") {
      ctx.strokeStyle = "#B47CFF"; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(x, y, r * 0.72, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    } else if (type === "rotator") {
      drawHubGlyph(x, y, r);
    } else if (type === "source" || type === "target") {
      var c = type === "source" ? "#3FE1C3" : "#FFC857";
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(x, y, r * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.45; ctx.strokeStyle = c; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (oneway !== null) {
      drawArrowGlyph(x, y, r, EDGE_ANGLE(oneway), "#FF6F91", 1);
    } else if (conveyor !== null) {
      var beltPhase = (performance.now() / 500) % 1;
      drawArrowGlyph(x, y, r, EDGE_ANGLE(conveyor), "#6FCF73", 2, beltPhase);
    }
  }

  function drawArrowGlyph(x, y, r, angle, color, count, phase) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    var span = r * 0.9;
    for (var i = 0; i < count; i++) {
      var t = (i / count) + (phase || 0);
      t = t - Math.floor(t);
      var cx = -span * 0.5 + span * t;
      var w = r * 0.22;
      ctx.beginPath();
      ctx.moveTo(cx - w, -w);
      ctx.lineTo(cx + w, 0);
      ctx.lineTo(cx - w, w);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // Shared pulsing hex-ring effect behind both the "blocked" (red) and
  // "teleported" (purple) flashes — only the colors differ.
  function drawPulseFlash(x, y, r, t, fillColor, strokeColor) {
    var alpha = Math.sin(Math.min(1, t) * Math.PI);
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = fillColor;
    hexPath(x, y, r);
    ctx.fill();
    ctx.strokeStyle = strokeColor; ctx.lineWidth = 3.5;
    ctx.shadowColor = strokeColor; ctx.shadowBlur = 14;
    hexPath(x, y, r * 1.06);
    ctx.stroke();
    ctx.restore();
  }
  function drawBlockedFlash(x, y, r, t) { drawPulseFlash(x, y, r, t, "rgba(255,70,70,0.3)", "#FF4646"); }
  function drawTeleportFlash(x, y, r, t) { drawPulseFlash(x, y, r, t, "rgba(180,124,255,0.35)", "#B47CFF"); }

  function drawHighlight(x, y, isTeleport) {
    var r = game.layout.size * 0.5;
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.25 * Math.sin(performance.now() / 220);
    ctx.fillStyle = isTeleport ? "#B47CFF" : "#3FE1C3";
    ctx.beginPath(); ctx.arc(x, y, r * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawLockGlyph(x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(10,10,18,0.55)";
    ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.rect(-s * 0.5, -s * 0.05, s, s * 0.75); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -s * 0.18, s * 0.38, Math.PI, 0); ctx.stroke();
    ctx.restore();
  }

  function drawConduit(x, y, r, dir, lit) {
    var edge = DIR_TO_EDGE[dir];
    var angle = Math.PI / 180 * (60 * edge);
    var ex = x + Math.cos(angle) * r * 0.92, ey = y + Math.sin(angle) * r * 0.92;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = r * 0.26;
    ctx.strokeStyle = lit ? "#3FE1C3" : "#3a4356";
    if (lit) { ctx.shadowColor = "#3FE1C3"; ctx.shadowBlur = 10; }
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.restore();
  }

  function drawPipeTile(x, y, r, tile, key, litSet) {
    hexPath(x, y, r);
    ctx.fillStyle = "#19202E"; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = key === game.selected ? "#EAF2FF" : "rgba(255,255,255,0.12)";
    ctx.stroke();
    var opens = L.effectiveOpenDirs(tile);
    var lit = !!(litSet && litSet.has(key));
    opens.forEach(function (d) { drawConduit(x, y, r, d, lit); });
    ctx.beginPath(); ctx.arc(x, y, r * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = lit ? "#3FE1C3" : "#3a4356"; ctx.fill();
    if (tile.fixed) drawLockGlyph(x, y, r * 0.3);
  }

  function drawColorTile(x, y, r, tile, key) {
    var glowColor = tile.isKey ? (COLOR_HEX[tile.color] || "#fff") : "rgba(0,0,0,0.5)";
    ctx.save();
    ctx.shadowColor = key === game.selected ? "#EAF2FF" : glowColor;
    ctx.shadowBlur = key === game.selected ? 20 : (tile.isKey ? 14 : 6);
    hexPath(x, y, r);
    ctx.fillStyle = COLOR_HEX[tile.color] || "#888";
    ctx.fill();
    ctx.restore();
    hexPath(x, y, r);
    ctx.lineWidth = tile.fixed ? 3 : 1.5;
    ctx.strokeStyle = tile.fixed ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.3)";
    if (tile.fixed) ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (tile.isKey) drawGemGlyph(x, y, r * 0.46, liveTint(COLOR_HEX[tile.color]), tile.keyId);
    if (key === game.selected) {
      hexPath(x, y, r * 1.08);
      ctx.lineWidth = 3; ctx.strokeStyle = "#EAF2FF"; ctx.stroke();
    }
    drawSpecialCellBadge(x, y, r, game.board[key]);
    if (tile.fixed) drawLockGlyph(x, y, r * 0.32);
  }

  // Three distinct gem-cut silhouettes, one per key id, so differently-typed
  // gems read apart by SHAPE too — not only by color — which keeps multi-gem
  // levels legible even under low-contrast skins or for colorblind players.
  // Each outline function draws the closed path (caller fills/strokes it) and
  // returns the point data its matching facet function needs.
  function gemOutlineEmerald(s) {
    var p = {
      tl: { x: -0.52 * s, y: -0.74 * s }, tr: { x: 0.52 * s, y: -0.74 * s },
      sr: { x: 0.86 * s, y: -0.16 * s }, sl: { x: -0.86 * s, y: -0.16 * s },
      bp: { x: 0, y: 0.95 * s }
    };
    ctx.beginPath();
    ctx.moveTo(p.tl.x, p.tl.y); ctx.lineTo(p.tr.x, p.tr.y); ctx.lineTo(p.sr.x, p.sr.y);
    ctx.lineTo(p.bp.x, p.bp.y); ctx.lineTo(p.sl.x, p.sl.y); ctx.closePath();
    return p;
  }
  function gemFacetsEmerald(p) {
    ctx.beginPath();
    ctx.moveTo(p.tl.x, p.tl.y); ctx.lineTo(p.bp.x, p.bp.y);
    ctx.moveTo(p.tr.x, p.tr.y); ctx.lineTo(p.bp.x, p.bp.y);
    ctx.moveTo(p.sl.x, p.sl.y); ctx.lineTo(p.bp.x, p.bp.y);
    ctx.moveTo(p.sr.x, p.sr.y); ctx.lineTo(p.bp.x, p.bp.y);
    ctx.moveTo(p.tl.x, p.tl.y); ctx.lineTo(p.tr.x, p.tr.y);
    ctx.stroke();
  }
  var ROUND_CUT_N = 8;
  function gemOutlineRound(s) {
    var pts = [];
    for (var i = 0; i < ROUND_CUT_N; i++) {
      var a = -Math.PI / 2 + i * (2 * Math.PI / ROUND_CUT_N);
      pts.push({ x: s * Math.cos(a), y: s * 0.98 * Math.sin(a) });
    }
    ctx.beginPath();
    pts.forEach(function (pt, i) { if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y); });
    ctx.closePath();
    return pts;
  }
  function gemFacetsRound(pts) {
    ctx.beginPath();
    pts.forEach(function (pt) { ctx.moveTo(0, 0); ctx.lineTo(pt.x, pt.y); });
    ctx.stroke();
    ctx.beginPath();
    pts.forEach(function (pt, i) {
      var ip = { x: pt.x * 0.42, y: pt.y * 0.42 };
      if (i === 0) ctx.moveTo(ip.x, ip.y); else ctx.lineTo(ip.x, ip.y);
    });
    ctx.closePath(); ctx.stroke();
  }
  function gemOutlineKite(s) {
    var p = { top: { x: 0, y: -1.05 * s }, right: { x: 0.6 * s, y: -0.05 * s }, bottom: { x: 0, y: 0.95 * s }, left: { x: -0.6 * s, y: -0.05 * s } };
    ctx.beginPath();
    ctx.moveTo(p.top.x, p.top.y); ctx.lineTo(p.right.x, p.right.y);
    ctx.lineTo(p.bottom.x, p.bottom.y); ctx.lineTo(p.left.x, p.left.y); ctx.closePath();
    return p;
  }
  function gemFacetsKite(p) {
    ctx.beginPath();
    ctx.moveTo(p.top.x, p.top.y); ctx.lineTo(p.bottom.x, p.bottom.y);
    ctx.moveTo(p.left.x, p.left.y); ctx.lineTo(p.right.x, p.right.y);
    ctx.moveTo(p.left.x, p.left.y); ctx.lineTo(p.top.x, p.top.y);
    ctx.moveTo(p.right.x, p.right.y); ctx.lineTo(p.top.x, p.top.y);
    ctx.moveTo(p.left.x, p.left.y); ctx.lineTo(p.bottom.x, p.bottom.y);
    ctx.moveTo(p.right.x, p.right.y); ctx.lineTo(p.bottom.x, p.bottom.y);
    ctx.stroke();
  }
  // keyId "A" = emerald cut, "B" = round brilliant, "C" = princess (kite) cut;
  // anything else falls back to the emerald cut.
  function gemOutlineFor(keyId, s) {
    if (keyId === "B") return { pts: gemOutlineRound(s), facets: gemFacetsRound, topY: -s, botY: s };
    if (keyId === "C") { var p = gemOutlineKite(s); return { pts: p, facets: gemFacetsKite, topY: p.top.y, botY: p.bottom.y }; }
    var pe = gemOutlineEmerald(s); return { pts: pe, facets: gemFacetsEmerald, topY: pe.tl.y, botY: pe.bp.y };
  }
  function drawSparkle(cx, cy, r) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 0.3, cy - r * 0.3); ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx + r * 0.3, cy + r * 0.3); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r * 0.3, cy + r * 0.3);
    ctx.lineTo(cx - r, cy); ctx.lineTo(cx - r * 0.3, cy - r * 0.3);
    ctx.closePath(); ctx.fill();
  }
  function drawGemGlyph(x, y, s, tint, keyId) {
    ctx.save();
    ctx.translate(x, y);
    var cut = gemOutlineFor(keyId, s);
    var grad = ctx.createLinearGradient(0, cut.topY, 0, cut.botY);
    grad.addColorStop(0, "rgba(255,255,255,0.98)");
    grad.addColorStop(0.42, tint || "rgba(255,255,255,0.85)");
    grad.addColorStop(1, "rgba(8,10,18,0.65)");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = "rgba(6,8,14,0.65)"; ctx.lineWidth = Math.max(1, s * 0.07);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = Math.max(0.7, s * 0.045);
    cut.facets(cut.pts);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    drawSparkle(-0.2 * s, -0.42 * s, s * 0.2);
    // Epic ("shine") and legendary ("animated") skins get a second, softly
    // pulsing glint — the flashiest look stays reserved for the priciest
    // tiers instead of showing up on every tile.
    if (activeSkinSpecial === "shine" || activeSkinSpecial === "animated") {
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(performance.now() / 500);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      drawSparkle(0.38 * s, 0.08 * s, s * 0.13);
      ctx.restore();
    }
    if (activeSkinSpecial === "animated") {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = tint || "#ffffff";
      ctx.lineWidth = Math.max(1, s * 0.05);
      gemOutlineFor(keyId, s);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  function drawGemOutline(x, y, s, color, keyId) {
    ctx.save();
    ctx.translate(x, y);
    gemOutlineFor(keyId, s);
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, s * 0.12);
    ctx.stroke();
    ctx.restore();
  }

  function drawSpecialCellBadge(x, y, r, cellType) {
    var ring = null;
    if (cellType === "teleportA" || cellType === "teleportB") ring = { color: "#B47CFF", dash: [3, 3] };
    else if (cellType === "ice") ring = { color: "rgba(170,225,255,0.85)", dash: null };
    else if (L.taggedDir(cellType, "oneway:") !== null) ring = { color: "#FF6F91", dash: [2, 3] };
    else if (L.taggedDir(cellType, "conveyor:") !== null) ring = { color: "#6FCF73", dash: null };
    if (!ring) return;
    ctx.save();
    ctx.strokeStyle = ring.color; ctx.lineWidth = 2;
    if (ring.dash) ctx.setLineDash(ring.dash);
    ctx.beginPath(); ctx.arc(x, y, r * 1.14, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function drawTileAt(key, ts, litSet) {
    var tile = game.tiles[key];
    if (!tile) return;
    var pos = tilePixel(key, ts);
    var r = game.layout.size * 0.86;
    if (tile.isPipe) drawPipeTile(pos.x, pos.y, r, tile, key, litSet);
    else drawColorTile(pos.x, pos.y, r, tile, key);
  }

  function computeLitPipes() {
    var goal = game.def.goal;
    var source = goal.source, target = goal.target;
    var lit = new Set();
    if (!source) return lit;
    var visited = new Set([source]);
    var queue = [source];
    while (queue.length) {
      var cur = queue.shift();
      var curPos = L.parseKey(cur);
      for (var d = 0; d < 6; d++) {
        var nd = L.DIRS[d];
        var nk = L.key(curPos.q + nd.q, curPos.r + nd.r);
        var curIsSource = cur === source;
        var curTile = game.tiles[cur];
        var curOpen = curIsSource || (curTile && curTile.isPipe && L.hasOpenDir(curTile, d));
        if (!curOpen) continue;
        if (nk === target) { lit.add(cur); continue; }
        if (visited.has(nk)) continue;
        var nextTile = game.tiles[nk];
        if (!nextTile || !nextTile.isPipe) continue;
        if (!L.hasOpenDir(nextTile, L.opposite(d))) continue;
        visited.add(nk); lit.add(nk); lit.add(cur);
        queue.push(nk);
      }
    }
    return lit;
  }

  function drawDeliveryTarget(x, y, r, satisfied, color, keyId) {
    ctx.save();
    if (satisfied) {
      ctx.globalAlpha = 1; ctx.strokeStyle = color; ctx.lineWidth = 3;
      if (color) { ctx.shadowColor = color; ctx.shadowBlur = 12; }
      ctx.beginPath(); ctx.arc(x, y, r * 1.2, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(performance.now() / 300);
      ctx.strokeStyle = color; ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.arc(x, y, r * 1.2, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.85;
      drawGemOutline(x, y, r * 0.4, color, keyId);
    }
    ctx.restore();
  }

  function draw(ts) {
    var layout = game.layout;
    ctx.clearRect(0, 0, layout.w, layout.h);
    game.anims = game.anims.filter(function (a) { return (ts - a.start) < a.duration; });

    Object.keys(game.board).forEach(function (k) {
      var p = L.parseKey(k);
      var px = axialToPixel(p.q, p.r);
      drawCell(px.x, px.y, game.board[k]);
    });

    var litSet = (game.def.goal.type === "path" || game.def.goal.type === "combo") ? computeLitPipes() : null;

    game.highlights.forEach(function (h) {
      var p = L.parseKey(h.key);
      var px = axialToPixel(p.q, p.r);
      drawHighlight(px.x, px.y, h.isTeleport);
    });

    Object.keys(game.tiles).forEach(function (k) {
      if (k !== game.selected) drawTileAt(k, ts, litSet);
    });
    if (game.selected && game.tiles[game.selected]) drawTileAt(game.selected, ts, litSet);

    // Delivery targets are drawn last so the objective is always legible,
    // whether or not the right key has arrived yet.
    game.deliveries.forEach(function (d) {
      var p = L.parseKey(d.target);
      var px = axialToPixel(p.q, p.r);
      var tile = game.tiles[d.target];
      var satisfied = !!(tile && tile.isKey && tile.keyId === d.keyId);
      var r = game.layout.size * 0.86;
      drawDeliveryTarget(px.x, px.y, r, satisfied, COLOR_HEX["key" + d.keyId] || "#fff", d.keyId);
      // A one-way gate on the finish cell is a hard requirement (only
      // reachable from one direction) that must stay legible even once a gem
      // is sitting there and would otherwise fully cover its arrow glyph.
      var onewayDir = L.taggedDir(game.board[d.target], "oneway:");
      if (onewayDir !== null) drawArrowGlyph(px.x, px.y, r, EDGE_ANGLE(onewayDir), "#FF6F91", 1);
    });

    // Blocked/teleported flashes go on top of everything else so they're
    // never hidden behind a tile or target ring.
    game.blockedFlashes = game.blockedFlashes.filter(function (f) { return (ts - f.start) < f.duration; });
    game.blockedFlashes.forEach(function (f) {
      var p = L.parseKey(f.key);
      var px = axialToPixel(p.q, p.r);
      drawBlockedFlash(px.x, px.y, game.layout.size * 0.92, (ts - f.start) / f.duration);
    });
    game.teleportFlashes = game.teleportFlashes.filter(function (f) { return (ts - f.start) < f.duration; });
    game.teleportFlashes.forEach(function (f) {
      var p = L.parseKey(f.key);
      var px = axialToPixel(p.q, p.r);
      drawTeleportFlash(px.x, px.y, game.layout.size * 0.92, (ts - f.start) / f.duration);
    });
  }

  function renderLoop(ts) {
    if (!game) return;
    draw(ts);
    requestAnimationFrame(renderLoop);
  }

  document.getElementById("btnBack").addEventListener("click", backToSelect);
  document.getElementById("btnReset").addEventListener("click", resetLevel);
  document.getElementById("btnUndo").addEventListener("click", undo);
  document.getElementById("btnReplay").addEventListener("click", function () { winModal.hidden = true; resetLevel(); });
  document.getElementById("btnNext").addEventListener("click", function () {
    winModal.hidden = true;
    var nextId = game.def.id + 1;
    if (nextId <= LEVELS.length && isUnlocked(nextId)) startLevel(nextId); else backToSelect();
  });
  window.addEventListener("resize", function () { if (game) computeLayout(); });

  document.getElementById("btnShop").addEventListener("click", function () { renderShop(); shopModal.hidden = false; });
  document.getElementById("btnShopClose").addEventListener("click", function () { shopModal.hidden = true; });

  function boot(data) {
    applySkin(getMeta().activeSkin);
    renderLevelSelect();
    if (window.HexaboxAds) window.HexaboxAds.init();
    if (data && data.levelId && isUnlocked(data.levelId)) startLevel(data.levelId);
    else if (window.HexaboxAds) window.HexaboxAds.showBannerOnSelect();
  }
  if (window.claude && window.claude.hot && window.claude.hot.snapshot) {
    window.claude.hot.snapshot(function () { return { levelId: game ? game.def.id : null }; });
  }
  if (window.claude && window.claude.hot && window.claude.hot.ready) {
    window.claude.hot.ready(boot);
  } else {
    boot((window.claude && window.claude.hot && window.claude.hot.data) || {});
  }
})();
