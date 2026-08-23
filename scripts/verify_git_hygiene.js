'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function gitFiles(...pathspecs) {
  const output = execFileSync('git', ['ls-files', '-z', '--', ...pathspecs], {
    cwd: ROOT,
    encoding: 'utf8'
  });
  return output.split('\0').filter(Boolean);
}

function assert(condition, code, detail, results) {
  results.push([code, Boolean(condition), detail]);
  if (!condition) throw new Error(`${code}: ${detail}`);
}

function main() {
  const results = [];
  const trackedTmp = gitFiles('.tmp');
  const trackedReports = gitFiles('reports');
  const rawReportExtensions = new Set(['.json', '.png', '.jpg', '.jpeg', '.webp', '.har', '.mp4', '.webm']);
  const trackedRawReports = trackedReports.filter((file) => rawReportExtensions.has(path.extname(file).toLowerCase()));
  const trackedEnv = gitFiles('.env', '.env.local', '.env.uat.local');
  const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const worktrees = execFileSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: ROOT,
    encoding: 'utf8'
  }).split(/\r?\n/).filter((line) => line.startsWith('worktree '));

  assert(trackedTmp.length === 0, 'NO_TRACKED_TMP', trackedTmp.join(', ') || '0 tracked files', results);
  assert(trackedRawReports.length === 0, 'NO_TRACKED_RAW_EVIDENCE', trackedRawReports.join(', ') || '0 tracked files', results);
  assert(trackedEnv.length === 0, 'NO_TRACKED_LOCAL_ENV', trackedEnv.join(', ') || '0 tracked files', results);
  assert(gitignore.includes('.tmp/'), 'TMP_IS_IGNORED', '.tmp/ must be ignored', results);
  assert(gitignore.includes('reports/**/*.json') && gitignore.includes('reports/**/*.png'),
    'RAW_EVIDENCE_IS_IGNORED', 'reports JSON/images must be ignored', results);
  assert(server.includes("'/.tmp/'") && server.includes("'/reports/'"),
    'STATIC_SERVER_BLOCKS_ARTIFACTS', 'server must block /.tmp/ and /reports/', results);
  assert(!/PASSWORD\s*=\s*['"]123456['"]/i.test(gitFiles('scripts', 'server.js')
    .filter((file) => file.endsWith('.js'))
    .map((file) => fs.readFileSync(path.join(ROOT, file), 'utf8'))
    .join('\n')), 'NO_DEFAULT_UAT_PASSWORD', 'no script may default to password 123456', results);
  assert(worktrees.length === 1, 'SINGLE_WORKTREE', `${worktrees.length} worktree(s)`, results);

  console.log(JSON.stringify({
    Task: 'VERIFY-GIT-HYGIENE',
    Status: 'PASS',
    Results: results,
    TrackedMarkdownReports: trackedReports.filter((file) => file.endsWith('.md')).length
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({ Task: 'VERIFY-GIT-HYGIENE', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
}
