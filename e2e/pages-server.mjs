/**
 * Minimal static server that mimics GitHub Pages for the production build in dist/:
 *  - serves under /Spot-Cam/
 *  - /Spot-Cam/cam  -> 301 to /Spot-Cam/cam/ -> cam/index.html (directories, like Pages)
 *  - anything missing -> 404.html with a 404 status
 * Unlike `vite preview`, there is NO single-page-app fallback, so these tests prove the
 * deployed site works on plain static hosting.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const BASE = '/Spot-Cam';
const port = Number(process.env.PORT ?? 4173);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};

const send = (res, status, file) => {
  res.writeHead(status, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
};

const notFound = res => send(res, 404, path.join(dist, '404.html'));

http
  .createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname !== BASE && !pathname.startsWith(BASE + '/')) return notFound(res);

    const target = path.join(dist, decodeURIComponent(pathname.slice(BASE.length)));
    if (!target.startsWith(dist)) return notFound(res);

    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
      if (!pathname.endsWith('/')) {
        res.writeHead(301, { location: pathname + '/' });
        return res.end();
      }
      const index = path.join(target, 'index.html');
      return fs.existsSync(index) ? send(res, 200, index) : notFound(res);
    }
    return fs.existsSync(target) ? send(res, 200, target) : notFound(res);
  })
  .listen(port, () => console.log(`Pages-like server on http://localhost:${port}${BASE}/`));
