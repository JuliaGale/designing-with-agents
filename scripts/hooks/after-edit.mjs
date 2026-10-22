#!/usr/bin/env node
// Claude Code hook (PostToolUse on Edit, MultiEdit and Write), set in .claude/settings.json.
// After the agent edits a file in lavender/, specs/ or scripts/, run the token audit and the
// cover check. On a failure, print it to stderr and exit 2: Claude Code hands stderr back to
// the agent, which fixes the problem in the same step. Other files pass straight through.
import { execFileSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let input = '';
for await (const chunk of process.stdin) input += chunk;
let file = '';
try { const e = JSON.parse(input); file = e.tool_input?.file_path || e.tool_input?.path || ''; } catch {}
const rel = file ? relative(root, file) : '';
if (!/^(lavender|specs|scripts)\//.test(rel)) process.exit(0);

const failures = [];
for (const script of ['scripts/token-audit.js', 'scripts/cover-check.js']) {
  try { execFileSync('node', [join(root, script)], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { failures.push(`${script} failed after editing ${rel}:\n${(e.stdout || '') + (e.stderr || '')}`.trim()); }
}
if (failures.length) {
  process.stderr.write(failures.join('\n\n') + '\n\nFix this before moving on (AGENTS.md → Checks).\n');
  process.exit(2);
}
