/* eslint-disable no-console */
const express = require('express');
const path = require('path');

const port = Number(process.argv[2] || process.env.FRONTEND_PORT || 5188);
const host = process.env.FRONTEND_HOST || '127.0.0.1';

const app = express();
const distDir = path.join(__dirname, '..', 'dist');
const indexFile = path.join(distDir, 'index.html');

app.disable('x-powered-by');

app.use(
  express.static(distDir, {
    index: false,
    etag: true,
    maxAge: '1y',
    immutable: true,
    setHeaders(res, filePath) {
      if (filePath === indexFile) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        return;
      }
      if (filePath.startsWith(path.join(distDir, 'assets'))) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return;
      }
      res.setHeader('Cache-Control', 'public, max-age=3600');
    },
  }),
);

// SPA fallback (Express v5 does not accept "*" paths)
app.use((_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(indexFile);
});

app.listen(port, host, () => {
  console.log(`Static frontend running on http://${host}:${port}`);
});
