# One-click launcher (Windows first)

Status: Current. Last reconciled: 2026-10-18 (first version; the Linux-tested core and the Windows-only parts are separated under [Unverified on Windows](#unverified-on-windows)). Source of truth: `Caldrevan.cmd`, `setup.cmd`, `scripts/launcher/` (`core.mjs`, `server.mjs`, `main.mjs`, `page.html`), `src/ui/play.ts` (the stop contract), `tests/tooling/launcher-*.test.ts`. Never put a key in the repo, a doc, a save or a log.

## What it is

Double-click `Caldrevan.cmd`. A small local page, the **Caldrevan Launcher**, opens in your browser. Click **PLAY**: the launcher starts the complete game, waits until it answers, and opens the game page. You never type an npm command. The launcher is a tiny Node program with no dependencies (no Electron, nothing to install, nothing paid); it only starts and stops the game that `npm run play:ui` would start, minus the rebuild.

The launcher never reads, writes, moves or deletes anything under `saves/`, never writes a configuration file or a key, never installs or updates anything, and never runs Vite or `npm run build` when you press PLAY.

## First launch

1. Install **Node.js 22 LTS** or newer from <https://nodejs.org> (the required version is read from `engines.node` in `package.json`).
2. Double-click **`setup.cmd`**. It runs `npm ci`, `npm run build` and `npm run ui:build` with visible output, stops at the first failure with a readable message, and ends with "Press any key". Run it again after you update the code.
3. Double-click **`Caldrevan.cmd`**.

If you press PLAY before setup, the launcher shows an Error that lists what is missing (`node_modules`, `.build/src/ui/play.js`, `dist/ui-client/index.html`, or a too old Node) and the exact fix: run `setup.cmd`, or in a terminal in the Caldrevan folder `npm ci && npm run build && npm run ui:build`.

## Normal launch and lifecycle

`Caldrevan.cmd` changes to its own folder, checks that `node` is on `PATH`, and runs `node scripts\launcher\main.mjs --detach`. That process opens the launcher page and exits; the launcher itself keeps running with no console window. A second double-click does not start a second launcher: it opens the page of the running one.

| Control | Effect |
| --- | --- |
| Status | Stopped, Starting, Ready, Stopping, Error, with a sentence and, on Error, "What to do". |
| **PLAY** | Checks the prerequisites and the port, starts the game, polls `GET /api/session` until it answers 200 (up to 60 s), then opens `http://127.0.0.1:<port>/app/` once. Pressing it again while Starting or Ready does nothing. |
| **STOP** | Asks the game to save the dirty campaign and exit, waits (up to 20 s), and only then force-kills that one process. Returns to Stopped. |
| **OPEN GAME** | Appears while Ready: a link to the game page. |
| **Show Logs** | The last 200 lines, a Copy button and the log file path. |
| **Exit** | Stops the game exactly as STOP does (the campaign is saved first), then closes the launcher. Closing the browser tab alone does not stop anything. |

If the game exits by itself or crashes, the status becomes Error with the exit code and the last output; PLAY starts a fresh one. If it does not answer within 60 s, or exits while starting, the child is cleaned up and the status is Error with the last log lines.

## Ports

| Port | Default | Override | If busy |
| --- | --- | --- | --- |
| Launcher page | `3199` | `--port=<n>` or `CALDREVAN_LAUNCHER_PORT` | Falls back to a free port, written to the log folder so a second double-click still finds it. |
| Game | `3000` (the `play.ts` default) | `--game-port=<n>` or `CALDREVAN_GAME_PORT` | **Error, never a silent move**: "Port 3000 is in use by another program: close it and press PLAY again, or set `CALDREVAN_GAME_PORT`." |

The game port is not auto-moved on purpose: a second game on another port would be a second writer on the same `saves/campaigns/`. A common cause is `npm run play:ui` still running in a terminal. To set a port for the double-click launch, run `setx CALDREVAN_GAME_PORT 3001` once in a terminal and start the launcher again. Both servers bind `127.0.0.1` only.

## Logs

`artifacts/local/launcher/launcher.log` (git-ignored, one rotated generation `launcher.log.1`, about 1 MB each) holds launcher events and the game's stdout and stderr; the last 500 lines are also kept in memory for **Show Logs**. Secrets are redacted before anything is stored or shown: the values of environment variables whose names contain KEY, TOKEN, SECRET or PASSWORD, `Bearer ...`, `sk-...`, `hf_...` and `NAME=value` pairs for such names. `artifacts/local/launcher/child.pid` names the running game (informational) and `launcher.json` the running launcher. To report a problem, press Copy in Show Logs or attach `launcher.log`.

## Saves

Campaigns live under `saves/campaigns/<campaign_id>/` exactly as with `npm run play:ui` ([Persistence](architecture/PERSISTENCE.md)). Only the game touches them. Manual Save and autosave work as usual; STOP and Exit save the dirty campaign first.

## API keys (optional)

The game reads keys from the environment only ([Configuration](CONFIGURATION.md)); the launcher passes your environment to the game unchanged and never writes or overwrites a key. A missing key does not block PLAY; the game reports it (the opening needs no key). To set a key once on Windows, in a terminal (the value is stored in your user environment, not in the repo):

```text
setx OPENROUTER_API_KEY "paste-your-key-here"
setx HF_TOKEN "paste-your-token-here"
```

`setx` affects programs started afterwards: **Exit the launcher and double-click `Caldrevan.cmd` again** (a launcher that was already running keeps its old environment). Or use Settings > System > About > Advanced system settings > Environment Variables. Never put a key in a file in the repo.

## Developer mode

Unchanged: `npm run play:ui` (rebuilds, then serves on 3000, Ctrl+C saves and stops) and `npm run ui:dev` (Vite on 5173 proxying `/api` to a running `play:ui`). The launcher is for players; do not run it and `npm run play:ui` on the same port. `node scripts/launcher/main.mjs` runs the launcher in a terminal (shows its console output; `--no-open` skips opening the page).

## The stop contract with `src/ui/play.ts`

Node on Windows cannot deliver SIGINT to a child, and `taskkill` without `/F` cannot close a console process, so a graceful stop needs the game's cooperation. The launcher starts the game as `node .build/src/ui/play.js --port=<n> --control-stdin` (an argument array, no shell, working directory = the repository root, stdin/stdout/stderr piped). With `--control-stdin`, `play.ts` reads its stdin:

- a line `stop` runs the same `stop()` as SIGINT/SIGTERM: save the dirty campaign, close the server, exit;
- stdin ending (the launcher closed the pipe, or died) does the same, so a hard-killed launcher cannot leave an orphan game.

Without the flag, stdin is not touched (`npm run play:ui` is unchanged). Stop sequence in the launcher: write `stop`, and on Linux and macOS also send SIGTERM; wait up to 20 s; then `taskkill /pid <pid> /T /F` (Windows) or SIGKILL, with a log line "the game did not stop within 20 s; killing process ...". Only the pid the launcher spawned is ever signalled; it never kills by name or port.

## Security model of the control API

The launcher page talks to a local JSON API (`/api/status`, `/api/logs`, `/api/play`, `/api/stop`, `/api/exit`) so that no web page you visit can start or stop your game:

- bound to `127.0.0.1` only; no CORS headers at all;
- every request needs `Host: 127.0.0.1:<port>` or `localhost:<port>` with the exact port (defeats DNS rebinding);
- every `/api` request needs a random per-run token in the `X-Launcher-Token` header, delivered inside the served page (a cross-origin page cannot read it);
- a POST must be `application/json` (at most 4 KB), and its `Origin` / `Sec-Fetch-Site`, when present, must be same-origin;
- the page is served with a nonce-only Content-Security-Policy and `frame-ancestors 'none'`.

Another program running as you on the same computer can still read the page and its token; that is the same trust as the files in your account. The API never returns environment values.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Node.js was not found" window | Install Node.js 22 LTS, reopen, or run setup.cmd. |
| Error "Setup is incomplete" | Double-click `setup.cmd` (or run `npm ci && npm run build && npm run ui:build`). |
| Error "Port 3000 is in use" | Close the other game (a terminal running `npm run play:ui`, or a leftover process in Task Manager), or set `CALDREVAN_GAME_PORT`. |
| Error "did not become ready" / "stopped while starting" | Press Show Logs: the game's own message is there. Then press PLAY again. |
| The launcher page says it is not reachable | The launcher was closed; double-click `Caldrevan.cmd` again. |
| Nothing happens on double-click | Run `node scripts/launcher/main.mjs` in a terminal in the Caldrevan folder to see the error; the log is `artifacts/local/launcher/launcher.log`. |
| Windows SmartScreen or antivirus warns about `Caldrevan.cmd` or `setup.cmd` | They are plain text batch files you can read in any editor ("More info", then "Run anyway" if you trust your copy). They contain no download and no network call. |
| `setup.cmd` fails on `npm ci` with "EBUSY" or "EPERM" | A running game or editor holds files in `node_modules`: press Exit in the launcher, close the editor, run again. |

## Known limitations

- **If the launcher is killed hard** (Task Manager, power loss, `kill -9`), it cannot run its cleanup. With the stop contract above the game sees its stdin close and saves and exits by itself within a moment. If a game ever survives anyway, the next launcher notes the recorded pid in `child.pid` in its log, does **not** touch it (a pid can be reused by an unrelated program), and PLAY reports the busy port; close that process in Task Manager. Stale `launcher.json` and `child.pid` files are harmless: they are verified (the launcher answers `/ping`; a dead pid is dropped) before use.
- An autosave or manual Save made before a forced kill is kept; turns after the last save can be lost only in that forced case.
- The launcher assumes Node is on `PATH` for `Caldrevan.cmd`; it starts the game with the same Node that runs the launcher.
- A very old Node (before ES modules with top-level await, about Node 14) fails with a raw syntax error before the launcher can explain it.
- A brief console window flashes while `Caldrevan.cmd` hands over to the hidden launcher.

## Unverified on Windows

Developed and tested on Linux with a stub game; the following exist only as small isolated functions or files and have **not** been run on Windows: `Caldrevan.cmd` and `setup.cmd` (their text is asserted by tests only), the hidden detached start (`spawn` with `detached` and `windowsHide` in `main.mjs`), `taskkill /pid <pid> /T /F` (`forceKill` in `core.mjs`; the argument array is asserted), opening the browser with `rundll32 url.dll,FileProtocolHandler` (`openInBrowser`), the `stop` line and stdin-close path on a Windows pipe, and the port probe next to a wildcard listener. The first Windows run (the fast CI job does not exercise the launcher) is its proof.
