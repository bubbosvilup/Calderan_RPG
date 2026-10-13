import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { NARRATOR_RPG_FORMAT, NARRATOR_SYSTEM } from "../src/turn/context/prompt-builder.js";
import { collect, setup } from "./turn-fixtures.js";
import { mockNarrator, mockController } from "./turn-fixtures.js";
import { TurnCoordinator } from "../src/turn/coordinator/turn-coordinator.js";

test("shared narrator contract persists exactly once across ordinary non-UI turns without rewriting output", async () => {
  const fixture = setup();
  const requests: import("../src/llm/types.js").GenerationRequest[] = [];
  const story = '*Brenna glances toward Nicco.*\n\nHello.\n\n*She smiles.*';
  const coordinator = new TurnCoordinator(fixture.world, mockNarrator(story, request => requests.push(request)), mockController([]), fixture.retrieval);
  for (const input of ["*I look around.*", "Hello.", "*I wait.*"]) {
    const events = await collect(coordinator.runTurn({ campaign: fixture.campaign, player_input: input }));
    const completed = events.find(e => e.type === "turn_completed");
    assert.ok(completed);
    assert.equal(completed.result.narration, story, "model output reaches delivery unchanged");
  }
  assert.equal(requests.length, 3);
  for (const request of requests) {
    assert.equal(request.system_prompt, NARRATOR_SYSTEM);
    assert.equal(request.system_prompt.split(NARRATOR_RPG_FORMAT).length - 1, 1);
    assert.equal(request.messages.some(m => m.content.includes(NARRATOR_RPG_FORMAT)), false);
  }
});

test("RPG contract leaves provider, model, route, sampling and wire adapter source bytes unchanged", async () => {
  const expected: Record<string, string> = {
    // Re-baselined by Repository Cleanup D5: the narrator-ledger re-export path moved to turn/coordinator/ (import path only; provider settings unchanged).
    "src/app/provider-config.ts": "a77570eb971d7a6c6b43f3c84ee993522200a9992f0f1796f72b2dd647b74b8b",
    "src/llm/openrouter/minimax-narrator.ts": "ceaa8f634a43cac9e411465d23a1781fab7ec3c86bc747ec50da28f87a8bc75c",
    // Re-baselined by Consolidation block 4 (narrator cap 768, recovery cap, finish_reason/metadata plumbing, accept_truncated; model, route, reasoning and wire shape unchanged).
    // Earlier: Controller Reliability Pass 2 (OpenRouter `models` fallback serialization + safe error/response-model diagnostics; narrator wire unchanged).
    "src/llm/openrouter/client.ts": "40672510c7b5bb4e8e6cf8dca0c4564a6162067342ecd26c81dab84ff0537025"
};
  for (const [path, digest] of Object.entries(expected)) {
    assert.equal(createHash("sha256").update(await readFile(path)).digest("hex"), digest, path);
  }
});
