import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { log } from "node:console";
import { env } from "node:process";
import { fileURLToPath, URL } from "node:url";

// A second origin for checking the widget: a plain host page on :8080 that loads widget.js from the app on :3000.
const page = fileURLToPath(new URL("./index.html", import.meta.url));
const port = Number(env.PORT ?? 8080);

createServer(async (_req, res) => {
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(await readFile(page));
}).listen(port, () => log(`Demo host page: http://localhost:${port} (loads http://localhost:3000/widget.js)`));
