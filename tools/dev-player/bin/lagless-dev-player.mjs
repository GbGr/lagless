#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DIST_DIR = resolve(__dirname, '..', 'dist');

// Parse CLI args
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

const gameUrl = getArg('--game-url');
const serverUrl = getArg('--server-url');
const scope = getArg('--scope');
const label = getArg('--label');
const port = parseInt(getArg('--port') || '4210', 10);

if (!gameUrl) {
  console.error('Usage: lagless-dev-player --game-url <url> --server-url <url> --scope <scope> [--label <name>] [--port <port>]');
  console.error('\nRequired:');
  console.error('  --game-url <url>     Frontend URL (e.g., http://localhost:4200)');
  console.error('  --server-url <url>   Game server URL (e.g., ws://localhost:3333)');
  console.error('  --scope <scope>      Matchmaking scope (e.g., my-game)');
  console.error('\nOptional:');
  console.error('  --label <name>       Display label (defaults to scope)');
  console.error('  --port <port>        Port to serve on (default: 4210)');
  process.exit(1);
}

if (!serverUrl || !scope) {
  console.error('Error: --server-url and --scope are required.');
  process.exit(1);
}

if (!existsSync(DIST_DIR)) {
  console.error(`Error: dist/ directory not found at ${DIST_DIR}. The package may not be built correctly.`);
  process.exit(1);
}

const preset = { label: label || scope, gameUrl, serverUrl, scope };
const configScript = `<script>window.__LAGLESS_DEV_PLAYER_CONFIG__=${JSON.stringify([preset])}</script>`;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function serveIndex() {
  const indexPath = join(DIST_DIR, 'index.html');
  let html = readFileSync(indexPath, 'utf-8');
  // Inject config before closing </head>
  html = html.replace('</head>', `${configScript}\n</head>`);
  return html;
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const filePath = join(DIST_DIR, url.pathname);

  // Try to serve static file
  if (url.pathname !== '/' && existsSync(filePath)) {
    const ext = extname(filePath);
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    const content = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
    return;
  }

  // SPA fallback — serve index.html with injected config
  const html = serveIndex();
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
});

server.listen(port, () => {
  console.log(`\n  Dev Player running at http://localhost:${port}`);
  console.log(`  Game: ${gameUrl} | Server: ${serverUrl} | Scope: ${scope}\n`);
});
