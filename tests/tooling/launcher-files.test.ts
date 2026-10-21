import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Static contracts of the one-click launcher files: the Windows batch files, the launcher sources and docs/LAUNCHER.md.
const read = (...parts: string[]) => readFile(join(...parts), "utf8");

test("Caldrevan.cmd delegates to the launcher: own folder, quoted paths, no argument injection, ASCII, CRLF", async () => {
  const text = await read("Caldrevan.cmd");
  assert.ok(text.includes("\r\n") && !/[^\r]\n/.test(text), "CRLF line endings only");
  assert.ok(/^[\x00-\x7f]*$/.test(text), "ASCII only");
  assert.match(text, /pushd "%~dp0"/, "works from its own folder, whatever the double-click's working directory");
  assert.match(text, /where node/, "checks that node is on PATH");
  assert.match(text, /nodejs\.org/, "tells the user where to get Node");
  assert.match(text, /node "%~dp0scripts\\launcher\\main\.mjs" --detach/, "quoted path to the launcher, detached so no console window lingers");
  assert.doesNotMatch(text, /%[1-9*]/, "no %1 / %* argument is ever expanded");
  for (const line of text.split("\r\n").filter(l => l.includes("%~dp0"))) assert.equal(line.slice(0, line.indexOf("%~dp0")).split('"').length % 2, 0, `%~dp0 is inside double quotes: ${line}`);
  assert.doesNotMatch(text, /\b(?:del|rmdir|rd|move|xcopy|robocopy|setx|reg)\b/i, "no destructive or configuration command");
  assert.match(text, /pause/);
});

test("setup.cmd runs npm ci, npm run build, npm run ui:build in order, stops at the first failure, pauses, and touches nothing else", async () => {
  const text = await read("setup.cmd");
  assert.ok(text.includes("\r\n") && !/[^\r]\n/.test(text), "CRLF line endings only");
  assert.ok(/^[\x00-\x7f]*$/.test(text), "ASCII only");
  assert.match(text, /pushd "%~dp0"/);
  const steps = [...text.matchAll(/^call (npm .*?) \|\| goto :failed\r?$/gm)].map(m => m[1]);
  assert.deepEqual(steps, ["npm ci", "npm run build", "npm run ui:build"]);
  assert.match(text, /:failed[\s\S]*pause/);
  assert.doesNotMatch(text, /\b(?:del|rmdir|rd|move|xcopy|robocopy|setx|reg|copy)\b/i);
  assert.doesNotMatch(text, /%[1-9*]/);
});

test(".gitattributes keeps the batch files CRLF", async () => {
  assert.match(await read(".gitattributes"), /^\*\.cmd text eol=crlf$/m);
});

test("launcher sources: no shell, no saves/ or config access, no install or build, loopback only", async () => {
  for (const file of ["core.mjs", "server.mjs", "main.mjs"]) {
    const code = (await read("scripts", "launcher", file)).split("\n").filter(l => !l.trim().startsWith("//")).join("\n");
    assert.doesNotMatch(code, /shell:\s*true|(?<![.\w])exec(?:Sync)?\(|(?<![.\w])execFile(?:Sync)?\(/, `${file}: spawn with an argument array only`);
    assert.doesNotMatch(code, /["'`]saves["'`]|saves\//, `${file}: never references the saves folder`);
    assert.doesNotMatch(code, /["'`]npm["'`]|npm\.cmd|npx/, `${file}: never installs or builds`);
    assert.doesNotMatch(code, /https?:\/\/(?!127\.0\.0\.1|localhost|\$\{|x["'`]|nodejs\.org)/, `${file}: no external URL`);
    assert.doesNotMatch(code, /0\.0\.0\.0|Access-Control-Allow/i, `${file}: no wildcard bind and no CORS`);
  }
  assert.match(await read("scripts", "launcher", "server.mjs"), /host: "127\.0\.0\.1"/);
});

test("docs/LAUNCHER.md documents the lifecycle, shutdown and the limits", async () => {
  const doc = await read("docs", "LAUNCHER.md");
  for (const needle of ["setup.cmd", "Caldrevan.cmd", "PLAY", "STOP", "Exit", "--control-stdin", "taskkill", "saves/campaigns/", "artifacts/local/launcher", "3199", "3000", "CALDREVAN_GAME_PORT",
    "setx OPENROUTER_API_KEY", "npm run play:ui", "npm run ui:dev", "SmartScreen", "Unverified on Windows", "killed hard"]) assert.ok(doc.includes(needle), `docs/LAUNCHER.md mentions ${needle}`);
  assert.match(doc, /^Status: Current\. Last reconciled: /m);
  assert.match(doc, /Exit[^\n]*stop[^\n]*(?:save|saves)/i, "Exit stops the game and the campaign is saved");
});
