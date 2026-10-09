import test from "node:test";
import assert from "node:assert/strict";
import { itemSpritePrompt, ITEM_SPRITE_NEGATIVE_PROMPT } from "../src/campaign/item-sprite-prompt.js";
import { RAENA_IMAGE_STACK } from "../src/app/image-stack.js";
import { FalImageClient } from "../src/llm/huggingface/fal-image-client.js";

const knife = { name: "Plain Silver Knife", category: "weapon" as const, visual_description: "Small plain silver knife with a straight undecorated blade and simple dark wooden handle." };
test("item prompt: deterministic appearance-only authority without mutable or secret context", () => {
  const before = structuredClone(knife), first = itemSpritePrompt(knife);
  assert.equal(first, itemSpritePrompt(knife)); assert.deepEqual(knife, before);
  const extra = { ...knife, id: "campaign_item_00000099", owner_id: "SECRET_OWNER", location_id: "SECRET_LOCATION", history: "SECRET_HISTORY", description: "SECRET_DESCRIPTION", transcript: "SECRET_TRANSCRIPT", biography: "SECRET_BIOGRAPHY" };
  assert.equal(itemSpritePrompt(extra), first); assert.doesNotMatch(first, /SECRET_|campaign_item_/);
  const exact = { ...knife, visual_description: "  Plain silver ring.\nNo engraving.  " };
  assert.ok(itemSpritePrompt(exact).includes(`Exact appearance:\n${exact.visual_description}\n\nInstructions:`));
  assert.equal(exact.visual_description, "  Plain silver ring.\nNo engraving.  ");
});
test("item prompt: literal geometry/simplicity and unsupported additions explicitly constrained", () => {
  const prompt = itemSpritePrompt(knife);
  for (const text of ["Depict exactly the described object", "literally and conservatively", "visual authority", "plain or simple", "Do not embellish", "unsupported", "symbols, gems, engravings, ornament, magical effects, straps or cloth unless explicitly described", "Do not redesign", "Do not infer rank, ownership, culture or lore", "No border, frame", "No presentation pedestal", "No floating particles", "No glow unless explicitly described", "Single object only", "Centered", "Fully visible", "Readable silhouette", "No scene", "No environment", "No text", "Plain neutral background"]) assert.ok(prompt.includes(text), text);
  assert.doesNotMatch(prompt, /fantasy game inventory item|detailed consistent|anime fantasy illustration/);
  assert.ok(prompt.startsWith(`${RAENA_IMAGE_STACK.trigger} a clean inventory object illustration.`));
});
test("item prompt: described features win over generic exclusions; unnamed categories are stable", () => {
  const figurine = { name: "Figurine", visual_description: "A carved woman on a rectangular base." };
  const prompt = itemSpritePrompt(figurine);
  assert.ok(prompt.includes(figurine.visual_description)); assert.match(prompt, /figure explicitly forming part/); assert.match(prompt, /base explicitly belonging/);
  assert.match(prompt, /Category:\nmiscellaneous/); assert.ok(itemSpritePrompt(knife, "Custom illustration of").startsWith("Custom illustration of"));
});
test("item negative prompt: supported fal wire field, concise item-specific exclusions and no context", () => {
  for (const term of ["decorative frame", "border", "text", "watermark", "hands", "extra person", "scene", "presentation pedestal", "floating particles", "unsupported ornament", "unrequested glow", "unrequested symbols"]) assert.ok(ITEM_SPRITE_NEGATIVE_PROMPT.includes(term));
  assert.doesNotMatch(ITEM_SPRITE_NEGATIVE_PROMPT, /campaign_item_|SECRET_|owner_id|location_id/);
  const client = new FalImageClient(RAENA_IMAGE_STACK);
  const body = client.requestBody({ prompt: itemSpritePrompt(knife), negative_prompt: ITEM_SPRITE_NEGATIVE_PROMPT, width: 992, height: 992, seed: 123 });
  assert.equal(body.negative_prompt, ITEM_SPRITE_NEGATIVE_PROMPT);
  const portraitBody = client.requestBody({ prompt: "Portrait", width: 992, height: 992, seed: 123 });
  assert.equal("negative_prompt" in portraitBody, false, "item exclusions never leak into portrait requests");
});
