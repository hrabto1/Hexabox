// Copies the game's web files into www/, the folder Capacitor bundles into
// the native Android/iOS app. Run this (or `npm run cap:sync`) after editing
// index.html/app.js/logic.js/levels.js at the project root.
"use strict";
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
var files = ["index.html", "app.js", "logic.js", "levels.js", "ads.js"];
files.forEach(function (f) {
  fs.copyFileSync(path.join(root, f), path.join(root, "www", f));
  console.log("copied " + f + " -> www/" + f);
});
