/* eslint-disable no-console */
const express = require('express');
const path = require('path');

const port = Number(process.argv[2] || process.env.FRONTEND_PORT || 5188);
const host = process.env.FRONTEND_HOST || '127.0.0.1';

const distDir = path.join(__dirname, '..', 'dist');
const indexFile = path.join(distDir, 'index.html');

function resolveStaticCacheControl(filePath, paths = { distDir, indexFile }) {
  if (filePath === paths.indexFile || path.basename(filePath) === 'version.json') {
    return 'no-store, no-cache, must-revalidate';
  }
  if (filePath.startsWith(path.join(paths.distDir, 'assets'))) {
    return 'public, max-age=31536000, immutable';
  }
  return 'public, max-age=3600';
}

function createApp() {
  const app = express();

  app.disable('x-powered-by');

  app.use(
    express.static(distDir, {
      index: false,
      etag: true,
      maxAge: '1y',
      immutable: true,
      setHeaders(res, filePath) {
        res.setHeader('Cache-Control', resolveStaticCacheControl(filePath));
      },
    }),
  );

  // SPA fallback (Express v5 does not accept "*" paths)
  app.use((_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.sendFile(indexFile);
  });

  return app;
}

if (require.main === module) {
  createApp().listen(port, host, () => {
    console.log(`Static frontend running on http://${host}:${port}`);
  });
}

module.exports = {
  createApp,
  resolveStaticCacheControl,
};
