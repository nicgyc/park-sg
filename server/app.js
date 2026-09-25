import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createDataService } from './data.js';
const root = new URL('../public/', import.meta.url);
const assets = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'],
  '/model.js': ['model.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };

export function createApp({ service = createDataService() } = {}) {
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const json = (code, body) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    try {
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.setHeader('Allow', 'GET, HEAD');
        return json(405, { error: 'Method not allowed' });
      }
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/api/health') return json(200, { status: 'ok' });
      if (path === '/api/carparks') {
        try { return json(200, await service.get()); }
        catch { return json(503, { error: 'Carpark data is temporarily unavailable. Please retry shortly.' }); }
      }
      if (!assets[path]) return json(404, { error: 'Not found' });
      const [file, type] = assets[path];
      const body = await readFile(fileURLToPath(new URL(file, root)));
      res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      console.error(JSON.stringify({ event: 'request_failure', message: error.message }));
      if (!res.headersSent) json(500, { error: 'Unexpected server error' });
      else res.end();
    }
  });
}
