# Working rules for agents

This site is designed and directed by Julia Gale and built by an AI coding agent (Claude Code). Julia sets the system, the rules and the decisions, and reviews every change. The agent writes and runs the code.

Any agent working here reads these rules first, then the two documents they point to:

- `lavender/PRODUCT.md`: who the site is for and what it must prove.
- `lavender/DESIGN.md`: the design system, the page rules and the copy rules.
- `specs/README.md`: one spec per component and foundation, and every token.

Each rule says what it prevents. A rule only asks; where a rule has to hold, it also has a check that fails, and the hook below runs the checks after every edit.

## Scope

1. **Change only what was asked. Propose anything else in one line and wait.**
   Prevents: copy, layout or wording nobody asked for slipping into a change.
2. **After any change, check 390, 820, 1280, 1440 and 1920 wide, and tab through the page.**
   Prevents: a fix at one width breaking another, and keyboard focus getting lost.
3. **Never commit or push to `main`. Work on a branch, open a pull request, and ask Julia before any push.**
   Prevents: unreviewed changes reaching the live site.

## Design system

4. **Read the relevant spec in `specs/` before writing or changing any UI.**
   Prevents: rebuilding a component that already exists, or styling it a second way.
5. **Components use Layer 2 tokens only** (`--color-*`, `--space-*`, `--fs-*`, `--radius-*`, `--shadow-*`, `--z-*`, `--dur-*` and the rest), **never a Layer 1 token** (`--ref-*`, `--neutral-*`, `--lavender-*`, `--blue-50`, `--rgb-*`).
   Prevents: raw palette steps in components, so changing one role no longer recolours the site.
6. **If a value has no token, propose one to Julia in one line and wait.** Do not add a raw value, and do not add a token on your own.
   Prevents: one-off values, and tokens nobody approved.
7. **After adding, renaming or removing a token, update `specs/tokens/token-reference.md` in the same change.**
   Prevents: the documentation and the code disagreeing.
8. **Never carry anything over from the retired drafting-sheet direction** (`DESIGN.md` and `DESIGN.json` at the repository root).
   Prevents: old details leaking back because they look harmless.

## Case study covers

9. **Make every cover with `node scripts/make-cover.mjs`, never by hand, and use it in the hero, the Featured card and every Next case study band.**
   Prevents: the same product shown three different ways across the site.
10. **Every shadow in a cover ends inside the image.** `make-cover.mjs` refuses a cover whose edge pixels are not fully transparent.
   Prevents: a shadow cut off in a straight line under the screens.

## Checks

| Check | Command | Fails on | Runs |
| --- | --- | --- | --- |
| Token audit | `node scripts/token-audit.js` | Raw colours, sizes, radii, shadows or z-index; Layer 1 tokens in components; unknown tokens; `token-reference.md` out of step | After every agent edit (hook), and on every pull request (CI) |
| Cover check | `node scripts/cover-check.js` | A hero, Featured card or Next band showing anything other than the study's cover | After every agent edit (hook), and on every pull request (CI) |

## Hook

`.claude/settings.json` runs `scripts/hooks/after-edit.mjs` after every file the agent edits or writes. When the edit touches the site, its styles or the build scripts, it runs both checks and hands any failure straight back to the agent, so it fixes the problem in the same step instead of a reviewer finding it later. Added on 21 October 2026, after covers drifted between pages even though a written rule existed.
