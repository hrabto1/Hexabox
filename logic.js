// Hexabox core puzzle logic — pure, no DOM/Canvas. Shared by the game (browser)
// and the level generator (Node). Attaches to `window.HexLogic` in a browser,
// exports via module.exports under Node.
(function (root) {
  "use strict";

  // Axial directions (pointy-top hexes), index 0..5.
  // Angles on screen (y-down): 0=E(0°) 1=NE(-60°) 2=NW(-120°) 3=W(180°) 4=SW(120°) 5=SE(60°)
  var DIRS = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 }
  ];
  // Walking clockwise on screen starting from East.
  var CW_ORDER = [0, 5, 4, 3, 2, 1];
  // NEXT_CW[d] = direction index reached after rotating d by one clockwise step.
  var NEXT_CW = [5, 0, 1, 2, 3, 4];

  function key(q, r) { return q + "," + r; }
  function parseKey(k) {
    var parts = k.split(",");
    return { q: parseInt(parts[0], 10), r: parseInt(parts[1], 10) };
  }
  function opposite(d) { return (d + 3) % 6; }
  function rotateDirN(d, n) {
    var x = d;
    n = ((n % 6) + 6) % 6;
    for (var i = 0; i < n; i++) x = NEXT_CW[x];
    return x;
  }
  function pipeMaskFromDirs(dirs) {
    var m = 0;
    for (var i = 0; i < dirs.length; i++) m |= (1 << dirs[i]);
    return m;
  }
  function effectiveOpenDirs(tile) {
    var res = [];
    var rot = tile.rotation || 0;
    for (var d = 0; d < 6; d++) {
      if (tile.pipeMask & (1 << d)) res.push(rotateDirN(d, rot));
    }
    return res;
  }
  function hasOpenDir(tile, d) {
    return effectiveOpenDirs(tile).indexOf(d) !== -1;
  }

  function hexagonArea(radius) {
    var cells = [];
    for (var q = -radius; q <= radius; q++) {
      var r1 = Math.max(-radius, -q - radius);
      var r2 = Math.min(radius, -q + radius);
      for (var r = r1; r <= r2; r++) cells.push({ q: q, r: r });
    }
    return cells;
  }

  function cellIsHoldable(board, k) {
    var t = board[k];
    return !!t && t !== "wall" && t !== "rotator" && t !== "source" && t !== "target";
  }

  // Tagged cell types carry a direction suffix, e.g. "oneway:3" or "conveyor:0".
  function taggedDir(type, prefix) {
    if (type && type.indexOf(prefix) === 0) return parseInt(type.slice(prefix.length), 10);
    return null;
  }

  function cloneTiles(tiles) {
    var out = {};
    for (var k in tiles) {
      if (!Object.prototype.hasOwnProperty.call(tiles, k)) continue;
      var t = tiles[k];
      out[k] = {
        color: t.color,
        fixed: !!t.fixed,
        isPipe: !!t.isPipe,
        pipeMask: t.pipeMask || 0,
        rotation: t.rotation || 0,
        isKey: !!t.isKey,
        keyId: t.keyId || null
      };
    }
    return out;
  }

  function cloneState(state) {
    return { board: state.board, teleportPairs: state.teleportPairs, tiles: cloneTiles(state.tiles) };
  }

  // Returns { dest, blocked } for a tile at fromKey sliding in direction
  // dirIdx. dest is the resulting cell (or null if the direction has no
  // legal move at all — the adjacent cell is a wall/occupied/wrong-way
  // gate). blocked is set when a chained redirect (conveyor, or the
  // teleport hop at the end) WANTED to continue somewhere but couldn't —
  // the key it names is the cell that stopped it, purely so the UI can
  // explain an otherwise-silent short stop (e.g. "you landed on the belt
  // instead of being carried all the way" or "you landed on the portal but
  // didn't teleport"). It plays no role in move legality.
  function computeSlideOutcome(state, fromKey, dirIdx) {
    var pos = parseKey(fromKey);
    var d = DIRS[dirIdx];
    var cq = pos.q + d.q, cr = pos.r + d.r, k = key(cq, cr);
    if (!cellIsHoldable(state.board, k) || state.tiles[k]) return { dest: null, blocked: null };
    var type = state.board[k];
    var oneway = taggedDir(type, "oneway:");
    if (oneway !== null && oneway !== dirIdx) return { dest: null, blocked: null };
    var guard = 0;
    var blocked = null;
    while (guard < 64) {
      guard++;
      var stepDir = null;
      if (type === "ice") stepDir = dirIdx;
      else {
        var cdir = taggedDir(type, "conveyor:");
        if (cdir !== null) stepDir = cdir;
      }
      if (stepDir === null) break;
      var sd = DIRS[stepDir];
      var nq = cq + sd.q, nr = cr + sd.r, nk = key(nq, nr);
      if (!cellIsHoldable(state.board, nk) || state.tiles[nk]) { blocked = nk; break; }
      var nType = state.board[nk];
      var nOneway = taggedDir(nType, "oneway:");
      if (nOneway !== null && nOneway !== stepDir) { blocked = nk; break; }
      cq = nq; cr = nr; k = nk; type = nType;
    }
    return { dest: k, blocked: blocked };
  }

  function computeSlideDestinationKey(state, fromKey, dirIdx) {
    return computeSlideOutcome(state, fromKey, dirIdx).dest;
  }

  // Returns { dest, blocked } for an attempted teleport hop FROM A TILE
  // ALREADY SITTING on a teleport cell. Unlike a slide, this isn't triggered
  // by motion toward the portal — arriving at a teleport cell always stops
  // there first (computeSlideOutcome never hops), and the hop itself is this
  // separate, explicit move. dest is the paired cell when it's free; blocked
  // names it when it exists but is occupied, so the UI can explain why
  // nothing happened instead of the tap silently doing nothing.
  function computeTeleportOutcome(state, fromKey) {
    var type = state.board[fromKey];
    if (type !== "teleportA" && type !== "teleportB") return null;
    var pairK = state.teleportPairs[fromKey];
    if (!pairK) return null;
    if (cellIsHoldable(state.board, pairK) && !state.tiles[pairK]) return { dest: pairK, blocked: null };
    return { dest: null, blocked: pairK };
  }

  function applyTeleport(state, fromKey) {
    var tile = state.tiles[fromKey];
    if (!tile || tile.fixed) return null;
    var outcome = computeTeleportOutcome(state, fromKey);
    if (!outcome || !outcome.dest) return null;
    var next = cloneState(state);
    delete next.tiles[fromKey];
    next.tiles[outcome.dest] = tile;
    return next;
  }

  function applySlide(state, fromKey, dirIdx) {
    var tile = state.tiles[fromKey];
    if (!tile || tile.fixed) return null;
    var dest = computeSlideDestinationKey(state, fromKey, dirIdx);
    if (!dest || dest === fromKey) return null;
    var next = cloneState(state);
    delete next.tiles[fromKey];
    next.tiles[dest] = tile;
    return next;
  }

  function applyHubRotate(state, hubKey) {
    var hub = parseKey(hubKey);
    var neighborKeys = CW_ORDER.map(function (dirIdx) {
      var d = DIRS[dirIdx];
      return key(hub.q + d.q, hub.r + d.r);
    });
    for (var i = 0; i < 6; i++) {
      if (!cellIsHoldable(state.board, neighborKeys[i])) return null; // malformed hub, refuse
    }
    var contents = neighborKeys.map(function (k) { return state.tiles[k] || null; });
    var next = cloneState(state);
    for (var p = 0; p < 6; p++) delete next.tiles[neighborKeys[p]];
    for (var p2 = 0; p2 < 6; p2++) {
      var src = contents[(p2 - 1 + 6) % 6];
      if (src) next.tiles[neighborKeys[p2]] = src;
    }
    return next;
  }

  function applyPipeRotate(state, k) {
    var tile = state.tiles[k];
    if (!tile || !tile.isPipe || tile.fixed) return null;
    var next = cloneState(state);
    next.tiles[k].rotation = ((tile.rotation || 0) + 1) % 6;
    return next;
  }

  function applyMove(state, move) {
    if (move.type === "slide") return applySlide(state, move.from, move.dir);
    if (move.type === "hub") return applyHubRotate(state, move.key);
    if (move.type === "pipeRotate") return applyPipeRotate(state, move.key);
    if (move.type === "teleport") return applyTeleport(state, move.from);
    return null;
  }

  function enumerateMoves(state) {
    var moves = [];
    for (var k in state.tiles) {
      if (!Object.prototype.hasOwnProperty.call(state.tiles, k)) continue;
      var tile = state.tiles[k];
      if (tile.fixed) continue;
      if (tile.isPipe) moves.push({ type: "pipeRotate", key: k });
      for (var d = 0; d < 6; d++) {
        var dest = computeSlideDestinationKey(state, k, d);
        if (dest && dest !== k) moves.push({ type: "slide", from: k, dir: d, to: dest });
      }
      var teleOutcome = computeTeleportOutcome(state, k);
      if (teleOutcome && teleOutcome.dest) moves.push({ type: "teleport", from: k, to: teleOutcome.dest });
    }
    for (var bk in state.board) {
      if (!Object.prototype.hasOwnProperty.call(state.board, bk)) continue;
      if (state.board[bk] === "rotator") moves.push({ type: "hub", key: bk });
    }
    return moves;
  }

  // A delivery is satisfied when the tile with the given keyId sits on the
  // target cell — the target is always drawn on the board, so the objective
  // never depends on an invisible/abstract matching rule.
  function checkDeliverGoal(state, deliveries) {
    for (var i = 0; i < deliveries.length; i++) {
      var dlv = deliveries[i];
      var tile = state.tiles[dlv.target];
      if (!tile || !tile.isKey || tile.keyId !== dlv.keyId) return false;
    }
    return true;
  }

  function checkPathGoal(state, sourceKey, targetKey) {
    var visited = {};
    visited[sourceKey] = true;
    var queue = [sourceKey];
    while (queue.length) {
      var cur = queue.shift();
      var pos = parseKey(cur);
      for (var d = 0; d < 6; d++) {
        var nd = DIRS[d];
        var nk = key(pos.q + nd.q, pos.r + nd.r);
        var curIsSource = cur === sourceKey;
        var curTile = state.tiles[cur];
        var curOpen = curIsSource || (curTile && curTile.isPipe && hasOpenDir(curTile, d));
        if (nk === targetKey) {
          if (curOpen) return true;
          continue;
        }
        if (!curOpen || visited[nk]) continue;
        var nextTile = state.tiles[nk];
        if (!nextTile || !nextTile.isPipe) continue;
        if (!hasOpenDir(nextTile, opposite(d))) continue;
        visited[nk] = true;
        queue.push(nk);
      }
    }
    return false;
  }

  function checkGoal(state, goal) {
    if (goal.type === "deliver") return checkDeliverGoal(state, goal.deliveries);
    if (goal.type === "path") return checkPathGoal(state, goal.source, goal.target);
    if (goal.type === "combo") {
      for (var i = 0; i < goal.goals.length; i++) {
        if (!checkGoal(state, goal.goals[i])) return false;
      }
      return true;
    }
    return false;
  }

  // Flattens a (possibly combo) goal into its leaf sub-goals, for UI/legend use.
  function flattenGoals(goal) {
    if (goal.type === "combo") {
      var out = [];
      goal.goals.forEach(function (g) { out = out.concat(flattenGoals(g)); });
      return out;
    }
    return [goal];
  }

  var HexLogic = {
    DIRS: DIRS, CW_ORDER: CW_ORDER, NEXT_CW: NEXT_CW,
    key: key, parseKey: parseKey, opposite: opposite, rotateDirN: rotateDirN,
    pipeMaskFromDirs: pipeMaskFromDirs, effectiveOpenDirs: effectiveOpenDirs, hasOpenDir: hasOpenDir,
    hexagonArea: hexagonArea, cellIsHoldable: cellIsHoldable, taggedDir: taggedDir,
    cloneState: cloneState, cloneTiles: cloneTiles,
    computeSlideDestinationKey: computeSlideDestinationKey, computeSlideOutcome: computeSlideOutcome,
    computeTeleportOutcome: computeTeleportOutcome, applyTeleport: applyTeleport,
    applySlide: applySlide, applyHubRotate: applyHubRotate, applyPipeRotate: applyPipeRotate,
    applyMove: applyMove, enumerateMoves: enumerateMoves,
    checkDeliverGoal: checkDeliverGoal, checkPathGoal: checkPathGoal, checkGoal: checkGoal,
    flattenGoals: flattenGoals
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = HexLogic;
  } else {
    root.HexLogic = HexLogic;
  }
})(typeof window !== "undefined" ? window : this);
