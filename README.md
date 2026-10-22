# Designing with agents

How I run the AI coding agent that builds my portfolio, [juliagale.com](https://juliagale.com): the rules it reads, the checks that fail when it breaks them, and the hook that makes it run those checks after every edit.

I'm a product designer specialising in design systems. I design the site, set the system and the rules, make the decisions and review every change. Claude Code writes and runs the code. The site's own repository stays private; this is a copy of its rule files, updated by a script that refuses anything private.

## The model: a rule asks, a check fails, a hook makes sure the check runs

| Layer | What it is here | What it can't do on its own |
| --- | --- | --- |
| **Rule** | `AGENTS.md` | Only asks. An agent can read a rule and still skip it. |
| **Check** | `scripts/token-audit.js`, `scripts/cover-check.js` | Fails, but only when someone runs it. |
| **CI** | `ci/token-audit.yml` (runs both checks on every pull request) | Catches it late, after the work is done. |
| **Hook** | `.claude/settings.json` → `scripts/hooks/after-edit.mjs` | Runs both checks after every file the agent edits and hands any failure straight back, so it fixes it in the same step. |

## What's in here, and what each part prevents

| File | What it is | Prevents |
| --- | --- | --- |
| `CLAUDE.md` | A pointer: loads `AGENTS.md` and the site's two design docs | Claude Code and other tools reading different rules |
| `AGENTS.md` | The working rules, each with what it prevents | Unasked changes, untested widths, pushes to `main`, one-off values |
| `scripts/token-audit.js` | Fails on raw colours, sizes, radii, shadows, z-index, palette steps in components, unknown tokens, or a token list out of step with the docs | A hard-coded value slipping past review |
| `scripts/cover-check.js` | Fails if a case study's hero, its card on Home or the Next case study band shows anything other than its cover | The same product shown three different ways |
| `scripts/hooks/after-edit.mjs` | The hook: runs both checks after each edit | A rule that exists but isn't followed |

`AGENTS.md` and `CLAUDE.md` also point to the site's design docs (`lavender/PRODUCT.md`, `lavender/DESIGN.md`) and its component specs (`specs/`). Those stay in the private repository with the site.

The tokens come in three layers: palette steps, then roles (`--color-text`, `--space-24`…), then components. Components may only use roles, so one change to a role recolours the whole site, and the agent can't reach for a raw colour.

## When something went wrong

Some of these rules and checks came from something slipping. These are the real cases, in order.

| What went wrong | What changed |
| --- | --- |
| The agent changed copy nobody asked for and skipped the five-width check, though both rules were already written down | The reason the rules here have checks behind them: a rule on its own only asks |
| A token clean-up broke the heading indent, and the token audit didn't notice | The audit now also fails on any token reference that doesn't exist |
| The audit only ran when someone remembered to run it | It runs in CI on every pull request |
| Case study covers drifted: the hero, the Home card and the Next band each showed a product differently, though the rule was written | A script makes every cover to one geometry, a check fails on any mismatch, and a hook runs the checks after every edit |
| A cover's shadow reached the edge of the image, so it was cut off in a straight line under the screens wherever the cover appeared | The cover script now refuses to write a cover whose edge pixels aren't fully transparent, and the rule says every shadow ends inside the image |

## The team version

On a client project with another designer, Claude Code built most of the screens inside a shared system: five layers of instruction files, one rulebook every tool reads, checks that fail the build, and a git hook that stops pushes to `main`. What I'd change next time: the rulebook grew long. I'd keep it short and give every rule the reason it exists. That project had no agent hook; this repo is where I added one. The case study: [juliagale.com/baseline.html](https://juliagale.com/baseline.html#agent).

## Using these files

They run in the site's private repository, which has the pages and styles they check, so they won't run on their own here. Read them as a working example. The writing about them is on [Creative Trails](https://creativetrails.substack.com).

All rights reserved: see `LICENSE`.
