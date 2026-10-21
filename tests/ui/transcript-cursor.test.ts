import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GameSession } from "../../src/app/game-session.js";
import { FileCampaignRepository } from "../../src/persistence/campaign-repository.js";
import { setup } from "../support/turn-fixtures.js";

/**
 * B3: the transcript window. The server sends a bounded window (the last 500 entries) and every message carries its stable entry index as `seq`,
 * which the React transcript uses as the item key (see src/ui-client/features/transcript/Transcript.test.tsx for the sliding window in the page).
 * Offline: a real GameSession over a temporary save.
 */
test("a loaded campaign with 600 saved entries sends its stable positions, and a new turn appears after the full window", async () => {
  const dir = await mkdtemp(join(tmpdir(), "transcript-cursor-"));
  try {
    const f = setup(), repository = new FileCampaignRepository(f.world, dir), id = f.campaign.exportSnapshot().campaign_id;
    await repository.saveCampaign(f.campaign);
    const at = "2026-10-14T10:00:00.000Z";
    await repository.appendTranscript(id, Array.from({ length: 600 }, (_, i) => ({ i, at, role: i % 2 ? "player" as const : "narrator" as const, text: `saved ${i}`, revision: f.campaign.revision })));
    const loaded = await GameSession.loadCampaign({ world: f.world, repository, createCoordinator: () => f.coordinator }, id);
    assert.ok(loaded.ok); const session = loaded.session;
    const before = session.getTranscript();
    assert.equal(before.length, 500); assert.deepEqual([before[0]!.i, before.at(-1)!.i], [100, 599]);
    assert.ok((await session.submitPlayerInput("I smile.")).ok);
    const after = session.getTranscript();
    assert.equal(after.length, 500, "the window stays full");
    assert.ok(after.at(-1)!.i > 599 && after.at(-2)!.i > 599, "the new turn has new, larger positions");
    // What the page keys on: the entries after the last position it rendered are exactly the new turn, and a repeat adds nothing.
    const seen = before.at(-1)!.i, fresh = after.filter(m => m.i > seen);
    assert.equal(fresh.length, 2); assert.match(fresh[0]!.text, /I smile\./);
    assert.equal(new Set(after.map(m => m.i)).size, after.length, "positions are unique, so a position is a stable item key");
    assert.equal(session.getTranscript().filter(m => m.i > after.at(-1)!.i).length, 0, "a repeated read has nothing new");
    await session.shutdown({ discard_unsaved: true });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
