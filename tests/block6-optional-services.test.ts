import test from "node:test";
import assert from "node:assert/strict";
import { OPTIONAL_SERVICE_DEFAULTS, OPTIONAL_SERVICE_NAMES, OFF_CONTRACT, OptionalServiceMonitor, effectiveOptionalServices, resolveOptionalServices } from "../src/app/optional-services.js";
import { turnFixture } from "../src/dev/support/turn-fixture.js";
import { createSaveFile, serializeSave } from "../src/persistence/save-format.js";

test("block 6 registry: defaults are the decided policy and resolution is deterministic", () => {
  assert.deepEqual({ ...OPTIONAL_SERVICE_DEFAULTS }, { reflection: false, mannerism_learning: true, portrait_generation: true, item_sprite_generation: true, sprite_qa: false, semantic_retrieval: false });
  assert.deepEqual(resolveOptionalServices({}, {}), resolveOptionalServices({}, {}));
  assert.equal(resolveOptionalServices({}, {}).sprite_qa, false);
  assert.equal(resolveOptionalServices({}, {}).semantic_retrieval, false);
  assert.ok(Object.isFrozen(resolveOptionalServices({}, {})));
});

test("block 6 registry: precedence defaults < environment < explicit; every service is independently switchable", () => {
  for (const name of OPTIONAL_SERVICE_NAMES) {
    const off = resolveOptionalServices({ [name]: false }, {}), on = resolveOptionalServices({ [name]: true }, {});
    assert.equal(off[name], false); assert.equal(on[name], true);
    for (const other of OPTIONAL_SERVICE_NAMES) if (other !== name) assert.equal(off[other], OPTIONAL_SERVICE_DEFAULTS[other], `${name} must not move ${other}`);
  }
  assert.equal(resolveOptionalServices({}, { CALDREVAN_MANNERISM_LEARNING: "off" }).mannerism_learning, false);
  assert.equal(resolveOptionalServices({ mannerism_learning: true }, { CALDREVAN_MANNERISM_LEARNING: "off" }).mannerism_learning, true);
  assert.throws(() => resolveOptionalServices({}, { CALDREVAN_SPRITE_QA: "maybe" }));
});

test("block 6 registry: a flag can switch a wired service OFF but never invent a provider; semantic retrieval follows only its flag", () => {
  const none = effectiveOptionalServices({});
  for (const name of OPTIONAL_SERVICE_NAMES) assert.equal(none[name], false, name);
  const all = resolveOptionalServices({ reflection: true, sprite_qa: true, semantic_retrieval: true }, {});
  assert.equal(effectiveOptionalServices({ optional_services: all }).reflection, false, "no provider wired, flag ON: still unavailable");
  assert.equal(effectiveOptionalServices({ optional_services: all }).semantic_retrieval, true);
  assert.equal(effectiveOptionalServices({ optional_services: resolveOptionalServices({}, {}) }).semantic_retrieval, false);
});

test("block 6 OFF contract: every service has an exact, typed OFF row; enrichment kinds stay visible, media never produced", () => {
  for (const name of OPTIONAL_SERVICE_NAMES) { assert.equal(OFF_CONTRACT[name].produces_new, false); assert.equal(OFF_CONTRACT[name].re_enableable, true); assert.ok(OFF_CONTRACT[name].note.length > 10); }
  assert.equal(OFF_CONTRACT.reflection.narrator_sees_existing, true);
  assert.equal(OFF_CONTRACT.mannerism_learning.narrator_sees_existing, true);
  assert.equal(OFF_CONTRACT.portrait_generation.ui_shows_existing, true);
  assert.equal(OFF_CONTRACT.item_sprite_generation.ui_shows_existing, true);
});

test("block 6 flags are runtime configuration: they never appear in CampaignState or the save file", () => {
  const f = turnFixture(), snap = JSON.stringify(f.campaign.exportSnapshot()), saved = serializeSave(createSaveFile(f.campaign.exportSnapshot(), f.world, "2026-10-12T00:00:00.000Z"), f.world);
  for (const text of [snap, saved]) for (const needle of ["optional_services", "CALDREVAN_", "sprite_qa", "semantic_retrieval"]) assert.equal(text.includes(needle), false, needle);
});

test("block 6 monitor: records health and never needs a campaign; failure codes are sanitized", () => {
  const m = new OptionalServiceMonitor(resolveOptionalServices({}, {}));
  m.begin("mannerism_learning"); assert.equal(m.running, 1);
  m.fail("mannerism_learning", { code: "provider_failed" }); assert.equal(m.running, 0);
  m.begin("reflection"); m.fail("reflection", { code: "Bad Code <script>" });
  const h = m.snapshot();
  assert.equal(h.find(x => x.service === "mannerism_learning")!.last_error!.code, "provider_failed");
  assert.equal(h.find(x => x.service === "reflection")!.last_error!.code, "optional_service_error");
  assert.equal(h.length, OPTIONAL_SERVICE_NAMES.length);
});

test("block 6 production composition: defaults wire Mannerism only; reflection, sprite QA and semantic retrieval are not instantiated; each flag drops its provider", async () => {
  const saved = { k: process.env.OPENROUTER_API_KEY }; process.env.OPENROUTER_API_KEY = "test-key-not-real";
  try {
    const { createProductionDeps } = await import("../src/app/production.js");
    const dflt = await createProductionDeps({});
    assert.equal(dflt.optional_services!.semantic_retrieval, false); assert.equal(dflt.optional_services!.sprite_qa, false); assert.equal(dflt.optional_services!.reflection, false);
    assert.equal(dflt.reflection_provider, undefined); assert.equal(dflt.item_sprite_reviewer, undefined); assert.ok(dflt.mannerism_extractor);
    const off = await createProductionDeps({ enable_emergent_mannerisms: false });
    assert.equal(off.mannerism_extractor, undefined); assert.equal(off.optional_services!.mannerism_learning, false);
  } finally { if (saved.k === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = saved.k; }
});
