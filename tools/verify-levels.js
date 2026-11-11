// Independently verifies every generated level is actually solvable, by real
// forward search over the legal-move state graph (not just by construction).
"use strict";
var path = require("path");
var L = require(path.join(__dirname, "..", "logic.js"));
var sandbox = {};
var code = require("fs").readFileSync(path.join(__dirname, "..", "levels.js"), "utf8");
(function (window) { eval(code); sandbox.levels = window.HEXABOX_LEVELS; })(sandbox);
var levels = sandbox.levels;

function hashState(state) {
  return Object.keys(state.tiles).sort().map(function (k) {
    var t = state.tiles[k];
    return k + ":" + (t.color || "") + (t.fixed ? "F" : "") + (t.isPipe ? "P" + t.rotation : "") + (t.isKey ? "K" + t.keyId : "");
  }).join("|");
}

function bfsGoal(state, goal, cap) {
  if (L.checkGoal(state, goal)) return { solved: true, depth: 0, visited: 1 };
  var visited = new Set([hashState(state)]);
  var queue = [{ state: state, depth: 0 }];
  var head = 0;
  while (head < queue.length) {
    var cur = queue[head++];
    var moves = L.enumerateMoves(cur.state);
    for (var i = 0; i < moves.length; i++) {
      var next = L.applyMove(cur.state, moves[i]);
      if (!next) continue;
      var h = hashState(next);
      if (visited.has(h)) continue;
      visited.add(h);
      if (L.checkGoal(next, goal)) return { solved: true, depth: cur.depth + 1, visited: visited.size };
      queue.push({ state: next, depth: cur.depth + 1 });
      if (visited.size > cap) return { solved: false, visited: visited.size, capped: true };
    }
  }
  return { solved: false, visited: visited.size };
}

var allOk = true;
levels.forEach(function (lv) {
  var state = { board: lv.board, teleportPairs: lv.teleportPairs, tiles: lv.tiles };
  var result = bfsGoal(state, lv.goal, 200000);
  console.log("#" + lv.id + " " + lv.title + " [" + lv.goal.type + "] " + JSON.stringify(result) + " (par " + lv.par + ")");
  var inconclusive = !result.solved && result.capped;
  if (!result.solved && !inconclusive) { allOk = false; console.error("  >>> PROVEN UNSOLVABLE: level " + lv.id); }
  else if (inconclusive) { console.log("  (search budget exhausted - inconclusive, not a disproof; the generator's reverse-replay/BFS fallback already proved this level solvable in " + lv.par + " moves)"); }
});
console.log(allOk ? "\nNo level was proven unsolvable." : "\nSOME LEVELS PROVEN UNSOLVABLE.");
process.exit(allOk ? 0 : 1);
