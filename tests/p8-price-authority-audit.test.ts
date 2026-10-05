import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { auditNarration } from "../src/turn/narration-audit.js";
import { projectKnowledgeAccess } from "../src/turn/narrative-authority.js";
import { deriveTurnEvidence } from "../src/turn/turn-evidence.js";
import { readScene } from "../src/turn/narrated-captives.js";
import { groundingIssues } from "../src/turn/grounding-audit.js";
import { NARRATOR_SYSTEM } from "../src/turn/prompt-builder.js";
import type { RecentExchange } from "../src/turn/recent-conversation.js";

const world = await loadWorld("data");
const campaign = createOpeningCampaign(world, "p8_audit");
campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "calderan_slave_market" } }] });
const context = buildTurnContext(world, campaign.exportSnapshot());
function prices(narration: string, recent: readonly RecentExchange[] = []) {
  return auditNarration({ narration, recent, player_input: "How much for the girl?", context, world,
    access: projectKnowledgeAccess(context, {}), evidence: deriveTurnEvidence({ candidates: [], runtime: [] }, narration, context),
    diagnostics: [], committed: [], prepared: campaign.exportSnapshot(), authoritative_text: JSON.stringify(context),
  }).filter(i => i.kind === "invented_price");
}

test("P8 historical price TODO has no retained captive history; the live retained-history path differs", () => {
  const asking = 'The slaver shrugs. "Three gold for the girl. No papers."';
  const prelude: RecentExchange = { player: "*approaches the cages*", narration: "A lean slaver leans against a post. Behind the bars a thin girl lies curled on the straw.", status: "finalized" };
  assert.ok(prices(asking).length > 0, "new coordinator in the TODO helper loses the prior captive scene");
  assert.deepEqual(prices(asking, [prelude]), [], "current audit recognizes a narrator-created captive without a legal record when history is retained");
});

test("P8 prompt forbids unsupported exact prices despite the recognized person-trade gold exception", () => {
  assert.ok(NARRATOR_SYSTEM.includes("Prices: never state an exact price or number of coins unless canon, state or the player's own words supply it"));
  const input = { sentences: ["Three gold for the girl."], player_input: "How much?", recent: [], authoritative_text: "" };
  assert.equal(groundingIssues(input)[0]?.kind, "invented_price");
  assert.deepEqual(groundingIssues({ ...input, trade_negotiation: true }), []);
});

test("P8 unsupported auction numbers are rejected; supplied amounts are accepted without creating bid state", () => {
  const input = { sentences: ["The opening bid is twenty gold."], player_input: "What is the opening bid?", recent: [], authoritative_text: "" };
  assert.equal(groundingIssues(input)[0]?.kind, "invented_price");
  assert.deepEqual(groundingIssues({ ...input, authoritative_text: "The opening bid is twenty gold." }), []);
  assert.equal(context.social.nicco_gold, 500);
  assert.deepEqual(campaign.exportSnapshot().transactions, []);
});


test("P8 unquoted standalone asking-price dialogue lacks the seller attribution used by narrated purchase resolution", () => {
  const player = "How much for the girl?";
  const scene = "A lean slaver stands at a post. Behind the bars a thin girl lies curled on the straw.";
  const quoted = readScene([{ player, narration: `${scene} The slaver says, "Three gold for the girl."`, status: "finalized" }], context, world);
  const rpg = readScene([{ player, narration: `*${scene}*\n\nThree gold for the girl.`, status: "finalized" }], context, world);
  assert.ok(quoted.units.some(u => u.text.includes("Three gold") && u.quoted && u.speaker));
  assert.ok(rpg.units.some(u => u.text.includes("Three gold") && !u.quoted && !u.speaker));
});
