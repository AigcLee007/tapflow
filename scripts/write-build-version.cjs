/* eslint-disable no-console */
const { execFileSync } = require('node:child_process');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

function readGitCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (_error) {
    return '';
  }
}

function buildManifest(now = new Date()) {
  const gitCommit = readGitCommit();
  const commit = process.env.BUILD_COMMIT || gitCommit || 'unknown';
  const timestampVersion = `build-${now.toISOString().replace(/[:.]/g, '-')}`;

  return {
    version: process.env.BUILD_VERSION || gitCommit || timestampVersion,
    commit,
    builtAt: now.toISOString(),
  };
}

function injectVersionIntoIndex(indexPath, version) {
  let html;
  try {
    html = readFileSync(indexPath, 'utf8');
  } catch (_error) {
    return false;
  }

  const marker = '<script id="tapflow-build-version">';
  const script = `${marker}window.__TAPFLOW_BUILD_VERSION__=${JSON.stringify(version)};</script>`;
  const cleaned = html.replace(
    /<script id="tapflow-build-version">[\s\S]*?<\/script>\s*/g,
    '',
  );
  const nextHtml = cleaned.includes('</head>')
    ? cleaned.replace('</head>', `  ${script}\n</head>`)
    : `${script}\n${cleaned}`;

  writeFileSync(indexPath, nextHtml, 'utf8');
  return true;
}

function writeBuildVersion(distDir = path.join(__dirname, '..', 'dist')) {
  const manifest = buildManifest();
  mkdirSync(distDir, { recursive: true });
  writeFileSync(path.join(distDir, 'version.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  injectVersionIntoIndex(path.join(distDir, 'index.html'), manifest.version);
  return manifest;
}

if (require.main === module) {
  const manifest = writeBuildVersion(process.argv[2] || undefined);
  console.log(`Wrote frontend build version ${manifest.version}`);
}

module.exports = {
  buildManifest,
  injectVersionIntoIndex,
  writeBuildVersion,
};
