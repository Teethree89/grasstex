# AGENTS.md

For headless WebGL checks of the deployed Battle preview, use the working Chrome binary at `/Volumes/Expanse/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` as Playwright's `executablePath`. The locally downloaded Playwright Chromium bundle may be incomplete on this machine.

## FBX soldier visual lineup (weapon-in-hand verification)

`scripts/fbx-soldier-lineup.cjs` is the one-command evidence harness for imported-soldier
visual work (PIPELINE.md posed lineup: stock at the shoulder, right hand on the wrist,
left hand on the fore-end). Run it with:

```
php -S 127.0.0.1:8765 -t <parent-of-grasstex>   # if the local server is not already up
NODE_PATH=/Users/ivanpopov/node_modules node scripts/fbx-soldier-lineup.cjs
```

It loads `battle_sim_local.php`, waits for `[ANIM] FBX soldiers ready` (fails if the backend
never reports ready, a soldier fails to bind, or every model is not clip-retargeted `*`),
seeks Motion Lab to frame 45 (30 fps), then screenshots the US paratrooper through
aim/reload/walk-aim/crouch-aim (fixed front + side cameras). `FBX_FRAME` selects another
frame from 0 to 120. It then starts the live battle and screenshots every US and GE character
model and both scout weapon variants via the fly camera. Output (PNGs + `summary.json`) goes to `$FBX_OUT`
(default: OS temp dir `fbx-lineup`). Exit non-zero means the run itself failed; visual
PASS stays a human judgement over the PNGs.

Notes that keep coming up, so they live here now:

- The Motion Lab builds a US rifleman only, so other models and GE coverage come from
  the battle close-up step, not the lab shots.
- In-page Motion Lab has Pause/Play and a 0–120 frame slider. Scrubbing rebuilds the pose
  and advances it at 30 fps, then pauses. Its visible root stays at the origin, while virtual
  travel still supplies the speed required to select locomotion clips. This keeps screenshots
  and manual camera inspection repeatable.
- Production serves the UniversalCamera fly controller (`battle/camera-controls.js`), not
  the page's ArcRotate fallback: position battle close-ups with `camera.position` +
  `camera.setTarget`, never `radius`/`alpha`/`beta` (those are inert expandos there).
- Local headless runs show a red/black checkerboard terrain/sky plus some 404/403
  texture/log-endpoint noise. That is missing local asset serving, unrelated to soldier
  work; do not chase it during weapon/hand verification.
- `tools/ai-sim-harness/` is headless AI logic with no rendering, and
  `scripts/run_m3c_replay.cjs` stops the render loop: neither can verify weapon visuals.

## FBX Motion Lab contact calibrator (measure hand/weapon points)

`labs/fbx-animation-lab.html` sections 3–5 are the calibration frontend for the weapon
tables in `battle/modules/53-fbx-soldier-backend.js`: pick deployed soldiers, animations
and weapons from `labs/asset-list.php`, click vertices to set soldier contacts A (right)
and B (left) plus weapon grip / fore-near / fore-far, watch the weapon seat live, then
save (browser localStorage + JSON download) and paste the generated snippet into
`SOLDIER_CONTACTS` (per model) and `WEAPON_POINTS`/`WEAPON_MODEL_POINTS` (universal per
weapon). Contacts are hand-bone-local import units (backend anchor space); weapon points
are weapon-local metres (game layout). The lab pins Babylon 9.27.1, the battle runtime's
exact build, so measured numbers transfer 1:1. Served from `labs/` locally, on branch
previews, and in production (all three deploy the whole `labs/` directory).

<!-- BEGIN CODEX CONVERSATION MAINTENANCE -->
## Conversation Maintenance

- Longer sessions are more expensive even when cached. When a task gets long, queue compaction with `scripts/conversation-maintenance.py compact --reason "context is long"` during the task.
- The same `scripts/conversation-maintenance.py` drives both Codex and Claude Code. Codex uses `.codex/hooks.json`; Claude Code uses `.claude/settings.json` (hooks merge across settings files, so these run alongside any user-level hooks).
- The project Codex `Stop` hook in `.codex/hooks.json` should run `scripts/conversation-maintenance.py drain-hook --transport auto --refresh-ui --refresh-mode window --auto-submit go --restore-focus` after the assistant turn stops. This drains queued `/compact` and `/clear` work, waits for the Codex app-server completion signal, refreshes the VS Code Codex UI, and reopens the triggering thread with `vscode://openai.chatgpt/local/<thread-id>`.
- Codex `/compact` is programmatic (app-server RPC), so it needs no composer focus. Codex `/clear` auto-submit (`--auto-submit go`) opens the thread via `vscode://openai.chatgpt/`, which activates VS Code implicitly; add `--restore-focus` so focus returns to the previously frontmost app afterward (only when VS Code was not already frontmost).
- Claude Code has no programmatic `/compact` API, so its `Stop` hook synthesizes keystrokes: `drain-hook --compact-keystroke --clear-keystroke --grab-focus --restore-focus --focus-delay 0.5 --submit-delay 1.0`. Typing `/compact` or `/clear` pops Claude Code's slash-command autocomplete, so the keystroke path waits `--submit-delay` for the menu to settle, then presses Enter twice (accept + send). `--grab-focus` activates VS Code before typing; `--restore-focus` hands focus back to the prior app after (only when VS Code was not already frontmost). A frontmost guard still gates every keystroke, so stray keys never leak.
- Use `--transport auto` by default. In the tested VS Code environment, `--transport proxy` can fail with `Cannot run compact: no live Codex app-server control socket is available`, while `--transport auto` can fall back to stdio and complete real compaction.
- Use `--refresh-mode window` by default. VS Code 1.126.0 did not expose `code --command`, so this package uses guarded Command Palette automation for `workbench.action.reloadWindow`, followed by the Codex thread restore route when a thread id is available.
- Treat `--refresh-mode webview` as opt-in only. A manual `workbench.action.webview.reloadWebviewAction` / `Developer: Reload Webviews` test froze Codex at the logo in the original environment.
- A successful real compaction is visible in the Codex UI as the inline marker `Context automatically compacted`, in addition to lower context-window usage.
- When the user switches to a clearly new task, pivots direction, or starts a new conversation branch, tell the user that the last request hit a task-pivot marker and stage a handoff with `scripts/conversation-maintenance.py clear "next task" --reason "task pivot" --summary "1-2 sentence recap of the previous conversation" --criteria "ironclad, measurable success criteria from the user's original request"`.
- The `clear` command writes a durable handoff feed at `.runtime/handoff-prompt.md` and copies it to the clipboard. The `SessionStart` and `UserPromptSubmit` hooks inject that feed as `additionalContext` into the next thread and consume it once so it fires exactly once.
- Codex: creating the new thread stays a user action (click New Thread) — the handoff loads automatically. For a hands-off pivot, the Stop hook drains a queued `/clear` with `--auto-submit go` (opens a fresh chat and types `go`+Enter into the auto-focused composer), or run `clear … --open-new-thread --auto-submit go --restore-focus` immediately.
- Claude Code: the pivot is fully hands-off. Stage it with `clear "next task" --reason "task pivot" --summary "…" --criteria "…"`, then the Stop hook (`--clear-keystroke`) writes the feed at Stop time and synthesizes `/clear` itself. `/clear` fires `SessionStart source=clear`, whose hook (`handoff --emit-context --auto-submit go`) injects the feed and spawns a detached kickoff that types `go`+Enter into the reset composer, so the fresh thread self-starts its loop. `clear … --stage-feed` is the manual fallback (writes the feed now for a hand-typed `/clear`, no queue, no keystroke).
- Codex hook trust is content-hash based, and Claude Code re-prompts on `.claude/settings.json` edits. After installing this package or editing either hook file, re-approve hook trust before relying on the Stop, SessionStart, or UserPromptSubmit hooks.
- Cross-platform: all desktop automation dispatches on `sys.platform`. macOS uses `osascript`/`open`/`pbcopy`; Windows uses Windows PowerShell (Forms `SendKeys` + Win32 `SetForegroundWindow` + `clip`). No third-party keystroke tool is needed on either OS.
- Synthetic keystrokes for auto-submit and focus grab require macOS Accessibility permission for VS Code; Windows needs no equivalent grant. The clipboard copy remains a fallback if hooks or permissions are not ready.
- The reusable package is self-contained in its cloned `codex-conversation-maintenance` repo; install it into another project with `/path/to/codex-conversation-maintenance/install.sh --project /path/to/project`.
- Prerequisite: a real Codex CLI binary must be on `PATH` as `codex`, or `CODEX_BIN` must point to one. The official OpenAI installer is `curl -fsSL https://chatgpt.com/codex/install.sh | sh`. This package does not vendor that installer; it checks for the resulting CLI because the working hook path calls Codex app-server RPCs for `/compact`. The earlier remote-control daemon route was tested and abandoned, but the on-PATH CLI stayed necessary infrastructure.
<!-- END CODEX CONVERSATION MAINTENANCE -->
