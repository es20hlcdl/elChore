import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url ?? "/", "http://localhost");
    let pathname = decodeURIComponent(requestUrl.pathname);

    if (pathname === "/") {
      pathname = "/index.html";
    }

    const filePath = path.normalize(path.join(publicDir, pathname));

    if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 - Archivo no encontrado");
      return;
    }

    const fileStats = await stat(filePath);
    if (fileStats.isDirectory()) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("403 - Acceso denegado");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
    const lastModified = fileStats.mtime.toUTCString();
    const isHtml = ext === ".html";
    const cacheControl = isHtml
      ? "no-store, max-age=0"
      : "public, max-age=0, must-revalidate";
    const ifModifiedSince = req.headers["if-modified-since"];

    if (!isHtml && ifModifiedSince) {
      const requestTime = new Date(ifModifiedSince).getTime();
      if (!Number.isNaN(requestTime) && requestTime >= fileStats.mtime.getTime()) {
        res.writeHead(304, {
          "Cache-Control": cacheControl,
          "Last-Modified": lastModified
        });
        res.end();
        return;
      }
    }

    const headers = {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
      "Last-Modified": lastModified
    };

    if (isHtml) {
      headers.Pragma = "no-cache";
      headers.Expires = "0";
    }

    res.writeHead(200, headers);
    createReadStream(filePath).pipe(res);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("500 - Error interno del servidor");
  }
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Storymap disponible en http://localhost:${PORT}`);
});
