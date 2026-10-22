// Local dev server: static files plus /api/assess.
// MOCK_MODEL=1 replaces the Anthropic call with a canned tool_use response so the
// full live flow (request building, schema, scoring, rendering) can be tested offline.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from '../api/assess.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8' };
export const captured = [];

if (process.env.MOCK_MODEL) {
  process.env.ANTHROPIC_API_KEY ||= 'mock';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (!String(url).includes('api.anthropic.com')) return realFetch(url, opts);
    const body = JSON.parse(opts.body);
    fs.writeFileSync(path.join(root, 'tests', '.last-request.json'), JSON.stringify(body, null, 2));
    const msg = body.messages[0].content;
    const pick = ['halden', 'crestview', 'sagebrook', 'marlow-finch'].find((id) => msg.includes({ halden: 'Halden', crestview: 'Crestview', sagebrook: 'Sagebrook', 'marlow-finch': 'Marlow' }[id])) || 'crestview';
    const ex = JSON.parse(fs.readFileSync(path.join(root, 'data/demo/assessments', `${pick}.json`), 'utf8'));
    delete ex.schemaVersion; delete ex.source; delete ex.generatedAt;
    ex.summary = `[MOCK LIVE] ${ex.summary}`;
    return new Response(JSON.stringify({ content: [{ type: 'tool_use', id: 'x', name: 'submit_assessment', input: ex }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === '/api/assess') {
    let raw = ''; for await (const c of req) raw += c;
    const r = {
      headers: {}, statusCode: 200,
      setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.statusCode = c; return this; },
      json(o) { res.writeHead(this.statusCode, { ...this.headers, 'content-type': 'application/json' }); res.end(JSON.stringify(o)); },
      end() { res.writeHead(this.statusCode, this.headers); res.end(); },
    };
    return handler({ method: req.method, body: raw }, r);
  }
  let p = decodeURIComponent(url.pathname); if (p === '/') p = '/index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`CleverHealth dev server on http://localhost:${port}${process.env.MOCK_MODEL ? ' (mock model)' : ''}`));
