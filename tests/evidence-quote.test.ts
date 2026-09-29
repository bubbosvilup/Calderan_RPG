import test from "node:test";
import assert from "node:assert/strict";
import type { CampaignCommand } from "../src/campaign/types.js";
import { verifyQuote } from "../src/dev/evidence-quote.js";

// Phase 1N shadow experiment only: quote verification is necessary for the experimental path, never sufficient, never production.
const transfer: CampaignCommand = { kind: "transfer_item", item_id: "pink_cotton", owner_id: "brenna", position: { kind: "carried", character_id: "brenna" } };
const tell: CampaignCommand = { kind: "set_knowledge", knowledge: { character_id: "brenna", fact_id: "campaign_fact_bridge_closed", status: "knows", provenance: { source_character_id: "nicco", acquisition_kind: "told" } } };
const statement = "The eastern bridge is closed.";

test("exact verbatim quote passes; paraphrase or fabrication is rejected", () => {
  const n = "Brenna gathers up the cotton shirt. Then the fluffy one.";
  assert.equal(verifyQuote(n, "Brenna gathers up the cotton shirt", transfer, statement, "strict"), null);
  assert.equal(verifyQuote(n, "Brenna takes the cotton shirt", transfer, statement, "strict"), "quote_not_verbatim");
  assert.equal(verifyQuote(n, "Brenna", transfer, statement, "strict"), "quote_length");
});
test("hedged, negated, refused or questioning quotes are rejected", () => {
  for (const [n, q] of [["Brenna does not take the shirts.", "Brenna does not take the shirts"], ["She might take them later.", "She might take them later"],
    ["Brenna takes them, then hands them back.", "Brenna takes them, then hands them back"], ["Brenna refuses the clothes.", "Brenna refuses the clothes"], ["Would she take them? Nobody knows.", "Would she take them?"]]) assert.equal(verifyQuote(n!, q!, transfer, statement, "strict"), "quote_hedged_or_negated", n);
});
test("strict policy never accepts evidence inside dialogue; quoted_tell accepts only Nicco's attributed statement of the exact fact", () => {
  const quoted = "Nicco leans toward Brenna. \"The eastern bridge is closed,\" he tells her quietly.";
  assert.equal(verifyQuote(quoted, "The eastern bridge is closed", tell, statement, "strict"), "quote_inside_dialogue");
  assert.equal(verifyQuote(quoted, "The eastern bridge is closed", tell, statement, "quoted_tell"), null);
  const maren = "Maren leans in. \"The eastern bridge is closed,\" she whispers to Brenna.";
  assert.equal(verifyQuote(maren, "The eastern bridge is closed", tell, statement, "quoted_tell"), "quote_inside_dialogue");
  const npcLie = "\"I took three pink shirts from a merchant once,\" Brenna says.";
  assert.equal(verifyQuote(npcLie, "I took three pink shirts from a merchant once", transfer, statement, "quoted_tell"), "quote_inside_dialogue");
});
