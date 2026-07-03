/* eslint-disable no-console */
const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');

const port = Number(process.argv[2] || process.env.FRONTEND_PORT || 5188);
const host = process.env.FRONTEND_HOST || '127.0.0.1';

const distDir = path.join(__dirname, '..', 'dist');
const indexFile = path.join(distDir, 'index.html');

function resolveApiProxyTarget() {
  const explicitTarget =
    process.env.API_PROXY_TARGET ||
    process.env.TAPFLOW_API_PROXY_TARGET ||
    process.env.VITE_API_PROXY_TARGET ||
    process.env.API_BASE_URL;
  return explicitTarget || `http://127.0.0.1:${process.env.API_HOST_PORT || process.env.PORT || 3366}`;
}

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

  app.use('/api', (req, res) => {
    const target = new URL(resolveApiProxyTarget());
    const targetUrl = new URL(req.originalUrl, target);
    const client = targetUrl.protocol === 'https:' ? https : http;
    const headers = {
      ...req.headers,
      host: targetUrl.host,
      'x-forwarded-host': req.headers.host || '',
      'x-forwarded-proto': req.protocol,
    };
    delete headers.connection;

    const proxyRequest = client.request(
      {
        headers,
        hostname: targetUrl.hostname,
        method: req.method,
        path: `${targetUrl.pathname}${targetUrl.search}`,
        port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
        protocol: targetUrl.protocol,
      },
      (proxyResponse) => {
        res.statusCode = proxyResponse.statusCode || 502;
        for (const [name, value] of Object.entries(proxyResponse.headers)) {
          if (value !== undefined) {
            res.setHeader(name, value);
          }
        }
        proxyResponse.pipe(res);
      },
    );

    proxyRequest.on('error', (error) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      res.status(502).json({
        error: {
          code: 'API_PROXY_FAILED',
          message: `Unable to reach API service: ${error.message}`,
        },
      });
    });

    req.pipe(proxyRequest);
  });

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
