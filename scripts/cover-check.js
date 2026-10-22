#!/usr/bin/env node
/*
 * Cover check: one picture of each product everywhere (lavender/DESIGN.md → Cover).
 *
 *   node scripts/cover-check.js      exit 1 on any error
 *
 * For every project in lavender/projects.json:
 *   - stage.cover, when set, is assets/<slug>/cover.webp, exists, and is 2344 x 1500.
 *   - its page's hero is .pnl.cv showing that cover, or .pnl.rb (logo card) when it has no cover.
 *   - every Next case study band that points to it shows that cover (.nxs.cv), or no screen when it has no cover.
 * And on Home, each Featured stage with a cover shows that cover.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'lavender');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'projects.json'), 'utf8'));
const errors = [];
const err = (file, msg) => errors.push(`${file}: ${msg}`);

function webpSize(file) { // VP8X, VP8L or VP8 header
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const k = b.toString('ascii', 12, 16);
  if (k === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (k === 'VP8L') { const n = b.readUInt32LE(21); return [1 + (n & 0x3fff), 1 + ((n >> 14) & 0x3fff)]; }
  if (k === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  return null;
}

const covers = {};
for (const [slug, p] of Object.entries(cfg.projects)) {
  const c = p.stage && p.stage.cover;
  if (!c) continue;
  const want = `assets/${slug}/cover.webp`;
  if (c !== want) err('projects.json', `${slug}: stage.cover is "${c}", expected "${want}"`);
  const file = path.join(root, c);
  if (!fs.existsSync(file)) { err('projects.json', `${slug}: ${c} does not exist (make it with scripts/make-cover.mjs)`); continue; }
  const s = webpSize(file);
  if (!s || s[0] !== 2344 || s[1] !== 1500) err(c, `is ${s ? s.join(' x ') : 'not a WebP'}, expected 2344 x 1500`);
  if (!p.stage.alt) err('projects.json', `${slug}: stage.cover needs an alt`);
  covers[slug] = c;
}

const pages = fs.readdirSync(root).filter(f => f.endsWith('.html') && f !== 'index.html');
for (const f of pages) {
  const slug = f.replace(/\.html$/, '');
  const html = fs.readFileSync(path.join(root, f), 'utf8');
  if (cfg.projects[slug]) {
    const hero = html.match(/<div class="pnl([^"]*)"[^>]*>([\s\S]*?)<\/div>/);
    if (covers[slug]) {
      if (!hero || !/\bcv\b/.test(hero[1])) err(f, `hero must be <div class="pnl cv"> showing ${covers[slug]}`);
      else if (!hero[2].includes(`src="${covers[slug]}"`)) err(f, `hero cover must be ${covers[slug]}`);
      else if (!/alt="[^"]+"/.test(hero[2])) err(f, 'hero cover needs alt text');
    } else if (hero && !/\brb\b/.test(hero[1])) {
      err(f, 'hero shows a screen but the study has no cover: add stage.cover to projects.json and make the cover');
    }
  }
  const nx = html.match(/<a class="nx[^"]*" href="([a-z-]+)\.html">([\s\S]*?)<\/a>/);
  if (nx) {
    const to = nx[1], band = nx[2];
    const shown = (band.match(/<div class="nxs[^"]*"[\s\S]*?<img[^>]*src="([^"]+)"/) || [])[1];
    if (covers[to]) {
      if (!/<div class="nxs cv"/.test(band) || shown !== covers[to]) err(f, `Next case study band to ${to} must show ${covers[to]} in <div class="nxs cv">`);
    } else if (shown && !/class="nxs lgc"/.test(band)) err(f, `Next case study band to ${to} shows a screen, but ${to} has no cover`);
  }
}

const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const slug of cfg.featured) {
  if (!covers[slug]) continue;
  const row = index.match(new RegExp(`<a href="${slug}\\.html" class="fa"[\\s\\S]*?<span class="fi stg">([\\s\\S]*?)</span></a>`));
  if (!row || !row[1].includes(`src="${covers[slug]}"`)) err('index.html', `Featured ${slug} must show ${covers[slug]} (run node scripts/build-projects.mjs)`);
}

if (errors.length) { console.error(`cover-check: ${errors.length} error(s)\n  ` + errors.join('\n  ')); process.exit(1); }
console.log(`cover-check: PASS (${Object.keys(covers).length} covers, ${pages.length} pages)`);
