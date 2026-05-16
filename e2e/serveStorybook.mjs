#!/usr/bin/env node
/**
 * Tiny static file server for `storybook-static/`.
 *
 * Used by Playwright's `webServer` config in build / built modes. Written
 * inline because `http-server` (v14) stalls when its stdout is a pipe under
 * Playwright's child-process capture — http-server accepts the TCP
 * connection but never finishes sending the response body, so Playwright's
 * URL probe times out. This file implements only what we need:
 *
 *   - GET / → serve /index.html
 *   - GET /<file>.ext → serve the file with a basic content-type map
 *   - unknown → 404
 *   - logs to stderr (visible in Playwright's `[WebServer]` prefix stream)
 *     so stdout pipe buffering can't wedge the server.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(process.argv[2] ?? 'storybook-static');
const PORT = Number(process.argv[3] ?? 6006);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
};

function safeJoin(root, reqPath) {
  const decoded = decodeURIComponent(reqPath.split('?')[0].split('#')[0]);
  const target = normalize(join(root, decoded));
  if (!target.startsWith(root)) return null;
  return target;
}

const server = createServer(async (req, res) => {
  let urlPath = req.url ?? '/';
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = safeJoin(ROOT, urlPath);
  if (!filePath) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    const stat = statSync(filePath);
    const toRead = stat.isDirectory() ? join(filePath, 'index.html') : filePath;
    const body = await readFile(toRead);
    const type =
      TYPES[extname(toRead).toLowerCase()] ?? 'application/octet-stream';
    res.writeHead(200, {
      'content-type': type,
      'content-length': body.length,
      'cache-control': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

server.listen(PORT, () => {
  // Log to stderr so pipe stdout buffering never wedges this.
  process.stderr.write(
    `[serveStorybook] listening on http://localhost:${PORT} root=${ROOT}\n`,
  );
});
