// Tiny zero-dependency static file server for local testing.
var http = require("http");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
var types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };
http.createServer(function (req, res) {
  var p = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  var file = path.join(root, p);
  fs.readFile(file, function (err, data) {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(8923, function () { console.log("serving on http://localhost:8923"); });
