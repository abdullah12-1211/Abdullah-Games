const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const gamesFilePath = path.join(__dirname, 'data', 'games.json');
const commentsFilePath = path.join(__dirname, 'data', 'comments.json');
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

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readJsonFile(filePath, emptyMessage, invalidMessage, callback) {
  fs.readFile(filePath, 'utf8', (error, data) => {
    if (error && error.code === 'ENOENT') {
      callback(null, []);
      return;
    }

    if (error) {
      callback({ status: 500, body: { message: emptyMessage } });
      return;
    }

    try {
      const parsed = JSON.parse(data);
      callback(null, Array.isArray(parsed) ? parsed : []);
    } catch (_parseError) {
      callback({ status: 500, body: { message: invalidMessage } });
    }
  });
}

function readGames(callback) {
  readJsonFile(gamesFilePath, 'تعذر تحميل الألعاب', 'بيانات الألعاب غير صالحة', callback);
}

function readComments(callback) {
  readJsonFile(commentsFilePath, 'تعذر تحميل التعليقات', 'بيانات التعليقات غير صالحة', callback);
}

function writeComments(comments, callback) {
  fs.writeFile(commentsFilePath, JSON.stringify(comments, null, 2), 'utf8', (error) => {
    if (error) {
      callback({ status: 500, body: { message: 'تعذر حفظ التعليقات' } });
      return;
    }

    callback(null);
  });
}

function collectJsonBody(req, callback) {
  let rawBody = '';

  req.on('data', (chunk) => {
    rawBody += chunk;
    if (rawBody.length > 1e6) {
      req.destroy();
    }
  });

  req.on('end', () => {
    try {
      callback(null, rawBody ? JSON.parse(rawBody) : {});
    } catch (_parseError) {
      callback({ status: 400, body: { message: 'الطلب غير صالح' } });
    }
  });

  req.on('error', () => {
    callback({ status: 400, body: { message: 'تعذر قراءة الطلب' } });
  });
}

function serveStatic(requestPath, res) {
  const safePath = path.normalize(requestPath).replace(/^\.+/, '');
  const filePath = safePath === '/' ? path.join(publicDir, 'index.html') : path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    sendJson(res, 403, { message: 'غير مصرح' });
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(res, 404, { message: 'الملف غير موجود' });
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
        sendJson(res, error.status, error.body);
        return;
      }

      sendJson(res, 200, games);
    });
    return;
  }

  if (req.method === 'GET' && requestPath.startsWith('/api/games/')) {
    const slug = decodeURIComponent(requestPath.replace('/api/games/', ''));

    readGames((error, games) => {
      if (error) {
        sendJson(res, error.status, error.body);
        return;
      }

      const game = games.find((item) => item.slug === slug);
      if (!game) {
        sendJson(res, 404, { message: 'اللعبة غير موجودة' });
        return;
      }

      sendJson(res, 200, game);
    });
    return;
  }

  if (req.method === 'GET' && requestPath === '/api/comments') {
    readComments((error, comments) => {
      if (error) {
        sendJson(res, error.status, error.body);
        return;
      }

      sendJson(res, 200, comments);
    });
    return;
  }

  if (req.method === 'POST' && requestPath === '/api/comments') {
    collectJsonBody(req, (bodyError, payload) => {
      if (bodyError) {
        sendJson(res, bodyError.status, bodyError.body);
        return;
      }

      const text = typeof payload.text === 'string' ? payload.text.trim() : '';
      if (!text) {
        sendJson(res, 400, { message: 'نص التعليق مطلوب' });
        return;
      }

      if (text.length > 160) {
        sendJson(res, 400, { message: 'التعليق طويل جدا' });
        return;
      }

      readComments((error, comments) => {
        if (error) {
          sendJson(res, error.status, error.body);
          return;
        }

        const newComment = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text,
          createdAt: Date.now()
        };

        writeComments([newComment, ...comments], (writeError) => {
          if (writeError) {
            sendJson(res, writeError.status, writeError.body);
            return;
          }

          sendJson(res, 201, newComment);
        });
      });
    });
    return;
  }

  if (req.method === 'DELETE' && requestPath.startsWith('/api/comments/')) {
    const commentId = decodeURIComponent(requestPath.replace('/api/comments/', ''));

    readComments((error, comments) => {
      if (error) {
        sendJson(res, error.status, error.body);
        return;
      }

      const nextComments = comments.filter((comment) => comment.id !== commentId);
      if (nextComments.length === comments.length) {
        sendJson(res, 404, { message: 'التعليق غير موجود' });
        return;
      }

      writeComments(nextComments, (writeError) => {
        if (writeError) {
          sendJson(res, writeError.status, writeError.body);
          return;
        }

        sendJson(res, 200, { success: true });
      });
    });
    return;
  }

  serveStatic(requestPath, res);
});

server.listen(PORT, () => {
  console.log(`Abdullah games running on http://localhost:${PORT}`);
});
