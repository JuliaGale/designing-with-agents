#!/usr/bin/env node
/*
 * Token audit for the lavender design system.
 *
 *   node scripts/token-audit.js              audit lavender/css, print findings, exit 1 on any error
 *   node scripts/token-audit.js --strict     warnings also fail
 *   node scripts/token-audit.js --json       machine-readable output
 *
 * ERRORS (exit 1)   colour literals; px in spacing, font-size, radius, shadow; numeric z-index;
 *                   components reading a Layer 1 primitive; unknown var(); Layer 2 tokens that hold a literal;
 *                   Layer 2 tokens missing from specs/tokens/token-reference.md (or listed there but gone).
 * WARNINGS          raw durations; raw font-weight, line-height, letter-spacing; px in border, outline, transform,
 *                   background-size and other unclassified properties; media queries off the @breakpoints list.
 * NOT AUDITED       component geometry (width, height, min/max, flex, grid tracks, aspect-ratio): a component sizes itself.
 *
 * Layers are read from the markers in lavender/css/tokens.css ("LAYER 1" and "LAYER 2" banner comments).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CSS_DIR = path.join(ROOT, 'lavender', 'css');
const TOKENS = path.join(CSS_DIR, 'tokens.css');
const REFERENCE = path.join(ROOT, 'specs', 'tokens', 'token-reference.md');
const args = process.argv.slice(2);
const STRICT = args.includes('--strict');
const AS_JSON = args.includes('--json');

const mask = (t) => t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, '\0'));
const lineOf = (text, i) => text.slice(0, i).split('\n').length;
const rel = (f) => path.relative(ROOT, f);

/* ---------- tokens.css ---------- */
const tokenSrc = fs.readFileSync(TOKENS, 'utf8');
const tokenMasked = mask(tokenSrc);
const l2Start = tokenSrc.indexOf('LAYER 2: ALIASES');
const l1Start = tokenSrc.indexOf('LAYER 1: PRIMITIVES');
if (l1Start < 0 || l2Start < 0) { console.error('tokens.css is missing its LAYER 1 / LAYER 2 banner comments.'); process.exit(2); }
const rootMatch = /:root\{([\s\S]*?)\n\}/.exec(tokenMasked);
const rootBodyStart = rootMatch.index + ':root{'.length;
const tokens = {}; // name -> {layer, value, line}
const tdecl = /(--[\w-]+)\s*:\s*([^;]+);/g;
let m;
while ((m = tdecl.exec(rootMatch[1]))) {
  const abs = rootBodyStart + m.index;
  tokens[m[1]] = { layer: abs < l2Start ? 1 : 2, value: m[2].trim(), line: lineOf(tokenSrc, abs) };
}
const breakpoints = ((/@breakpoints\s+([\d\s]+)/.exec(tokenSrc) || [])[1] || '').trim().split(/\s+/).map(Number);

function splitArgs(s) { // split var() args at the first top-level comma
  let d = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') d++; else if (s[i] === ')') d--; else if (s[i] === ',' && d === 0) return [s.slice(0, i), s.slice(i + 1)];
  }
  return [s, null];
}
function resolve(v, seen = []) {
  let out = '';
  for (let i = 0; i < v.length;) {
    if (v.startsWith('var(', i)) {
      let d = 1, j = i + 4;
      while (d) { if (v[j] === '(') d++; else if (v[j] === ')') d--; j++; }
      const [name, fb] = splitArgs(v.slice(i + 4, j - 1));
      const n = name.trim();
      if (tokens[n] && !seen.includes(n)) out += resolve(tokens[n].value, seen.concat(n));
      else if (fb !== null) out += resolve(fb, seen);
      else out += `var(${n})`;
      i = j;
    } else out += v[i++];
  }
  return out;
}
const norm = (s) => s.replace(/\s+/g, '').toLowerCase().replace(/(^|[^\d])0\./g, '$1.');
const reverse = {}; // family prefix -> {normalised value -> [token names]}
for (const [name, t] of Object.entries(tokens)) {
  if (t.layer !== 2) continue;
  const fam = (/^--(color|space|fs|radius|shadow|z|dur|bw|shift|offset|lh|ls|fw)-/.exec(name) || [])[1];
  if (!fam) continue;
  (reverse[fam] = reverse[fam] || {});
  (reverse[fam][norm(resolve(t.value))] = reverse[fam][norm(resolve(t.value))] || []).push(name);
}
const suggest = (fam, value, hint) => {
  const hit = (reverse[fam] || {})[norm(value)];
  if (hit) return `use var(${hit[0]})`;
  return hint || `no ${fam} token has the value ${value}; propose one to Julia, do not add it`;
};

/* ---------- locally defined custom properties (per-element inputs, not tokens) ---------- */
const files = fs.readdirSync(CSS_DIR).filter((f) => f.endsWith('.css') && f !== 'tokens.css').sort().map((f) => path.join(CSS_DIR, f));
const local = new Set(['--p']); // --p is set by motion.js
for (const f of files) for (const x of mask(fs.readFileSync(f, 'utf8')).matchAll(/(?<![\w-])(--[\w-]+)\s*:/g)) local.add(x[1]);
const htmlFiles = fs.readdirSync(path.join(ROOT, 'lavender')).filter((f) => f.endsWith('.html'));
let inlineStyles = 0, inlineColours = 0;
for (const f of htmlFiles) {
  const h = fs.readFileSync(path.join(ROOT, 'lavender', f), 'utf8');
  for (const s of h.matchAll(/style="([^"]*)"/g)) {
    inlineStyles++;
    if (/#[0-9a-f]{3,8}\b/i.test(s[1])) inlineColours++;
    for (const x of s[1].matchAll(/(--[\w-]+)\s*:/g)) local.add(x[1]);
  }
}
const jsSrc = fs.readFileSync(path.join(ROOT, 'lavender', 'js', 'motion.js'), 'utf8');
for (const x of jsSrc.matchAll(/setProperty\('(--[\w-]+)'/g)) local.add(x[1]);

/* ---------- rules ---------- */
const SPACE = /^(padding|margin)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$|^(gap|row-gap|column-gap|top|right|bottom|left|border-spacing|inset(-(block|inline)(-(start|end))?)?)$/;
const BORDER = /^(border|outline)(-(top|right|bottom|left))?$/;
const GEOMETRY = /^(width|height|min-width|max-width|min-height|max-height|inline-size|block-size|flex|flex-basis|grid-template-columns|grid-template-rows|grid-column|grid-row|aspect-ratio|columns|column-width|object-position|background-position|transform-origin|stroke-width|font-family|content|will-change|clip|clip-path|mask|mask-size|filter)$/;
const PX = /(?<![\w.#-])-?(\d*\.?\d+)px/g;
const COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\(|\b(?:white|black|red|green|blue|yellow|orange|purple|pink|gray|grey|silver|navy|teal)\b/;
const decl = /(?<=[{;])(\s*)(--[\w-]+|[a-z-]+)\s*:\s*([^;{}]+?)\s*(?=[;}])/g;

const findings = [];
const add = (severity, file, line, prop, value, rule, hint) => findings.push({ severity, file: rel(file), line, property: prop, value, rule, suggestion: hint });

let geometryPx = 0, driftUses = 0;
const CORE_SPACE = new Set(['4', '8', '12', '16', '20', '24', '32', '40', '48', '56', '64', '72', '80', '96']);

for (const f of files) {
  const raw = fs.readFileSync(f, 'utf8');
  const text = mask(raw);
  // media queries
  for (const mm of text.matchAll(/@media[^{]*\{/g)) {
    for (const w of mm[0].matchAll(/(?:max|min)-width\s*:\s*(\d+)px/g)) {
      if (!breakpoints.includes(Number(w[1]))) add('warning', f, lineOf(text, mm.index), '@media', `${w[1]}px`, 'breakpoint-off-list', `breakpoints are ${breakpoints.join(', ')}; add the value to @breakpoints in tokens.css only if it is intended`);
    }
  }
  let d;
  decl.lastIndex = 0;
  while ((d = decl.exec(text))) {
    const prop = d[2];
    const value = raw.slice(d.index + d[1].length + prop.length, d.index + d[0].length).replace(/^\s*:\s*/, '').trim();
    const line = lineOf(text, d.index + d[1].length);
    // var() references: layer + existence
    for (const v of value.matchAll(/var\(\s*(--[\w-]+)/g)) {
      const name = v[1];
      if (tokens[name]) {
        if (tokens[name].layer === 1) add('error', f, line, prop, `var(${name})`, 'layer-1-in-component', 'components use Layer 2 tokens only; find the alias in specs/tokens/token-reference.md');
      } else if (!local.has(name)) add('error', f, line, prop, `var(${name})`, 'unknown-token', 'not defined in tokens.css; check the spelling in specs/tokens/token-reference.md');
    }
    const bare = value.replace(/var\((?:[^()]|\([^()]*\))*\)/g, 'VAR'); // literals outside var()
    if (prop !== 'content' && prop !== 'font-family' && COLOUR.test(bare)) {
      const lit = COLOUR.exec(bare)[0];
      const resolved = lit.startsWith('#') ? suggest('color', lit, null) : 'every colour is a palette step; use a --color-* token, or propose the missing colour to Julia';
      add('error', f, line, prop, value, 'colour-literal', resolved);
    }
    const px = [...bare.matchAll(PX)].map((x) => x[1]);
    if (SPACE.test(prop)) {
      for (const n of px) if (Number(n) !== 0) add('error', f, line, prop, value, 'spacing-literal', suggest('space', `${n}px`));
      if (/clamp\(|min\(|max\(/.test(bare) && /\d(vw|vh|svh|cqw)/.test(bare)) add('error', f, line, prop, value, 'spacing-literal', 'fluid spacing belongs in tokens.css as --space-fluid-*');
    } else if (prop === 'font-size') {
      if (px.length || /clamp\(/.test(bare)) add('error', f, line, prop, value, 'font-size-literal', suggest('fs', px.length ? `${px[0]}px` : value, 'fluid sizes belong in tokens.css as --fs-fluid-*'));
    } else if (prop === 'border-radius') {
      const parts = bare.split(/\s+/).filter((p) => p && p !== '0' && p !== 'VAR');
      if (parts.length) add('error', f, line, prop, value, 'radius-literal', suggest('radius', parts[0], 'use --radius-md (12px) unless the shape needs sm, xs, full or the fluid screen radius'));
    } else if (prop === 'box-shadow') {
      if (bare !== 'none' && /\d+\.?\d*(px|em|cqw)/.test(bare)) add('error', f, line, prop, value, 'shadow-literal', 'use a --shadow-* token; compose a new one in tokens.css (Layer 1 then Layer 2)');
    } else if (prop === 'z-index') {
      if (/^-?\d+$/.test(bare)) add('error', f, line, prop, value, 'z-index-literal', suggest('z', bare, 'use --z-base, --z-page, --z-sticky or --z-header'));
    } else if (prop === 'font-weight') {
      if (/^\d+$/.test(bare)) add('warning', f, line, prop, value, 'font-weight-literal', suggest('fw', bare));
    } else if (prop === 'line-height') {
      if (/^\d*\.?\d+$/.test(bare) && Number(bare) !== 0) add('warning', f, line, prop, value, 'line-height-literal', suggest('lh', String(Number(bare))));
    } else if (prop === 'letter-spacing') {
      if (/^-?\d*\.?\d+em$/.test(bare) && parseFloat(bare) !== 0) add('warning', f, line, prop, value, 'letter-spacing-literal', suggest('ls', bare.replace(/^(-?)0?\./, '$1.')));
    } else if (/^(transition|animation)/.test(prop) || (prop.startsWith('--') && /^\.?\d*\.?\d+m?s$/.test(bare))) {
      for (const t of bare.matchAll(/(?<![\w.-])(\d*\.?\d+)(ms|s)(?![\w-])/g)) add('warning', f, line, prop, value, 'duration-literal', suggest('dur', `${t[1]}${t[2]}`));
    } else if (BORDER.test(prop) || prop === 'outline-offset' || prop === 'transform' || prop === 'background' || prop === 'background-size') {
      for (const n of px) add('warning', f, line, prop, value, 'px-literal', prop === 'transform' ? suggest('shift', `${n}px`) : prop === 'outline-offset' ? suggest('offset', `${n}px`) : suggest('bw', `${n}px`));
    } else if (GEOMETRY.test(prop)) {
      geometryPx += px.length;
    } else if (!prop.startsWith('--') && px.length) {
      add('warning', f, line, prop, value, 'px-literal', 'unclassified property: use a token or move the value into tokens.css');
    }
    for (const v of value.matchAll(/var\(\s*--space-(\d+)\b/g)) if (!CORE_SPACE.has(v[1])) driftUses++;
  }
}

/* ---------- tokens.css itself: Layer 2 must alias, never hold a literal ---------- */
for (const [name, t] of Object.entries(tokens)) {
  if (t.layer !== 2) continue;
  const stripped = t.value.replace(/var\((?:[^()]|\([^()]*\))*\)/g, 'VAR');
  if (/#[0-9a-fA-F]{3,8}\b|\d*\.?\d+(px|em|s|ms|cqw|vw|%)\b|rgba?\(/.test(stripped)) {
    findings.push({ severity: 'error', file: rel(TOKENS), line: t.line, property: name, value: t.value, rule: 'layer-2-literal', suggestion: 'a Layer 2 token aliases another token; move the raw value to a Layer 1 --ref-* token' });
  }
}

/* ---------- tokens.css itself: every var() in a token value must point at a defined token (--ds-* hooks are meant to be undefined) ---------- */
for (const [name, t] of Object.entries(tokens)) {
  for (const m of t.value.matchAll(/var\(\s*(--[\w-]+)/g)) {
    if (m[1].startsWith('--ds-') || tokens[m[1]]) continue;
    findings.push({ severity: 'error', file: rel(TOKENS), line: t.line, property: name, value: t.value, rule: 'token-undefined-reference', suggestion: `${m[1]} is not defined in tokens.css; the token resolves to nothing. Restore it or point ${name} at an existing token` });
  }
}

/* ---------- token reference sync ---------- */
const l2 = Object.keys(tokens).filter((n) => tokens[n].layer === 2);
if (!fs.existsSync(REFERENCE)) {
  findings.push({ severity: 'error', file: rel(REFERENCE), line: 1, property: '', value: '', rule: 'reference-missing', suggestion: 'create specs/tokens/token-reference.md listing every Layer 2 token' });
} else {
  const ref = fs.readFileSync(REFERENCE, 'utf8');
  const listed = new Set([...ref.matchAll(/^\|\s*`(--[\w-]+)`/gm)].map((x) => x[1]));
  for (const n of l2) if (!listed.has(n)) findings.push({ severity: 'error', file: rel(REFERENCE), line: 1, property: n, value: '', rule: 'reference-missing-token', suggestion: `${n} is in tokens.css but not in the reference table; add a row` });
  for (const n of listed) if (!l2.includes(n)) findings.push({ severity: 'error', file: rel(REFERENCE), line: 1, property: n, value: '', rule: 'reference-stale-token', suggestion: `${n} is in the reference table but not in tokens.css; remove the row or restore the token` });
}

/* ---------- report ---------- */
const errors = findings.filter((x) => x.severity === 'error');
const warnings = findings.filter((x) => x.severity === 'warning');
if (AS_JSON) {
  console.log(JSON.stringify({ errors: errors.length, warnings: warnings.length, findings, info: { tokens: Object.keys(tokens).length, layer2: l2.length, geometryPx, offScaleSpacingUses: driftUses, inlineStyleAttributes: inlineStyles, inlineStylesWithColour: inlineColours } }, null, 2));
} else {
  const show = (x) => console.log(`${x.file}:${x.line}  ${x.severity.toUpperCase().padEnd(7)} ${x.rule}  ${x.property ? x.property + ': ' : ''}${x.value}\n      -> ${x.suggestion}`);
  [...errors, ...warnings].forEach(show);
  console.log('');
  console.log(`token-audit: ${files.length} css files, ${Object.keys(tokens).length} tokens (${l2.length} in Layer 2)`);
  console.log(`  errors:   ${errors.length}`);
  console.log(`  warnings: ${warnings.length}`);
  console.log(`  info:     ${geometryPx} px values in component geometry (not audited), ${driftUses} uses of off-scale spacing tokens (drift, see specs/foundations/spacing.md),`);
  console.log(`            ${inlineStyles} inline style attributes in HTML (${inlineColours} with client colours, not audited)`);
  console.log(errors.length ? '  RESULT:   FAIL' : STRICT && warnings.length ? '  RESULT:   FAIL (strict: warnings)' : '  RESULT:   PASS');
}
process.exitCode = errors.length || (STRICT && warnings.length) ? 1 : 0;
