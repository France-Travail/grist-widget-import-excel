import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { build } from "./build.mjs";
const { output } = await build();
const port = Number(process.env.PORT || 8003);
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".txt": "text/plain",
};
http
  .createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      const file = path.resolve(
        output,
        "." + (pathname.endsWith("/") ? pathname + "index.html" : pathname),
      );
      if (!file.startsWith(output + path.sep) || !(await stat(file)).isFile())
        throw new Error();
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Private-Network": "true",
      });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`Widget : http://localhost:${port}`),
  );
