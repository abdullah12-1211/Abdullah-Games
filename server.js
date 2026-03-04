const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const gamesFilePath = path.join(__dirname, 'data', 'games.json');
const publicDir = path.join(__dirname, 'public');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function readGames(callback) {
  fs.readFile(gamesFilePath, 'utf8', (error, data) => {
    if (error) {
      callback({ status: 500, body: { message: 'تعذر تحميل الألعاب' } });
      return;
    }

    try {
      callback(null, JSON.parse(data));
    } catch (_parseError) {
      callback({ status: 500, body: { message: 'بيانات الألعاب غير صالحة' } });
    }
  });
}

function serveStatic(requestPath, res) {
  const safePath = path.normalize(requestPath).replace(/^\.+/, '');
  const filePath = safePath === '/' ? path.join(publicDir, 'index.html') : path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ message: 'غير مصرح' }));
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message: 'الملف غير موجود' }));
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const requestPath = parsed.pathname;

  if (req.method === 'GET' && requestPath === '/api/games') {
    readGames((error, games) => {
      if (error) {
        res.writeHead(error.status, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(error.body));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(games));
    });
    return;
  }

  if (req.method === 'GET' && requestPath.startsWith('/api/games/')) {
    const slug = decodeURIComponent(requestPath.replace('/api/games/', ''));

    readGames((error, games) => {
      if (error) {
        res.writeHead(error.status, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(error.body));
        return;
      }

      const game = games.find((item) => item.slug === slug);
      if (!game) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ message: 'اللعبة غير موجودة' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(game));
    });
    return;
  }

  serveStatic(requestPath, res);
});

server.listen(PORT, () => {
  console.log(`Abdullah games running on http://localhost:${PORT}`);
});
