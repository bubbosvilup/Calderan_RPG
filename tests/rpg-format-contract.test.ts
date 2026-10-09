import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { NARRATOR_RPG_FORMAT, NARRATOR_SYSTEM } from "../src/turn/prompt-builder.js";
import { collect, setup } from "./turn-fixtures.js";
import { mockNarrator, mockController } from "./turn-fixtures.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";

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
    "src/app/provider-config.ts": "269faeaeb5b945c69651768a2a64e83f92740e8c60edc4db27d4f0c27de09269",
    "src/llm/openrouter/minimax-narrator.ts": "5dbfb52558a1bbb186e819cb6b87cc37806d84b326c363bc566d7f27750a777a",
    // Re-baselined by Controller Reliability Pass 2 (OpenRouter `models` fallback serialization + safe error/response-model diagnostics; narrator wire unchanged).
    "src/llm/openrouter/client.ts": "aff9e3450953a902302aec81b2b45a33c1988ac8efa3730cf2eb919d1418235c"
};
  for (const [path, digest] of Object.entries(expected)) {
    assert.equal(createHash("sha256").update(await readFile(path)).digest("hex"), digest, path);
  }
});
