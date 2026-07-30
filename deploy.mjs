#!/usr/bin/env node
// deploy.mjs — build post-processor and gh-pages uploader for Property Deal Calculator
// Fixes absolute _expo paths in index.html, then pushes dist/ to gh-pages branch

import { readFileSync, writeFileSync, cpSync, rmSync, mkdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, 'dist');
const REPO_URL = 'https://github.com/lukecode99/property-deal-calculator.git';
const PAT = process.env.GITHUB_PAT || process.env.GH_PAT;
if (!PAT) { console.error('Error: set GITHUB_PAT env var before running deploy.mjs'); process.exit(1); }
const AUTH_HEADER = `Authorization: Basic ${Buffer.from(`x:${PAT}`).toString('base64')}`;

// Step 1: Fix absolute paths in dist/index.html
const indexPath = resolve(DIST, 'index.html');
let html = readFileSync(indexPath, 'utf8');
// Replace absolute /_expo/ paths with relative ./_expo/ — match ="/_expo/ to avoid double-converting
html = html.replace(/="\/_expo\//g, '="./_expo/');
writeFileSync(indexPath, html);
console.log('✓ Fixed absolute paths in index.html');

// Step 2: Clone gh-pages branch into a temp dir
const PAGES_DIR = '/tmp/property-deal-calc-deploy-pages';
if (existsSync(PAGES_DIR)) rmSync(PAGES_DIR, { recursive: true, force: true });

console.log('Cloning gh-pages branch…');
execSync(
  `git -c http.sslVerify=false -c "http.extraHeader=${AUTH_HEADER}" clone --branch gh-pages --depth 1 ${REPO_URL} ${PAGES_DIR}`,
  { stdio: 'inherit' }
);

// Step 3: Clear and replace contents (preserve .git)
//
// market-data.json is written straight onto gh-pages by the daily "Update
// market data" automation and exists nowhere in the repo, so the wipe below
// would delete it and the web app would lose live rates until the next
// overnight run. Carry it across. privacy.html and support.html used to have
// the same problem; they now live in public/ and come through dist/.
const CARRY_OVER = ['market-data.json'];
const carried = new Map();
for (const name of CARRY_OVER) {
  const p = resolve(PAGES_DIR, name);
  if (existsSync(p)) carried.set(name, readFileSync(p));
  else console.warn(`! ${name} not found on gh-pages — nothing to carry over`);
}

for (const entry of (await import('fs')).readdirSync(PAGES_DIR)) {
  if (entry === '.git') continue;
  rmSync(resolve(PAGES_DIR, entry), { recursive: true, force: true });
}

// Copy dist/ contents into the pages dir
cpSync(DIST, PAGES_DIR, { recursive: true });
// Ensure .nojekyll exists so GitHub Pages doesn't ignore _expo/
writeFileSync(resolve(PAGES_DIR, '.nojekyll'), '');
for (const [name, buf] of carried) {
  writeFileSync(resolve(PAGES_DIR, name), buf);
  console.log(`✓ Carried over ${name}`);
}
console.log('✓ Copied new dist/ to gh-pages working dir');

// Step 4: Commit and push
execSync(`git -C ${PAGES_DIR} config user.email "nanoluke521@gmail.com"`, { stdio: 'inherit' });
execSync(`git -C ${PAGES_DIR} config user.name "lukecode99"`, { stdio: 'inherit' });
execSync(`git -C ${PAGES_DIR} add -A`, { stdio: 'inherit' });

const status = execSync(`git -C ${PAGES_DIR} status --short`).toString().trim();
if (!status) {
  console.log('Nothing changed — gh-pages already up to date.');
  process.exit(0);
}

// Message was hardcoded to one specific release ("Deploy v34 — View Ofsted
// report link on all school cards") and back-dated to a fixed timestamp, so
// every deploy since has claimed to be that one and to have happened on
// 28 June. Take the message from argv (or the current main commit) and let git
// stamp the real time.
const msg =
  process.argv.slice(2).join(' ').trim() ||
  `Deploy ${execSync(`git -C ${__dirname} rev-parse --short HEAD`).toString().trim()} — ` +
    execSync(`git -C ${__dirname} log -1 --pretty=%s`).toString().trim();

execSync(`git -C ${PAGES_DIR} commit -m ${JSON.stringify(msg)}`, { stdio: 'inherit' });

execSync(
  `git -C ${PAGES_DIR} -c http.sslVerify=false -c "http.extraHeader=${AUTH_HEADER}" push ${REPO_URL} gh-pages`,
  { stdio: 'inherit' }
);

console.log('✓ Deployed to gh-pages. Live at: https://lukecode99.github.io/property-deal-calculator/');
