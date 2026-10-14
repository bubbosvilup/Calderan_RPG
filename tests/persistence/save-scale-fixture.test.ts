import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorld } from "../../src/world/loader.js";
import { FileCampaignRepository } from "../../src/persistence/campaign-repository.js";
import { identityLoadWarnings } from "../../src/campaign/identity-load-diagnostics.js";
import { buildScaleCampaign } from "../support/scale-fixture.js";

/**
 * Block B4 (P0): the scale fixture behind `npm run measure:save-scale`, at a tenth of the roadmap shape so it stays fast. It must build from valid
 * commands only, hit its shape, round-trip through the repository, and look clean to the load-time identity diagnostics (every accepted person offer has
 * its transaction; a negotiation keeps one subject).
 */
const world = await loadWorld("data");

test("the scale fixture builds its shape from valid commands, round-trips and reports no identity warning", async t => {
  const campaign = buildScaleCampaign(world, "scale_small", { characters: 20, facts: 50, items: 10, offers: 100, person_share: 0.3 }), s = campaign.exportSnapshot();
  assert.equal(s.characters.length, 20); assert.equal(s.items.length, 10); assert.ok(s.facts.length >= 50); assert.equal(s.trade_offers?.length, 100);
  assert.equal(s.trade_offers!.filter(o => o.subject.kind === "person").length, 30);
  assert.ok(s.trade_offers!.some(o => o.status === "superseded") && s.trade_offers!.some(o => o.status === "accepted") && s.trade_offers!.some(o => o.status === "withdrawn"));
  assert.ok(s.transactions.length >= 1);
  assert.deepEqual(identityLoadWarnings(s), []);
  const root = await mkdtemp(join(tmpdir(), "caldrevan-scale-")); t.after(() => rm(root, { recursive: true, force: true }));
  const repository = new FileCampaignRepository(world, root);
  await repository.saveCampaign(campaign);
  assert.deepEqual((await repository.loadCampaign("scale_small")).campaign.exportSnapshot(), s);
});
