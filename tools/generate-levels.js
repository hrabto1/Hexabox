// Builds levels.js from hand-designed "solved" boards by scrambling each one
// with real, reversible game moves (slide / hub-rotate / pipe-rotate). Because
// every starting position is reached via actually-legal moves from a solved
// state, every generated level is guaranteed solvable.
//
// Goals are never color-based: a "deliver" goal is satisfied when a specific,
// uniquely-colored/glyphed key tile sits on its own target cell — and that
// target cell is always drawn on the board (see app.js), so the objective is
// never hidden from the player. A "path" goal connects a glowing source to a
// glowing target through pipes. "combo" ANDs several such goals together.
"use strict";
var fs = require("fs");
var path = require("path");
var L = require(path.join(__dirname, "..", "logic.js"));

function mulberry32(seed) {
  var t = seed >>> 0;
  return function () {
    t |= 0; t = (t + 0x6D2B79F5) | 0;
    var x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }

function boardFromCells(cells, overrides) {
  var board = {};
  cells.forEach(function (c) { board[L.key(c.q, c.r)] = "normal"; });
  Object.keys(overrides || {}).forEach(function (k) { board[k] = overrides[k]; });
  return board;
}
function teleportPairsOf(pairs) {
  var out = {};
  pairs.forEach(function (p) { out[p[0]] = p[1]; out[p[1]] = p[0]; });
  return out;
}
function mergeBoards() {
  var out = {};
  for (var i = 0; i < arguments.length; i++) {
    var b = arguments[i];
    Object.keys(b).forEach(function (k) { out[k] = b[k]; });
  }
  return out;
}
function mergeTiles() {
  var out = {};
  for (var i = 0; i < arguments.length; i++) {
    var t = arguments[i];
    Object.keys(t).forEach(function (k) { out[k] = t[k]; });
  }
  return out;
}
function shiftCells(cells, dq, dr) { return cells.map(function (c) { return { q: c.q + dq, r: c.r + dr }; }); }
function shiftKey(k, dq, dr) { var p = L.parseKey(k); return L.key(p.q + dq, p.r + dr); }
// Pure-vertical shift (no horizontal drift): for pointy-top axial hexes,
// (dq,dr) = (-k, 2k) moves straight down by 3k hex-heights with zero x
// change. Used to stack separated regions (teleport islands, combo halves)
// directly on top of each other instead of side-by-side, so a tall phone
// screen — not a wide one — is what the board actually needs to fit, and
// each region can render noticeably bigger.
function shiftCellsDown(cells, k) { return shiftCells(cells, -k, 2 * k); }
function shiftKeyDown(k, steps) { return shiftKey(k, -steps, 2 * steps); }

function keyTile(id) { return { isKey: true, keyId: id, color: "key" + id }; }
function obstacleTile(fixed) { return { color: "obstacle", fixed: !!fixed }; }

// Fills every cell in `cells` that isn't already assigned in `tiles` and isn't
// in `skip` with a plain (optionally fixed) obstacle tile.
function fillObstacles(tiles, cells, skipKeys, fixedKeys) {
  cells.forEach(function (c) {
    var k = L.key(c.q, c.r);
    if (skipKeys.indexOf(k) !== -1) return;
    if (tiles[k]) return;
    tiles[k] = obstacleTile((fixedKeys || []).indexOf(k) !== -1);
  });
}

function hexDistance(aKey, bKey) {
  var a = L.parseKey(aKey), b = L.parseKey(bKey);
  var dq = b.q - a.q, dr = b.r - a.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

function dirBetween(aKey, bKey) {
  var a = L.parseKey(aKey), b = L.parseKey(bKey);
  var dq = b.q - a.q, dr = b.r - a.r;
  for (var d = 0; d < 6; d++) {
    if (L.DIRS[d].q === dq && L.DIRS[d].r === dr) return d;
  }
  throw new Error("cells not adjacent: " + aKey + " " + bKey);
}
var PIPE_BASE_SHAPES = [[0, 3], [0, 1], [0, 2], [0, 2, 4], [0, 1, 3]];
function findPipeForOpens(requiredDirs) {
  var want = requiredDirs.slice().sort().join(",");
  for (var s = 0; s < PIPE_BASE_SHAPES.length; s++) {
    var base = PIPE_BASE_SHAPES[s];
    if (base.length !== requiredDirs.length) continue;
    for (var rot = 0; rot < 6; rot++) {
      var rotated = base.map(function (d) { return L.rotateDirN(d, rot); }).sort();
      if (rotated.join(",") === want) {
        return { pipeMask: L.pipeMaskFromDirs(base), rotation: rot };
      }
    }
  }
  throw new Error("no pipe shape found for opens " + requiredDirs.join(","));
}
function pipeChainTiles(pathKeys, fixedIndices) {
  // pathKeys = [sourceKey, mid1, mid2, ..., targetKey]
  var tiles = {};
  for (var i = 1; i < pathKeys.length - 1; i++) {
    var prevDir = dirBetween(pathKeys[i], pathKeys[i - 1]);
    var nextDir = dirBetween(pathKeys[i], pathKeys[i + 1]);
    var solved = findPipeForOpens([prevDir, nextDir]);
    tiles[pathKeys[i]] = {
      isPipe: true, pipeMask: solved.pipeMask, rotation: solved.rotation,
      fixed: (fixedIndices || []).indexOf(i) !== -1
    };
  }
  return tiles;
}

function scrambleState(state, steps, seed) {
  var rng = mulberry32(seed);
  var cur = state;
  var lastInverse = null;
  var applied = [];
  for (var i = 0; i < steps; i++) {
    var moves = L.enumerateMoves(cur);
    if (lastInverse) {
      var filtered = moves.filter(function (m) {
        if (lastInverse.type === "teleport") return !(m.type === "teleport" && m.from === lastInverse.from && m.to === lastInverse.to);
        return !(m.type === "slide" && m.from === lastInverse.from && m.dir === lastInverse.dir);
      });
      if (filtered.length) moves = filtered;
    }
    if (!moves.length) break;
    // Bias toward moving keys and pipes — the goal never checks obstacle
    // placement, so unweighted random scrambling mostly wastes steps on
    // obstacles and leaves keys only a move or two from solved.
    var weighted = [];
    moves.forEach(function (m) {
      var weight = 1;
      if (m.type === "teleport") {
        // A teleport hop is only ever available from the handful of tiles
        // already sitting on a portal, so without a strong bias the
        // scrambler almost never crosses clusters and levels end up
        // solvable without ever using the teleport.
        weight = 30;
      } else if (m.type === "slide") {
        var t = cur.tiles[m.from];
        if (t && t.isKey) weight = 6;
        else if (t && t.isPipe) weight = 3;
      } else if (m.type === "hub") weight = 2;
      else if (m.type === "pipeRotate") weight = 3;
      for (var w = 0; w < weight; w++) weighted.push(m);
    });
    var mv = pick(rng, weighted);
    var next = L.applyMove(cur, mv);
    if (!next) continue;
    cur = next;
    applied.push(mv);
    if (mv.type === "slide") lastInverse = { type: "slide", from: mv.to, dir: L.opposite(mv.dir) };
    else if (mv.type === "teleport") lastInverse = { type: "teleport", from: mv.to, to: mv.from };
    else lastInverse = null;
  }
  return { state: cur, moves: applied };
}

function serializeTiles(tiles) {
  return Object.keys(tiles).sort().map(function (k) {
    var t = tiles[k];
    return k + ":" + (t.color || "") + (t.fixed ? "F" : "") + (t.isPipe ? "P" + t.rotation : "") + (t.isKey ? "K" + t.keyId : "");
  }).join("|");
}

// Rigorously proves a scrambled state is solvable by literally undoing the
// exact scramble sequence, verifying each inverse step lands precisely back
// where expected (catches ice/teleport/conveyor/one-way asymmetries that a
// naive "slide opposite" assumption could silently get wrong).
function reverseReplayCheck(solvedState, scrambleResult) {
  var cur = scrambleResult.state;
  var moves = scrambleResult.moves;
  for (var i = moves.length - 1; i >= 0; i--) {
    var mv = moves[i];
    if (mv.type === "hub") {
      for (var h = 0; h < 5; h++) {
        var hn = L.applyHubRotate(cur, mv.key);
        if (!hn) return false;
        cur = hn;
      }
    } else if (mv.type === "pipeRotate") {
      for (var p = 0; p < 5; p++) {
        var pn = L.applyPipeRotate(cur, mv.key);
        if (!pn) return false;
        cur = pn;
      }
    } else if (mv.type === "slide") {
      // mv.to is always geometrically adjacent to mv.from now — a slide can
      // no longer end mid-chain in a teleport hop (that's its own move type,
      // handled below), so the generic opposite-direction undo always applies.
      var dest = L.computeSlideDestinationKey(cur, mv.to, L.opposite(mv.dir));
      if (dest !== mv.from) return false;
      var sn = L.applySlide(cur, mv.to, L.opposite(mv.dir));
      if (!sn) return false;
      cur = sn;
    } else if (mv.type === "teleport") {
      // Teleport pairs are symmetric, so undoing a hop is just another
      // teleport move from the landing cell back to where the tile sat the
      // instant before — mv.to and mv.from aren't adjacent, so this (not a
      // slide) is the only way to reconstruct it.
      var tn = L.applyTeleport(cur, mv.to);
      if (!tn) return false;
      cur = tn;
    } else {
      return false;
    }
  }
  return serializeTiles(cur.tiles) === serializeTiles(solvedState.tiles);
}

// Fallback proof for when reverseReplayCheck can't confirm a scramble: some
// cell types (conveyors especially) are asymmetric — entering one always
// redirects you, but leaving it doesn't, so "undo via the opposite direction"
// can fail even though the puzzle is perfectly solvable some other way. A
// direct forward search from the candidate start is the ground truth.
function bfsSolvable(state, goal, cap) {
  if (L.checkGoal(state, goal)) return { solved: true, depth: 0 };
  function hash(s) { return serializeTiles(s.tiles); }
  var visited = {}; visited[hash(state)] = true;
  var queue = [{ state: state, depth: 0 }];
  var head = 0, visitedCount = 1;
  while (head < queue.length) {
    var cur = queue[head++];
    var moves = L.enumerateMoves(cur.state);
    for (var i = 0; i < moves.length; i++) {
      var next = L.applyMove(cur.state, moves[i]);
      if (!next) continue;
      var h = hash(next);
      if (visited[h]) continue;
      visited[h] = true; visitedCount++;
      if (L.checkGoal(next, goal)) return { solved: true, depth: cur.depth + 1 };
      queue.push({ state: next, depth: cur.depth + 1 });
      if (visitedCount > cap) return { solved: false };
    }
  }
  return { solved: false };
}

// Strips a cell type's special behavior — used to ask "could you still solve
// this WITHOUT the mechanic?" by neutralizing it and re-searching. Movement
// mechanics (teleport/ice/oneway/conveyor) are already holdable cells, so
// they become ordinary stop-here cells (no hop/chain/redirect/restriction).
// The hub is different: it's a non-holdable cell, so turning it into "normal"
// would conjure a brand-new empty tile-holding slot out of thin air — a
// strictly easier board than "no hub", not an equivalent one. It neutralizes
// to "wall" instead: still non-holdable, just inert.
function neutralizeBoard(board, prefixes) {
  var out = {};
  Object.keys(board).forEach(function (k) {
    var type = board[k];
    var bare = type.split(":")[0];
    if (prefixes.indexOf(bare) === -1) { out[k] = type; return; }
    out[k] = bare === "rotator" ? "wall" : "normal";
  });
  return out;
}
// Returns true only when we have POSITIVE PROOF a solution exists without the
// named mechanic (search capped out => inconclusive => treated as "can't
// prove it's skippable", i.e. kept). This is deliberately the generous
// direction: a level only gets rejected when we're sure the mechanic wasn't
// actually needed, never on a budget technicality.
function solvableWithoutMechanic(state, goal, prefixes, cap) {
  var neutralBoard = neutralizeBoard(state.board, prefixes);
  var neutralState = { board: neutralBoard, teleportPairs: state.teleportPairs, tiles: state.tiles };
  if (goal.type === "path" || (goal.type === "combo" && goal.goals.some(function (g) { return g.type === "path"; }))) {
    var pathGoal = goal.type === "path" ? goal : goal.goals.filter(function (g) { return g.type === "path"; })[0];
    var exact = exactPurePipePar(neutralState, pathGoal);
    if (exact !== null) {
      if (goal.type === "path") return true;
      var otherSubs = goal.goals.filter(function (g) { return g.type !== "path"; });
      return bfsSolvable(neutralState, { type: "combo", goals: otherSubs }, cap).solved;
    }
  }
  return bfsSolvable(neutralState, goal, cap).solved;
}

// Exact (not capped-search) minimal tap count for a pure pipe-rotation goal:
// enumerates every rotation combination directly rather than graph-BFS-ing
// the move space, which is dramatically cheaper when there are no empty
// cells (so sliding is impossible and only pipe rotations matter) — a generic
// BFS can cap out on these (6^9 states) long before finding the truth, which
// would otherwise leave an absurdly inflated "worst case" par on the level.
// Returns null (meaning: use the generic path instead) when the board has any
// empty holdable cell, since then sliding is also part of the real solution.
function exactPurePipePar(state, goal) {
  for (var k in state.board) {
    if (!L.cellIsHoldable(state.board, k)) continue;
    if (!state.tiles[k]) return null; // an empty cell exists — sliding may matter, bail
  }
  var pipeKeys = Object.keys(state.tiles).filter(function (k) { return state.tiles[k].isPipe; });
  var movable = pipeKeys.filter(function (k) { return !state.tiles[k].fixed; });
  if (movable.length > 11) return null; // too many combinations to brute force here
  var total = Math.pow(6, movable.length);
  var best = null;
  for (var combo = 0; combo < total; combo++) {
    var tiles = {};
    pipeKeys.forEach(function (k) { tiles[k] = { isPipe: true, pipeMask: state.tiles[k].pipeMask, rotation: state.tiles[k].rotation, fixed: state.tiles[k].fixed }; });
    var x = combo, taps = 0;
    for (var i = 0; i < movable.length; i++) {
      var r = x % 6; x = Math.floor(x / 6);
      taps += (r - state.tiles[movable[i]].rotation + 6) % 6;
      tiles[movable[i]].rotation = r;
    }
    var candidate = { board: state.board, teleportPairs: state.teleportPairs, tiles: tiles };
    if (L.checkGoal(candidate, goal) && (best === null || taps < best)) best = taps;
  }
  return best;
}

function tightenPar(state, goal, fallbackCap) {
  if (goal.type === "path") {
    var exact = exactPurePipePar(state, goal);
    if (exact !== null) return exact;
  } else if (goal.type === "combo") {
    var pathSub = goal.goals.filter(function (g) { return g.type === "path"; })[0];
    var otherSubs = goal.goals.filter(function (g) { return g.type !== "path"; });
    if (pathSub && otherSubs.length) {
      var pathPar = exactPurePipePar(state, pathSub);
      if (pathPar !== null) {
        var rest = bfsSolvable(state, { type: "combo", goals: otherSubs }, fallbackCap);
        if (rest.solved) return pathPar + rest.depth;
      }
    }
  }
  var generic = bfsSolvable(state, goal, fallbackCap);
  return generic.solved ? generic.depth : null;
}

function finalizeLevel(spec) {
  var baseState = { board: spec.board, teleportPairs: spec.teleportPairs || {}, tiles: spec.solvedTiles };
  var scrambled = null;
  // For a large procedurally-generated batch we can't hand-verify every board
  // can actually sustain a given target difficulty, so degrade the minPar bar
  // gracefully (rather than throwing) if it proves unreachable after a lot of
  // tries — a slightly-easier-than-requested level beats a crashed batch.
  var wantMinPar = spec.minPar || 0;
  var wantMinDist = spec.minKeyDistance || 0;
  var deliveries = L.flattenGoals(spec.goal).filter(function (g) { return g.type === "deliver"; })
    .reduce(function (acc, g) { return acc.concat(g.deliveries); }, []);
  // The geometric "start far away" requirement is held at FULL strength across
  // every par-floor attempt first (distFloor only drops on a later outer pass)
  // — degrading it in lockstep with the move-count floor let a handful of
  // levels settle for the key starting right next to its target, which is
  // exactly the "too easy" bug this whole check exists to prevent.
  for (var distFloor = wantMinDist; distFloor >= 0 && !scrambled; distFloor--) {
    // Step the degrade-floor by 1 and keep a real attempt budget — with 100
    // levels to generate, a cheap-first strategy matters: reverseReplayCheck is
    // O(scrambleSteps) and handles the vast majority of attempts, so only pay
    // for a (capped) BFS once we already have a proven, accepted candidate in
    // hand, to refine its par — never as a precondition for every attempt.
    for (var floor = wantMinPar; floor >= 0 && !scrambled; floor -= 1) {
      for (var attempt = 0; attempt < 300 && !scrambled; attempt++) {
        var result = scrambleState(baseState, spec.scrambleSteps, spec.seed + attempt * 97 + floor * 100003 + distFloor * 10000019);
        if (L.checkGoal(result.state, spec.goal)) continue; // too easy, already solved
        // For a combo goal, ALSO reject if any individual sub-goal already sits
        // solved (e.g. the key already on its target while only the pipe half
        // is scrambled) — the player should never find part of the puzzle
        // "already done" for them.
        if (spec.goal.type === "combo" && L.flattenGoals(spec.goal).some(function (g) { return L.checkGoal(result.state, g); })) continue;
        // A short move-count alone doesn't guarantee the key actually starts
        // far away — scrambling can wander and net out close by. Require real
        // geometric separation too, so "place the gem far from the target" is
        // an actual, checked property, not a side-effect we hope for.
        if (deliveries.length) {
          var tooClose = deliveries.some(function (d) {
            var curKey = Object.keys(result.state.tiles).filter(function (k) {
              var t = result.state.tiles[k]; return t.isKey && t.keyId === d.keyId;
            })[0];
            return !curKey || hexDistance(curKey, d.target) < distFloor;
          });
          if (tooClose) continue;
        }
        var worstCase = result.moves.reduce(function (sum, m) { return sum + (m.type === "slide" ? 1 : 5); }, 0);
        var bestPar, proven;
        if (reverseReplayCheck(baseState, result)) {
          proven = true;
          bestPar = worstCase; // cheap, always a valid (if loose) upper bound
        } else {
          // reverseReplayCheck can't confirm this one (conveyor-style asymmetry)
          // — fall back to a real search, since it's our only remaining proof.
          var found = tightenPar(result.state, spec.goal, 150000);
          if (found === null) continue;
          proven = true;
          bestPar = found;
        }
        if (!proven || bestPar < floor) continue; // too easy for this slot, reroll
        // A level that teaches a mechanic must actually require it — not just
        // make it available. This is the single most expensive check (another
        // full search), so it runs dead last, only once a candidate has
        // already cleared every cheaper gate: neutralize the signature
        // mechanic(s) and see whether the puzzle is still solvable without
        // them; if it is, this scramble didn't put the mechanic on the
        // critical path, so reroll rather than ship it as decoration.
        if (spec.requiredMechanics && solvableWithoutMechanic(result.state, spec.goal, spec.requiredMechanics, 60000)) continue;
        scrambled = result.state;
        spec.scrambleSteps = bestPar;
      }
    }
    if (!wantMinDist) break; // no distance requirement at all — one pass only
  }
  // We now have a PROVEN, ACCEPTED level — spend one bounded search to find
  // its true shortest solution (usually much less than the worst-case bound
  // above), so star thresholds reflect reality instead of a loose estimate.
  if (scrambled) {
    var tightened = tightenPar(scrambled, spec.goal, 200000);
    // If even the tightening search can't finish, the worst-case estimate
    // already baked into spec.scrambleSteps can be wildly inflated (a handful
    // of rotate/hub scramble taps costs up to 5x to reverse) — clamp it to a
    // sane display ceiling rather than ship a "par 56".
    spec.scrambleSteps = tightened !== null ? tightened : Math.min(spec.scrambleSteps, 24);
  }
  if (!scrambled) throw new Error("level " + spec.id + " failed to scramble into a verifiably solvable state");
  return {
    id: spec.id,
    title: spec.title,
    subtitle: spec.subtitle,
    mechanics: spec.mechanics,
    board: spec.board,
    teleportPairs: spec.teleportPairs || {},
    tiles: scrambled.tiles,
    goal: spec.goal,
    par: spec.scrambleSteps
  };
}

var levels = [];

// ===================== Procedural 100-level campaign =====================
// Hand-placing 100 bespoke boards isn't practical, so levels are built from a
// pool of mechanic "templates" parametrized by a 0..9 difficulty tier
// (10 levels per tier). Regardless of how a board was assembled, every level
// still goes through the exact same finalizeLevel() proof pipeline above, so
// "procedurally generated" never means "unverified".

var nameCounters = {};
function titleFor(base) {
  nameCounters[base] = (nameCounters[base] || 0) + 1;
  var n = nameCounters[base];
  if (n === 1) return base;
  var romans = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
  return base + " " + (romans[n - 1] || n);
}
function tierOf(index) { return Math.min(9, Math.floor((index - 1) / 10)); }
function parForTier(tier) { return Math.round(2 + tier * 1.8); }
// Minimum straight-line hex distance a key must start from its own target —
// a real, geometric guarantee that "dál od cíle" actually holds, independent
// of however the move-count par turns out.
function minDistForTier(tier) { return Math.min(2 + Math.floor(tier / 2), tier <= 7 ? 4 : 5); }
function scrambleBudget(p) { return Math.max(p * 3 + 8, 14); }
function regionRadius(tier) { return tier <= 1 ? 1 : (tier <= 7 ? 2 : 3); }
function randomSubset(rng, arr, count) {
  var pool = arr.slice();
  var out = [];
  count = Math.min(count, pool.length);
  while (out.length < count) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}

function tmplSlide(tier, seed) {
  var radius = regionRadius(tier);
  var cells = L.hexagonArea(radius);
  var rng = mulberry32(seed);
  var keys = cells.map(function (c) { return L.key(c.q, c.r); });
  var targetKey = pick(rng, keys);
  var empties = randomSubset(rng, keys.filter(function (k) { return k !== targetKey; }), radius <= 1 ? 1 : 2);
  var board = boardFromCells(cells, {});
  var tiles = {}; tiles[targetKey] = keyTile("A");
  fillObstacles(tiles, cells, empties.concat([targetKey]), []);
  var par = parForTier(tier);
  return {
    title: titleFor("Posun"), subtitle: "Doveď drahokam na zářící cíl.",
    mechanics: ["posun", "doručení"], board: board, solvedTiles: tiles,
    goal: { type: "deliver", deliveries: [{ keyId: "A", target: targetKey }] },
    scrambleSteps: scrambleBudget(par), minPar: par, minKeyDistance: minDistForTier(tier), seed: seed
  };
}

function tmplWalls(tier, seed) {
  var radius = Math.max(regionRadius(tier), 2);
  var cells = L.hexagonArea(radius);
  var rng = mulberry32(seed);
  var keys = cells.map(function (c) { return L.key(c.q, c.r); });
  var walls = randomSubset(rng, keys, 2 + Math.floor(tier / 3));
  var remaining = keys.filter(function (k) { return walls.indexOf(k) === -1; });
  var targetKey = pick(rng, remaining);
  remaining = remaining.filter(function (k) { return k !== targetKey; });
  var empties = randomSubset(rng, remaining, 2);
  var overrides = {}; walls.forEach(function (k) { overrides[k] = "wall"; });
  var board = boardFromCells(cells, overrides);
  var tiles = {}; tiles[targetKey] = keyTile("A");
  fillObstacles(tiles, cells, walls.concat(empties, [targetKey]), []);
  var par = parForTier(tier);
  return {
    title: titleFor("Zeď v cestě"), subtitle: "Zdi blokují přímou cestu – najdi obchvat.",
    mechanics: ["posun", "zdi"], board: board, solvedTiles: tiles,
    goal: { type: "deliver", deliveries: [{ keyId: "A", target: targetKey }] },
    scrambleSteps: scrambleBudget(par), minPar: par, minKeyDistance: minDistForTier(tier), seed: seed
  };
}

function tmplFixed(tier, seed) {
  var radius = Math.max(regionRadius(tier), 2);
  var cells = L.hexagonArea(radius);
  var rng = mulberry32(seed);
  var keys = cells.map(function (c) { return L.key(c.q, c.r); });
  var empties = randomSubset(rng, keys, 2);
  var remaining = keys.filter(function (k) { return empties.indexOf(k) === -1; });
  var targetKey = pick(rng, remaining);
  remaining = remaining.filter(function (k) { return k !== targetKey; });
  var fixedKeys = randomSubset(rng, remaining, 2 + Math.floor(tier / 3));
  var board = boardFromCells(cells, {});
  var tiles = {}; tiles[targetKey] = keyTile("A");
  fillObstacles(tiles, cells, empties.concat([targetKey]), fixedKeys);
  var par = parForTier(tier);
  return {
    title: titleFor("Pevné překážky"), subtitle: "Některé dílky jsou přikované na místě. Obejdi je.",
    mechanics: ["posun", "pevné dílky"], board: board, solvedTiles: tiles,
    goal: { type: "deliver", deliveries: [{ keyId: "A", target: targetKey }] },
    scrambleSteps: scrambleBudget(par), minPar: par, minKeyDistance: minDistForTier(tier), seed: seed
  };
}

function tmplHub(tier, seed) {
  // On any board with an outer ring around the hub, there's always a bypass
  // route (out through one neighbor, around the well-connected outer area,
  // back in through another) that reaches any inner-ring cell by plain
  // sliding — so the hub is never *topologically* required there, only ever
  // a shortcut. To make it a genuine requirement, use the smallest possible
  // board (hub + its 6 neighbors, nothing else) with ZERO empty cells among
  // them: with nothing to slide into, rotating the hub is the only legal
  // move there is, full stop.
  var cells = L.hexagonArea(1);
  var hubKey = L.key(0, 0);
  var ring = L.CW_ORDER.map(function (dirIdx) { var d = L.DIRS[dirIdx]; return L.key(d.q, d.r); });
  var overrides = {}; overrides[hubKey] = "rotator";
  var board = boardFromCells(cells, overrides);
  var targetKey = ring[0];
  var tiles = {}; tiles[targetKey] = keyTile("A");
  ring.slice(1).forEach(function (k) { tiles[k] = obstacleTile(false); });
  var rng = mulberry32(seed);
  var maxK = Math.min(5, 2 + Math.floor(tier / 3));
  var par = 1 + Math.floor(rng() * maxK);
  return {
    title: titleFor("Otočný uzel"), subtitle: "Prostřední uzel otočí všech šest okolních dílků najednou.",
    mechanics: ["posun", "otočný uzel"], board: board, solvedTiles: tiles,
    goal: { type: "deliver", deliveries: [{ keyId: "A", target: targetKey }] },
    scrambleSteps: par, minPar: par, minKeyDistance: 1,
    requiredMechanics: ["rotator"], seed: seed
  };
}

function tmplTeleport(tier, seed) {
  var radius = tier <= 4 ? 1 : 2;
  var cluster1 = L.hexagonArea(radius);
  var span = radius * 2 + 4;
  var cluster2 = shiftCellsDown(L.hexagonArea(radius), span);
  var cells = cluster1.concat(cluster2);
  var rng = mulberry32(seed);
  var keys1 = cluster1.map(function (c) { return L.key(c.q, c.r); });
  var keys2 = cluster2.map(function (c) { return L.key(c.q, c.r); });
  var teleA = pick(rng, keys1), teleB = pick(rng, keys2);
  var targetKey = pick(rng, keys2.filter(function (k) { return k !== teleB; }));
  // Bigger clusters (tier > 4) need more than one free cell to stay mobile —
  // with only a single blank in a 19-cell ring, the random walk spends almost
  // its whole budget just inching the blank into position and rarely reaches
  // the teleport cell at all.
  var slackCount = radius <= 1 ? 1 : 2;
  var empties1 = randomSubset(rng, keys1.filter(function (k) { return k !== teleA; }), slackCount);
  var empties2 = randomSubset(rng, keys2.filter(function (k) { return k !== teleB && k !== targetKey; }), slackCount);
  var overrides = {}; overrides[teleA] = "teleportA"; overrides[teleB] = "teleportB";
  var board = boardFromCells(cells, overrides);
  var teleportPairs = teleportPairsOf([[teleA, teleB]]);
  var tiles = {}; tiles[targetKey] = keyTile("A");
  // Leave both teleport cells empty in the reference solved state (not just
  // the designated free slots) — otherwise an obstacle sits on top of each
  // portal and the scrambler first has to shuffle it off before a hop is even
  // possible, which a short, randomly-weighted scramble essentially never
  // manages. With the portals free from the start, a hop is available on
  // move one, so the teleport-hop weighting below reliably finds it.
  fillObstacles(tiles, cells, empties1.concat(empties2, [targetKey, teleA, teleB]), []);
  var par = parForTier(tier);
  return {
    title: titleFor("Teleport"), subtitle: "Dva ostrůvky, jediné spojení je přes teleport.",
    mechanics: ["posun", "teleport"], board: board, teleportPairs: teleportPairs, solvedTiles: tiles,
    goal: { type: "deliver", deliveries: [{ keyId: "A", target: targetKey }] },
    scrambleSteps: scrambleBudget(par), minPar: par, minKeyDistance: minDistForTier(tier),
    requiredMechanics: ["teleportA", "teleportB"], seed: seed
  };
}

function tmplIce(tier, seed) {
  var radius = Math.max(regionRadius(tier), 2);
  var cells = L.hexagonArea(radius);
  var rng = mulberry32(seed);
  var keys = cells.map(function (c) { return L.key(c.q, c.r); }).filter(function (k) { return k !== L.key(0, 0); });
  var ice = randomSubset(rng, keys, 3 + Math.floor(tier / 3));
  var remaining = keys.filter(function (k) { return ice.indexOf(k) === -1; });
  var empties = randomSubset(rng, remaining, 2);
  remaining = remaining.filter(function (k) { return empties.indexOf(k) === -1; });
  var targetKey = pick(rng, remaining);
  var overrides = {}; ice.forEach(function (k) { overrides[k] = "ice"; });
  var board = boardFromCells(cells, overrides);
  var tiles = {}; tiles[targetKey] = keyTile("A");
  fillObstacles(tiles, cells, empties.concat([targetKey]), []);
  var par = parForTier(tier);
  // No requiredMechanics here: ice only ever REMOVES a stopping option
  // (forced continuation instead of a free choice to stop), so neutralizing
  // it to "normal" can only ever add legal destinations, never remove one —
  // any solution that uses ice remains a solution once ice is neutralized,
  // just reachable via more (smaller) steps instead. That makes
  // solvableWithoutMechanic provably always true for this class of
  // mechanic, on any board, so it can never be asserted as "required" by
  // that check (unlike teleport's non-adjacent jump or the hub's
  // simultaneous 6-cell permute, neither of which is reproducible by any
  // sequence of ordinary slides).
  return {
    title: titleFor("Ledová pláň"), subtitle: "Na ledu se dílek zastaví až po nárazu na překážku.",
    mechanics: ["posun", "led"], board: board, solvedTiles: tiles,
    goal: { type: "deliver", deliveries: [{ keyId: "A", target: targetKey }] },
    scrambleSteps: scrambleBudget(par), minPar: par, minKeyDistance: minDistForTier(tier),
    seed: seed
  };
}

function tmplOneway(tier, seed) {
  var P = [L.key(1, 0), L.key(0, 1), L.key(-1, 1), L.key(-1, 0), L.key(0, -1), L.key(1, -1)];
  var cells = L.hexagonArea(1);
  var gateCount = Math.min(3, 1 + Math.floor(tier / 3));
  var gateIdx = [1, 3, 5].slice(0, gateCount);
  var overrides = {};
  gateIdx.forEach(function (p) {
    var nextIdx = (p + 1) % 6;
    overrides[P[p]] = "oneway:" + dirBetween(P[nextIdx], P[p]);
  });
  var board = boardFromCells(cells, overrides);
  var targetKey = P[gateIdx[gateIdx.length - 1]];
  var tiles = {}; tiles[targetKey] = keyTile("A");
  fillObstacles(tiles, cells, [L.key(0, 0), targetKey], []);
  var par = Math.min(parForTier(tier), 6);
  // No requiredMechanics here, for the same reason as ice (see tmplIce): a
  // oneway gate only ever REMOVES entry directions, so neutralizing it to
  // "normal" can only ever add legal moves (including, on this board, a
  // direct hub-to-target shortcut that the gate's direction restriction was
  // specifically there to block) — never remove a solution. Real gameplay
  // still enforces the gate for real: the forced detour through the
  // designated neighbor is genuine here (hub->target is geometrically
  // adjacent but direction-blocked), it just isn't provable by this
  // particular check.
  return {
    title: titleFor("Jednosměrka"), subtitle: "Brána propustí drahokam jen z jedné strany.",
    mechanics: ["posun", "jednosměrka"], board: board, solvedTiles: tiles,
    goal: { type: "deliver", deliveries: [{ keyId: "A", target: targetKey }] },
    scrambleSteps: scrambleBudget(par), minPar: par, minKeyDistance: 2,
    seed: seed
  };
}

function tmplConveyor(tier, seed) {
  var rng = mulberry32(seed);
  var entryDir = Math.floor(rng() * 6);
  var straightLen = 1 + Math.floor(tier / 4);
  var cur = { q: 0, r: 0 };
  var cells = [{ q: 0, r: 0 }];
  for (var i = 0; i < straightLen; i++) {
    cur = { q: cur.q + L.DIRS[entryDir].q, r: cur.r + L.DIRS[entryDir].r };
    cells.push({ q: cur.q, r: cur.r });
  }
  var belt = { q: cur.q + L.DIRS[entryDir].q, r: cur.r + L.DIRS[entryDir].r };
  cells.push(belt);
  var beltKey = L.key(belt.q, belt.r);
  // Pick a turn that does NOT leave the target geometrically adjacent to any
  // earlier cell on the straight run — otherwise the player can slide
  // straight to the target and skip the belt entirely, which is exactly the
  // "the conveyor doesn't do anything" bug this guards against.
  var turnDir = null, target = null;
  var offsets = [1, 2, 4, 5];
  for (var oi = 0; oi < offsets.length && turnDir === null; oi++) {
    var d = (entryDir + offsets[(oi + Math.floor(rng() * offsets.length)) % offsets.length]) % 6;
    var cand = { q: belt.q + L.DIRS[d].q, r: belt.r + L.DIRS[d].r };
    var candKey = L.key(cand.q, cand.r);
    var touchesEarlier = cells.slice(0, -1).some(function (c) {
      return hexDistance(L.key(c.q, c.r), candKey) <= 1;
    });
    if (!touchesEarlier) { turnDir = d; target = cand; }
  }
  if (turnDir === null) { turnDir = (entryDir + 2) % 6; target = { q: belt.q + L.DIRS[turnDir].q, r: belt.r + L.DIRS[turnDir].r }; }
  cells.push(target);
  var targetKey = L.key(target.q, target.r);
  var overrides = {}; overrides[beltKey] = "conveyor:" + turnDir;
  var board = boardFromCells(cells, overrides);
  var tiles = {}; tiles[targetKey] = keyTile("A");
  var par = Math.min(parForTier(tier), 6);
  // No requiredMechanics here, for the same reason as ice/oneway: a belt's
  // auto-redirect is reproducible by a player manually choosing the same
  // directions one slide at a time (the cells it redirects through already
  // exist and stay empty either way), so neutralizing it to "normal" can
  // only ever add move options, never remove a solution. The shortcut-
  // elimination check above (touchesEarlier) is what actually keeps this
  // level honest in real play — it guarantees no cell outside the belt's own
  // path reaches the target directly.
  return {
    title: titleFor("Dopravníkový pás"), subtitle: "Pás strhne drahokam do pevně daného směru.",
    mechanics: ["posun", "dopravník"], board: board, solvedTiles: tiles,
    goal: { type: "deliver", deliveries: [{ keyId: "A", target: targetKey }] },
    scrambleSteps: scrambleBudget(par), minPar: par, minKeyDistance: 2,
    seed: seed
  };
}

var KEY_IDS = ["A", "B", "C", "D"];
function tmplMultiKey(tier, seed, withWalls, withHub) {
  var radius = Math.max(regionRadius(tier), 2);
  var cells = L.hexagonArea(radius);
  var hubKey = L.key(0, 0);
  var rng = mulberry32(seed);
  var keys = cells.map(function (c) { return L.key(c.q, c.r); });
  if (withHub) keys = keys.filter(function (k) { return k !== hubKey; });
  var walls = withWalls ? randomSubset(rng, keys, 2 + Math.floor(tier / 3)) : [];
  var remaining = keys.filter(function (k) { return walls.indexOf(k) === -1; });
  var keyCount = Math.min(4, 2 + Math.floor(tier / 4));
  var targets;
  // Same structural trick as the single-key hub level: keep the empties off
  // the inner ring and put (at least) one target on it, so the hub is the
  // only way a tile ever reaches that specific target.
  var innerRing = withHub ? L.DIRS.map(function (d) { return L.key(d.q, d.r); }) : [];
  if (withHub) {
    var innerAvailable = innerRing.filter(function (k) { return remaining.indexOf(k) !== -1; });
    var forcedTarget = pick(rng, innerAvailable);
    var rest = randomSubset(rng, remaining.filter(function (k) { return k !== forcedTarget; }), keyCount - 1);
    targets = [forcedTarget].concat(rest);
  } else {
    targets = randomSubset(rng, remaining, keyCount);
  }
  remaining = remaining.filter(function (k) { return targets.indexOf(k) === -1; });
  var outerRemaining = withHub ? remaining.filter(function (k) { return innerRing.indexOf(k) === -1; }) : remaining;
  var empties = randomSubset(rng, outerRemaining, 2);
  var overrides = {};
  walls.forEach(function (k) { overrides[k] = "wall"; });
  if (withHub) overrides[hubKey] = "rotator";
  var board = boardFromCells(cells, overrides);
  var tiles = {}; var deliveries = [];
  targets.forEach(function (k, i) { tiles[k] = keyTile(KEY_IDS[i]); deliveries.push({ keyId: KEY_IDS[i], target: k }); });
  fillObstacles(tiles, cells, walls.concat(targets, empties, withHub ? [hubKey] : []), []);
  var par = parForTier(tier);
  var name = keyCount === 2 ? "Dva drahokamy" : (keyCount === 3 ? "Tři drahokamy" : "Čtyři drahokamy");
  var mechanics = ["posun", "doručení"];
  if (withWalls) mechanics.push("zdi");
  if (withHub) mechanics.push("otočný uzel");
  return {
    title: titleFor(name), subtitle: "Doveď všechny drahokamy na jejich zářící cíle.",
    mechanics: mechanics, board: board, solvedTiles: tiles,
    goal: { type: "deliver", deliveries: deliveries },
    scrambleSteps: scrambleBudget(par), minPar: par, minKeyDistance: minDistForTier(tier),
    // Unlike the single-key hub tutorial (a closed 7-cell board where the hub
    // really is the only legal move), this board has an outer ring around
    // the hub, which always offers a plain-sliding bypass route to any
    // inner-ring cell — so a hard "hub required" proof isn't achievable here
    // by construction. Targeting the inner ring still makes the hub the
    // efficient, obviously-intended way to solve it.
    seed: seed
  };
}

function tmplMultiKeyTeleport(tier, seed) {
  var radius = tier <= 4 ? 1 : 2;
  var cluster1 = L.hexagonArea(radius);
  var span = radius * 2 + 4;
  var cluster2 = shiftCellsDown(L.hexagonArea(radius), span);
  var cells = cluster1.concat(cluster2);
  var rng = mulberry32(seed);
  var keys1 = cluster1.map(function (c) { return L.key(c.q, c.r); });
  var keys2 = cluster2.map(function (c) { return L.key(c.q, c.r); });
  var teleA = pick(rng, keys1), teleB = pick(rng, keys2);
  var targetA = pick(rng, keys2.filter(function (k) { return k !== teleB; }));
  var targetB = pick(rng, keys1.filter(function (k) { return k !== teleA; }));
  // See tmplTeleport for why bigger clusters need more than one free cell.
  var slackCount = radius <= 1 ? 1 : 2;
  var empties1 = randomSubset(rng, keys1.filter(function (k) { return k !== teleA && k !== targetB; }), slackCount);
  var empties2 = randomSubset(rng, keys2.filter(function (k) { return k !== teleB && k !== targetA; }), slackCount);
  var overrides = {}; overrides[teleA] = "teleportA"; overrides[teleB] = "teleportB";
  var board = boardFromCells(cells, overrides);
  var teleportPairs = teleportPairsOf([[teleA, teleB]]);
  var tiles = {}; tiles[targetA] = keyTile("A"); tiles[targetB] = keyTile("B");
  // Keep both portals free from the start — see tmplTeleport for why.
  fillObstacles(tiles, cells, empties1.concat(empties2, [targetA, targetB, teleA, teleB]), []);
  var par = parForTier(tier);
  return {
    title: titleFor("Dva drahokamy, teleport"), subtitle: "Oba ostrůvky mají svůj cíl. Teleport je spojí.",
    mechanics: ["posun", "teleport"], board: board, teleportPairs: teleportPairs, solvedTiles: tiles,
    goal: { type: "deliver", deliveries: [{ keyId: "A", target: targetA }, { keyId: "B", target: targetB }] },
    scrambleSteps: scrambleBudget(par), minPar: par, minKeyDistance: minDistForTier(tier),
    requiredMechanics: ["teleportA", "teleportB"], seed: seed
  };
}

function neighborKeysOf(k) {
  var p = L.parseKey(k);
  return L.DIRS.map(function (d) { return L.key(p.q + d.q, p.r + d.r); });
}
function buildPipePath(tier, seed) {
  var rng = mulberry32(seed);
  var segCount = Math.min(10, 3 + Math.floor(tier * 0.8));
  var cur = { q: 0, r: 0 };
  var pathCells = [{ q: 0, r: 0 }];
  var pathKeys = [L.key(0, 0)];
  var lastDir = Math.floor(rng() * 6);
  for (var i = 0; i < segCount; i++) {
    var options = [lastDir, (lastDir + 1) % 6, (lastDir + 5) % 6];
    var start = Math.floor(rng() * options.length);
    var chosen = null;
    for (var t = 0; t < options.length && !chosen; t++) {
      var d = options[(start + t) % options.length];
      var nq = cur.q + L.DIRS[d].q, nr = cur.r + L.DIRS[d].r, nk = L.key(nq, nr);
      if (pathKeys.indexOf(nk) !== -1) continue;
      // Reject candidates that would geometrically touch any EARLIER path
      // cell (not just `cur`) — otherwise source/target or two unrelated
      // pipe cells can end up adjacent, creating an unintended shortcut that
      // can even make the goal trivially already-satisfied.
      var nbrs = neighborKeysOf(nk);
      var touchesOther = false;
      for (var pi = 0; pi < pathKeys.length - 1; pi++) {
        if (nbrs.indexOf(pathKeys[pi]) !== -1) { touchesOther = true; break; }
      }
      if (touchesOther) continue;
      chosen = { d: d, q: nq, r: nr, k: nk };
    }
    if (!chosen) break;
    cur = { q: chosen.q, r: chosen.r };
    pathCells.push({ q: cur.q, r: cur.r }); pathKeys.push(chosen.k);
    lastDir = chosen.d;
  }
  if (pathKeys.length < 4) {
    cur = { q: 0, r: 0 }; pathCells = [{ q: 0, r: 0 }]; pathKeys = [L.key(0, 0)];
    for (var j = 0; j < 4; j++) {
      cur = { q: cur.q + L.DIRS[0].q, r: cur.r + L.DIRS[0].r };
      pathCells.push({ q: cur.q, r: cur.r }); pathKeys.push(L.key(cur.q, cur.r));
    }
  }
  return { pathCells: pathCells, pathKeys: pathKeys };
}

function tmplPipes(tier, seed) {
  var built = buildPipePath(tier, seed);
  var pathKeys = built.pathKeys;
  var sourceKey = pathKeys[0], targetKey = pathKeys[pathKeys.length - 1];
  var overrides = {}; overrides[sourceKey] = "source"; overrides[targetKey] = "target";
  var board = boardFromCells(built.pathCells, overrides);
  var tiles = pipeChainTiles(pathKeys, []);
  var par = Math.min(16, pathKeys.length - 2);
  return {
    title: titleFor("Propojené trubky"), subtitle: "Otáčej trubky a propoj zdroj s cílem.",
    mechanics: ["otočení trubek"], board: board, solvedTiles: tiles,
    goal: { type: "path", source: sourceKey, target: targetKey },
    scrambleSteps: Math.max(10, pathKeys.length * 4), minPar: par, seed: seed
  };
}

function tmplPipesWalls(tier, seed) {
  var built = buildPipePath(tier, seed);
  var pathKeys = built.pathKeys;
  var sourceKey = pathKeys[0], targetKey = pathKeys[pathKeys.length - 1];
  var rng = mulberry32(seed + 7);
  var fixedIdx = pathKeys.length > 3 ? [Math.floor(pathKeys.length / 2)] : [];
  var overrides = {}; overrides[sourceKey] = "source"; overrides[targetKey] = "target";
  var cells = built.pathCells.slice();
  var occupied = {}; cells.forEach(function (c) { occupied[L.key(c.q, c.r)] = true; });
  var decorCount = 1 + Math.floor(tier / 4);
  var decoys = [];
  for (var i = 1; i < pathKeys.length - 1 && decoys.length < decorCount; i++) {
    var p = L.parseKey(pathKeys[i]);
    var d = Math.floor(rng() * 6);
    var nq = p.q + L.DIRS[d].q, nr = p.r + L.DIRS[d].r, nk = L.key(nq, nr);
    if (!occupied[nk]) { occupied[nk] = true; cells.push({ q: nq, r: nr }); decoys.push(nk); overrides[nk] = "wall"; }
  }
  var board = boardFromCells(cells, overrides);
  var tiles = pipeChainTiles(pathKeys, fixedIdx);
  var par = Math.min(16, pathKeys.length - 2);
  return {
    title: titleFor("Trubky a zdi"), subtitle: "Zdi svírají cestu. Jedna trubka je už správně – a zamčená.",
    mechanics: ["otočení trubek", "zdi", "pevný dílek"], board: board, solvedTiles: tiles,
    goal: { type: "path", source: sourceKey, target: targetKey },
    scrambleSteps: Math.max(10, pathKeys.length * 4), minPar: par, seed: seed
  };
}

function tmplSlidablePipes(tier, seed) {
  var sourceKey = L.key(0, 0), targetKey = L.key(3, -1);
  var pathKeys = [sourceKey, L.key(1, 0), L.key(2, -1), targetKey];
  var cells = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: -1 }, { q: 2, r: 0 }, { q: 3, r: -1 }];
  var overrides = {}; overrides[sourceKey] = "source"; overrides[targetKey] = "target";
  var board = boardFromCells(cells, overrides);
  var tiles = pipeChainTiles(pathKeys, []);
  var par = Math.min(10, 3 + Math.floor(tier / 2));
  return {
    title: titleFor("Pohyblivé trubky"), subtitle: "Tyhle trubky lze nejen otočit, ale i posunout.",
    mechanics: ["otočení trubek", "posun trubek"], board: board, solvedTiles: tiles,
    goal: { type: "path", source: sourceKey, target: targetKey },
    scrambleSteps: scrambleBudget(par), minPar: par, seed: seed
  };
}

function tmplCombo(tier, seed) {
  var radius = Math.max(regionRadius(tier) - 1, 1);
  var cellsA = L.hexagonArea(radius);
  var rng = mulberry32(seed);
  var keysA = cellsA.map(function (c) { return L.key(c.q, c.r); });
  var targetA = pick(rng, keysA);
  var emptiesA = randomSubset(rng, keysA.filter(function (k) { return k !== targetA; }), radius <= 1 ? 1 : 2);
  var tilesA = {}; tilesA[targetA] = keyTile("A");
  fillObstacles(tilesA, cellsA, emptiesA.concat([targetA]), []);
  var deliverGoal = { type: "deliver", deliveries: [{ keyId: "A", target: targetA }] };

  var SHIFT = radius + 14;
  var built = buildPipePath(tier, seed + 13);
  var pathCellsB = shiftCellsDown(built.pathCells, SHIFT);
  var pathKeysB = built.pathKeys.map(function (k) { return shiftKeyDown(k, SHIFT); });
  var sourceKey = pathKeysB[0], targetKey = pathKeysB[pathKeysB.length - 1];
  var overridesB = {}; overridesB[sourceKey] = "source"; overridesB[targetKey] = "target";
  var tilesB = pipeChainTiles(pathKeysB, []);
  var pathGoal = { type: "path", source: sourceKey, target: targetKey };

  var board = mergeBoards(boardFromCells(cellsA, {}), boardFromCells(pathCellsB, overridesB));
  var tiles = mergeTiles(tilesA, tilesB);
  var par = parForTier(tier);
  return {
    title: titleFor("Drahokam a trubky"), subtitle: "Dvě komory, dva různé úkoly, jedna deska.",
    mechanics: ["posun", "doručení", "otočení trubek"], board: board, solvedTiles: tiles,
    goal: { type: "combo", goals: [deliverGoal, pathGoal] },
    scrambleSteps: scrambleBudget(par), minPar: par, minKeyDistance: minDistForTier(tier), seed: seed
  };
}

var TEMPLATES = [
  tmplSlide, tmplWalls, tmplFixed, tmplHub, tmplTeleport, tmplIce, tmplOneway, tmplConveyor,
  function (t, s) { return tmplMultiKey(t, s, false, false); },
  function (t, s) { return tmplMultiKey(t, s, true, false); },
  function (t, s) { return tmplMultiKey(t, s, false, true); },
  tmplMultiKeyTeleport,
  tmplPipes, tmplPipesWalls, tmplSlidablePipes, tmplCombo
];

var TOTAL_LEVELS = 100;
var genStart = Date.now();
for (var idx = 1; idx <= TOTAL_LEVELS; idx++) {
  var tmpl = TEMPLATES[(idx - 1) % TEMPLATES.length];
  var tier = tierOf(idx);
  var spec = tmpl(tier, idx * 1000 + 37);
  spec.id = idx;
  var t0 = Date.now();
  var lvOut = finalizeLevel(spec);
  levels.push(lvOut);
  console.log("#" + idx + " " + lvOut.title + " par=" + lvOut.par + " (" + (Date.now() - t0) + "ms, total " + Math.round((Date.now() - genStart) / 1000) + "s)");
}

var out = "// Auto-generated by tools/generate-levels.js — do not hand-edit.\n" +
  "window.HEXABOX_LEVELS = " + JSON.stringify(levels, null, 2) + ";\n";
fs.writeFileSync(path.join(__dirname, "..", "levels.js"), out);
console.log("Wrote " + levels.length + " levels to levels.js");
levels.forEach(function (lv) {
  var tileCount = Object.keys(lv.tiles).length;
  console.log("  #" + lv.id + " " + lv.title + " - cells:" + Object.keys(lv.board).length + " tiles:" + tileCount + " par:" + lv.par);
});
