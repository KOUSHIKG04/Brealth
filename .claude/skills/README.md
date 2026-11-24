# Project design skills

Vendored third-party Claude Code skills, copied by hand on 15 November 2026.
No plugin entries, hooks or settings were installed with them. To update one,
re-copy its folder from the source commit you want and review the diff.

| Skill        | Source                                                           | Commit    | License    |
| ------------ | ---------------------------------------------------------------- | --------- | ---------- |
| `impeccable` | [pbakaus/impeccable](https://github.com/pbakaus/impeccable)      | `2b86d9c` | Apache 2.0 |
| `unslop`     | [heydamir/unslop](https://github.com/heydamir/unslop)            | `620163e` | CC BY 4.0  |
| `hallmark`   | [Nutlope/hallmark](https://github.com/Nutlope/hallmark)          | `04977e1` | MIT        |
| `stageshow`  | [benjitaylor/skills](https://github.com/benjitaylor/skills)      | `299140f` | MIT        |

`unslop` is by Damir Sokolovsky ([@heydamir](https://x.com/heydamir)); CC BY 4.0
requires that credit when its material is shared.

## When to use which

- **Mobile apps (Expo):** `impeccable` only. It reads each app's `PRODUCT.md`
  (`Platform: adaptive`) and applies iOS and Android conventions. Start with
  `/impeccable audit <path>` or `/impeccable critique <path>`; then `harden`,
  `clarify`, `polish` or `adapt` on one screen at a time.
- **Facility Portal and Company Admin (Next.js):** `impeccable` for review and
  refinement (`Platform: web`). `unslop` for a portal screen that looks generic,
  one screen per change.
- **Marketing site (future):** `hallmark` for new landing pages and
  `stageshow` for product mock-ups. Do not run `/hallmark redesign` on the apps.

Run an audit or critique before any editing command, and keep design changes in
separate commits from behaviour changes (see `AGENTS.md`).

## Local settings

- Impeccable telemetry is off in `.impeccable/config.json` (gitignored, so each
  developer sets it once, or exports `DO_NOT_TRACK=1`).
- Impeccable's edit hook is not enabled. Run its detector on finished web UI with
  `.claude/skills/impeccable/scripts/impeccable detect --json <paths>`; it does
  not apply to React Native screens.
- The launcher downloads its engine to `~/.impeccable/bin` on first run.
