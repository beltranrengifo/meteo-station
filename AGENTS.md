# Agent Instructions

## Project rules (take precedence over the generic blocks below)

Project: home weather station (ESP32 + BME280 + wind/rain kit) -> Supabase -> web.
Read `docs/contexto-estacion-meteo-code.md` first; it wins over `docs/estacion-meteo-spec.md` where they differ.

### Hard rules
- **Never start servers** (dev servers, Supabase local, etc.). The user starts them by hand.
- **Never run PlatformIO** (`pio run`, `pio run -t upload`, `pio device monitor`, ...). The user builds, flashes and reviews on the board. Agents write code and say which command to run. This rule stays until the user lifts it explicitly.
- **Never commit or push on your own initiative.** The user commits so they can review the code; they say when to commit and when to push. When a task is done, ask whether to commit. This overrides the beads "session completion" block below.
- Never commit secrets. `firmware/include/secrets.h` is git-ignored; only `secrets.example.h` is tracked. Never put a Supabase service role key in firmware.
- Do not change pin assignments unless asked; if changed, update code and docs together.
- Do not invent facts about hardware or APIs: search, or say it is unknown.
- Never commit personal location data (address, area, exact coordinates). Station coordinates go in env vars.

### Conventions
- All code in English: identifiers, strings, serial messages, comments.
- Docs may be in Spanish. Say "flashear", not "subir".
- Hardware tests are logged in `docs/hardware-log.md`.

### Testing policy (firmware)
- Pure logic (vane mapping, circular mean, gust, rain mm, debounce decision, time/JSON formatting) lives in `firmware/lib/` with no Arduino dependency and is unit-tested with Unity in the `native` env (`pio test -e native`, runs on the Mac, no board). Write the test first.
- Thin wrappers over the ESP32 SDK or sensor libraries (WiFi, NTP, BME280) are not unit-tested: they are validated on the board and logged in `docs/hardware-log.md`.
- The user runs all `pio` commands, including tests.

### Testing policy (backend)
- Pure logic of Edge Functions (validation, parsing) lives in its own module next to `index.ts` and is tested with `deno test` (agents may run it: it starts no server).
- SQL migrations are validated when the user runs `supabase db push`; agents do not start a local Supabase.
- After deleting or editing rows in `public.readings`, run `select public.refresh_aggregates_rebuild();`: the incremental refresh only sees new inserts.
- Tasks live in beads (`bd`). Do not use markdown TODO lists.
- Work in small steps; short answers, one step at a time. No long explanations or several steps at once unless asked.
- The maintainer comes from frontend (React/TypeScript) and is new to electronics and ESP32: explain hardware concepts briefly when they come up.
- Use the `pio` CLI in a terminal (`pio run`, `pio run -t upload`, `pio device monitor`, `pio device list`); the VS Code PlatformIO toolbar does not work on the maintainer's machine.

This project uses **bd** (beads) for issue tracking. Run `bd prime` for full workflow context.

> **Architecture in one line:** Issues live in a local Dolt database
> (`.beads/dolt/`); cross-machine sync uses `bd dolt push/pull` (a
> git-compatible protocol), stored under `refs/dolt/data` on your git
> remote — separate from `refs/heads/*` where your code lives.
> `.beads/issues.jsonl` is a passive export, not the wire protocol.
>
> See [SYNC_CONCEPTS.md](https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md)
> for the one-screen overview and anti-patterns (don't treat JSONL as the
> source of truth; don't `bd import` during normal operation; don't
> reach for third-party Dolt hosting before trying the default).

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work atomically
bd close <id>         # Complete work
bd dolt push          # Push beads data to remote
```

## Non-Interactive Shell Commands

**ALWAYS use non-interactive flags** with file operations to avoid hanging on confirmation prompts.

Shell commands like `cp`, `mv`, and `rm` may be aliased to include `-i` (interactive) mode on some systems, causing the agent to hang indefinitely waiting for y/n input.

**Use these forms instead:**
```bash
# Force overwrite without prompting
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file

# For recursive operations
rm -rf directory            # NOT: rm -r directory
cp -rf source dest          # NOT: cp -r source dest
```

**Other commands that may prompt:**
- `scp` - use `-o BatchMode=yes` for non-interactive
- `ssh` - use `-o BatchMode=yes` to fail instead of prompting
- `apt-get` - use `-y` flag
- `brew` - use `HOMEBREW_NO_AUTO_UPDATE=1` env var

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:6cd5cc61 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->

<!-- BEGIN BEADS CODEX SETUP: generated by bd setup codex -->
## Beads Issue Tracker

Use Beads (`bd`) for durable task tracking in repositories that include it. Use the `beads` skill at `.agents/skills/beads/SKILL.md` (project install) or `~/.agents/skills/beads/SKILL.md` (global install) for Beads workflow guidance, then use the `bd` CLI for issue operations.

### Quick Reference

```bash
bd ready                # Find available work
bd show <id>            # View issue details
bd update <id> --claim  # Claim work
bd close <id>           # Complete work
bd prime                # Refresh Beads context
```

### Rules

- Use `bd` for all task tracking; do not create markdown TODO lists.
- Run `bd prime` when Beads context is missing or stale. Codex 0.129.0+ can load Beads context automatically through native hooks; use `/hooks` to inspect or toggle them.
- Keep persistent project memory in Beads via `bd remember`; do not create ad hoc memory files.

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.
<!-- END BEADS CODEX SETUP -->
