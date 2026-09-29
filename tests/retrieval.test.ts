import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { stringify } from "yaml";
import { WorldStore } from "../src/world/world-store.js";
import { loadWorld } from "../src/world/loader.js";
import { RuntimeState } from "../src/world/runtime-state.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { publicGetResult } from "../src/retrieval/policy.js";
import { RetrievalProjectionError } from "../src/retrieval/projections.js";
import { RETRIEVAL_LIMITS, RetrievalValidationError, validateFilter, validateWorldGetRequest, validateWorldSearchRequest } from "../src/retrieval/validation.js";
import type { ResolutionResult, WorldSearchResult } from "../src/retrieval/types.js";
import type { KnowledgeChunk } from "../src/types/knowledge.js";
import { document, fixtures, location, room } from "./fixtures.js";

const policy = (narrator = true, player = true) => ({ visibility: { narrator, player }, known_by: [] });
function example(id: string, name = id, aliases: string[] = []) {
  const entity = location(id);
  Object.assign(entity, { name, display_name: name, aliases, knowledge: policy() });
  return { source: `fixtures/${id}.yaml`, document: document(entity) };
}
function chunk(owner: string, section: string, knowledge?: ReturnType<typeof policy>): KnowledgeChunk {
  return { id: `${owner}.${section}`, entity_id: owner, section, summary: `Chunk ${section}`, content: `Passage ${section}`, search_context: "chunk cue", tags: ["passage"], ...(knowledge ? { knowledge } : {}) };
}
function hiddenSources() {
  const open = example("open", "Open", ["Shared"]);
  const hidden = example("hidden_owner", "HIDDEN_NAME", ["HIDDEN_ALIAS", "Shared"]);
  Object.assign(hidden.document.entity, { knowledge: policy(false, false), summary: "HIDDEN_SUMMARY", content: "HIDDEN_CONTENT", search_context: "HIDDEN_SEARCH", tags: ["hidden_tag"], features: [{ name: "HIDDEN_FEATURE", description: "HIDDEN_DESCRIPTION" }] });
  hidden.document.chunks.push(chunk("hidden_owner", "public", policy()), chunk("hidden_owner", "inherited"), chunk("hidden_owner", "narrator_only", policy(true, false)));
  const missing = example("unclassified"); delete missing.document.entity.knowledge;
  missing.document.chunks.push(chunk("unclassified", "public", policy()), chunk("unclassified", "inherited"));
  const secret = example("secret"); secret.document.entity.knowledge = policy(true, false);
  secret.document.chunks.push(chunk("secret", "inherited"), chunk("secret", "denied", policy(false, false)));
  const player = example("player_only"); player.document.entity.knowledge = policy(false, true);
  return [open, hidden, missing, secret, player];
}
function found(result: ResolutionResult): string {
  assert.equal(result.kind, "found");
  return result.kind === "found" ? result.candidate.entity_id : "";
}
const ids = (page: WorldSearchResult) => page.candidates.map(c => c.entity_id);

test("enumeration exposes sorted immutable entities and chunks with owner provenance", () => {
  const sources = hiddenSources().reverse();
  const world = new WorldStore(sources);
  const service = new RetrievalService(world);
  const source = service.indexSource();
  assert.deepEqual(world.listEntities().map(e => e.id), sources.map(s => s.document.entity.id).sort());
  assert.deepEqual(world.listChunks().map(c => c.id), sources.flatMap(s => s.document.chunks.map(c => c.id)).sort());
  assert.equal(source.datasetId(), world.datasetId);
  for (const c of source.chunks()) {
    assert.equal(c.entity_id, c.provenance.entity_id);
    assert.equal(c.chunk_id, c.id);
    assert.equal(c.provenance.source_path, `fixtures/${c.entity_id}.yaml`);
    assert.deepEqual(world.getChunkProvenance(c.id), world.getProvenance(c.entity_id));
    assert(!("name" in c)); assert(!("features" in c));
  }
  const record = source.entities().find(e => e.id === "hidden_owner")!;
  assert.equal(record.search_context, "HIDDEN_SEARCH"); // privileged index input, not tool output
  assert.equal(record.type, "location");
  assert(record.type === "location" && record.features[0]!.name === "HIDDEN_FEATURE");
  for (const value of [world.listEntities(), world.listChunks(), record, record.aliases, record.provenance, source, source.chunks()[0]!]) {
    assert(Object.isFrozen(value)); assert.throws(() => Object.assign(value, { invalid: true }), TypeError);
  }
  sources[0]!.document.entity.name = "Changed caller copy";
  assert(!source.entities().some(e => e.name === "Changed caller copy"));
});

test("dataset fingerprint ignores input/key/chunk ordering and paths but detects canonical changes", () => {
  const a = hiddenSources();
  const equivalent = structuredClone(a).reverse();
  for (const s of equivalent) {
    s.source = `/different/machine/${s.document.entity.id}.yaml`;
    s.document.entity = Object.fromEntries(Object.entries(s.document.entity).reverse()) as typeof s.document.entity;
    s.document.chunks.reverse();
  }
  const first = new WorldStore(a), second = new WorldStore(equivalent);
  assert.match(first.datasetId, /^sha256:[a-f0-9]{64}$/);
  assert.equal(first.datasetId, second.datasetId);
  equivalent[0]!.document.entity.content += " Meaningful change.";
  assert.notEqual(first.datasetId, new WorldStore(equivalent).datasetId);
  const changedChunk = hiddenSources(); changedChunk[1]!.document.chunks[0]!.content += " changed";
  assert.notEqual(first.datasetId, new WorldStore(changedChunk).datasetId);
  const changedPolicy = hiddenSources(); changedPolicy[0]!.document.entity.knowledge = policy(false, false);
  assert.notEqual(first.datasetId, new WorldStore(changedPolicy).datasetId);
  assert.equal(new WorldStore([]).datasetId, new WorldStore([]).datasetId);
});

test("loaded provenance is dataset-relative and equivalent physical roots have equal identity", async () => {
  const root = resolve(tmpdir());
  const directory = await mkdtemp(join(root, "caldrevan-retrieval-"));
  try {
    for (const folder of ["a", "b"]) {
      await mkdir(join(directory, folder, "locations"), { recursive: true });
      const value = stringify(example("sample").document);
      await writeFile(join(directory, folder, "locations", "sample.yaml"), folder === "b" ? `# Formatting does not change canon\n${value}` : value);
    }
    const a = await loadWorld(join(directory, "a")), b = await loadWorld(join(directory, "b"));
    assert.equal(a.datasetId, b.datasetId);
    assert.deepEqual(a.getProvenance("sample"), b.getProvenance("sample"));
    assert.equal(a.getProvenance("sample")!.source_path, "locations/sample.yaml");
    const text = await readFile(join(directory, "a", a.getProvenance("sample")!.source_path), "utf8");
    assert(text.includes("sample"));
  } finally {
    const rel = relative(root, resolve(directory));
    assert(rel && !rel.startsWith("..") && !rel.includes("/") && !rel.includes("\\") && basename(directory).startsWith("caldrevan-retrieval-"));
    await rm(directory, { recursive: true, force: true });
  }
});

test("exact precedence ID then canonical name then alias preserves ambiguity within its class", () => {
  const sources = [example("alpha", "Beacon", ["Shared", "Shared", " beta "]), example("beta", "Other", ["Beacon", "Shared"]), example("gamma", "BEACON", ["Other"]), example("delta", "alpha")];
  const service = new RetrievalService(new WorldStore(sources.reverse()));
  assert.equal(found(service.resolveEntityReference("alpha", "narrator")), "alpha");
  const names = service.resolveEntityReference("  bEaCoN  ", "narrator");
  assert.equal(names.kind, "ambiguous");
  if (names.kind === "ambiguous") { assert.equal(names.matched_by, "name"); assert.deepEqual(names.candidates.map(c => c.entity_id), ["alpha", "gamma"]); }
  const alias = service.resolveAlias(" shared ", "narrator");
  assert.equal(alias.kind, "ambiguous");
  if (alias.kind === "ambiguous") assert.deepEqual(alias.candidates.map(c => c.entity_id), ["alpha", "beta"]);
  assert.equal(found(service.resolveEntityReference("Other", "narrator")), "beta");
  assert.equal(found(service.resolveEntityReference("beta", "narrator")), "beta");
  assert.equal(found(service.resolveAlias("beta", "narrator")), "alpha");
  assert.equal(service.resolveEntityReference("Bea", "narrator").kind, "not_found");
  assert.equal(service.resolveEntityId("missing", "narrator").kind, "not_found");
  assert.throws(() => service.resolveEntityId(" alpha ", "narrator"), RetrievalValidationError);
  assert.throws(() => service.resolveEntityId("Alpha", "narrator"), RetrievalValidationError);
  assert.equal(service.resolveCanonicalName("Beacon!", "narrator").kind, "not_found");
});

test("bounded ambiguity pages preserve all matches and never mislabel a page as unique", () => {
  const service = new RetrievalService(new WorldStore(Array.from({ length: 11 }, (_, i) => example(`entry_${i}`, `Entry ${i}`, ["many"]))));
  const collected: string[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const result: ResolutionResult = service.resolveAlias("many", "narrator", { offset });
    assert.equal(result.kind, "ambiguous");
    if (result.kind !== "ambiguous") throw new Error("Expected ambiguity");
    assert(result.candidates.length <= 5);
    collected.push(...result.candidates.map(c => c.entity_id));
    offset = result.next_offset;
  }
  assert.equal(collected.length, 11);
  assert.deepEqual(collected, [...new Set(collected)].sort());
});

test("policy applies before resolution classes and hidden matches do not leak ambiguity", () => {
  const sources = hiddenSources();
  const hidden = sources[1]!;
  hidden.document.entity.name = "Open";
  const service = new RetrievalService(new WorldStore(sources));
  assert.equal(found(service.resolveEntityReference("Open", "narrator")), "open");
  assert.equal(found(service.resolveAlias("Shared", "narrator")), "open");
  assert.equal(service.resolveEntityId("hidden_owner", "narrator").kind, "not_found");
  assert.equal(service.resolveEntityReference("HIDDEN_ALIAS", "narrator").kind, "not_found");
  assert.equal(service.get({ entity_id: "unclassified" }, "narrator").kind, "not_visible");
  assert.deepEqual(publicGetResult(service.get({ entity_id: "hidden_owner" }, "narrator")), { kind: "not_found" });
  assert.deepEqual(publicGetResult(service.get({ entity_id: "absent" }, "narrator")), { kind: "not_found" });
  assert.equal(service.resolveEntityId("player_only", "narrator").kind, "not_found");
  assert.equal(found(service.resolveEntityId("player_only", "player")), "player_only");
  const secret = service.get({ entity_id: "secret" }, "narrator");
  assert(secret.kind === "found" && secret.record.secret);
  assert.equal(service.get({ entity_id: "secret" }, "player").kind, "not_visible");
});

test("allowed chunk overrides restricted or unclassified owner without leaking owner metadata", () => {
  const service = new RetrievalService(new WorldStore(hiddenSources()));
  for (const who of ["narrator", "player"] as const) {
    const result = service.get({ entity_id: "hidden_owner", chunk_id: "hidden_owner.public" }, who);
    assert(result.kind === "found" && result.record.kind === "chunk");
    assert.equal(result.record.entity_id, "hidden_owner");
    assert.equal(result.record.chunk_id, "hidden_owner.public");
    assert.equal(result.record.secret, false);
    const candidates = service.projectCandidates([{ entity_id: "hidden_owner" }, { entity_id: "hidden_owner", chunk_id: "hidden_owner.public" }], who);
    assert.equal(candidates.candidates.length, 1);
    for (const value of [result, candidates, service.resolveChunkId("hidden_owner.public", who)]) {
      const json = JSON.stringify(value);
      for (const sentinel of ["HIDDEN_NAME", "HIDDEN_ALIAS", "HIDDEN_SUMMARY", "HIDDEN_SEARCH", "HIDDEN_FEATURE", "HIDDEN_DESCRIPTION", "HIDDEN_CONTENT", "hidden_tag", "source_path", "fixtures/"]) assert(!json.includes(sentinel), sentinel);
    }
    assert.equal(service.get({ entity_id: "hidden_owner", chunk_id: "hidden_owner.inherited" }, who).kind, "not_visible");
    assert.equal(service.get({ entity_id: "unclassified", chunk_id: "unclassified.public" }, who).kind, "found");
    assert.equal(service.get({ entity_id: "unclassified", chunk_id: "unclassified.inherited" }, who).kind, "not_visible");
  }
  assert.equal(service.get({ entity_id: "secret", chunk_id: "secret.denied" }, "narrator").kind, "not_visible");
  assert.equal(service.get({ entity_id: "secret", chunk_id: "secret.inherited" }, "player").kind, "not_visible");
  assert.equal(service.resolveChunkId("hidden_owner.narrator_only", "player").kind, "not_found");
  const secret = service.get({ entity_id: "hidden_owner", chunk_id: "hidden_owner.narrator_only" }, "narrator");
  assert(secret.kind === "found" && secret.record.secret);
});

test("candidate projections are compact, immutable, deduplicated and reauthorized", () => {
  const world = new WorldStore(hiddenSources());
  const service = new RetrievalService(world);
  const result = service.projectCandidates([{ entity_id: "open" }, { entity_id: "open" }, { entity_id: "hidden_owner" }, { entity_id: "missing" }], "narrator");
  assert.deepEqual(ids(result), ["open"]);
  const c = result.candidates[0]!;
  for (const omitted of ["content", "features", "aliases", "search_context", "relationships", "knowledge", "source_path"]) assert(!(omitted in c));
  assert(!("source_path" in c.provenance));
  for (const object of [result, result.candidates, c, c.provenance]) assert.throws(() => Object.assign(object, { invalid: 1 }), TypeError);
  assert.throws(() => service.projectCandidates([{ entity_id: "open", summary: "injected" }], "narrator"), RetrievalValidationError);
  const full = service.get({ entity_id: "open" }, "narrator");
  assert(full.kind === "found");
  assert.throws(() => Object.assign(full.record, { content: "changed" }), TypeError);
  assert.notEqual(full.record, world.getEntity("open"));
  assert.equal(world.getEntity("open")!.content, "Test fixture, not canon.");
});

test("projection bounds fail explicitly, never silently truncate or expose denied oversized metadata", () => {
  const sources = hiddenSources();
  sources[0]!.document.entity.content = "x".repeat(RETRIEVAL_LIMITS.content + 1);
  sources[1]!.document.entity.summary = "HIDDEN".repeat(1000);
  const service = new RetrievalService(new WorldStore(sources));
  assert.equal(service.get({ entity_id: "open" }, "narrator").kind, "too_large");
  assert.equal(service.get({ entity_id: "hidden_owner" }, "narrator").kind, "not_visible");
  assert.equal(service.get({ entity_id: "hidden_owner", chunk_id: "hidden_owner.public" }, "narrator").kind, "found");
  assert.equal(service.resolveEntityId("open", "narrator").kind, "found"); // preview omits content
  sources[0]!.document.entity.summary = "x".repeat(RETRIEVAL_LIMITS.summary + 1);
  const longPreview = new RetrievalService(new WorldStore(sources));
  assert.throws(() => longPreview.resolveEntityId("open", "narrator"), RetrievalProjectionError);
});

test("structured filters use direct parents, canonical types/tags, AND between fields and explicit empty semantics", () => {
  const root = example("root"), child = example("child"), grandchild = example("grandchild");
  child.document.entity.parent = "root"; grandchild.document.entity.parent = "child";
  root.document.entity.tags = ["a"]; child.document.entity.tags = ["a", "b"]; grandchild.document.entity.tags = ["b"];
  const service = new RetrievalService(new WorldStore([grandchild, root, child]));
  assert.deepEqual(ids(service.filterEntities({ parent_ids: ["root"] }, "narrator")), ["child"]);
  assert.deepEqual(ids(service.filterEntities({ entity_types: ["location"], tags_all: ["a", "b"] }, "narrator")), ["child"]);
  assert.deepEqual(ids(service.filterEntities({ tags_any: ["a", "b"] }, "narrator")), ["child", "grandchild", "root"]);
  assert.deepEqual(ids(service.filterEntities({ tags_all: [] }, "narrator")), ["child", "grandchild", "root"]);
  for (const filter of [{ tags_any: [] }, { parent_ids: [] }, { entity_ids: [] }, { entity_types: [] }, { entity_ids: ["unknown"] }, { entity_types: ["faction"] }]) assert.deepEqual(ids(service.filterEntities(filter, "narrator")), []);
  const input = { tags_all: ["a"] }; const validated = validateFilter(input); input.tags_all.push("b");
  assert.deepEqual(validated.tags_all, ["a"]);
  assert(Object.isFrozen(validated.tags_all));
  assert.throws(() => service.filterEntities({ tags_any: ["A"] }, "narrator"), RetrievalValidationError);
});

test("name punctuation and accents are exact and a synthetic district can share a nation name", async () => {
  const nation = example("west", "West"), district = example("calderan_west", "west"), city = example("calderan", "Calderan");
  district.document.entity.parent = "calderan";
  const punctuated = example("hyphen", "Zul-Rath"), accented = example("accent", "Élan");
  const service = new RetrievalService(new WorldStore([nation, district, city, punctuated, accented]));
  assert.equal(service.resolveCanonicalName("West", "narrator").kind, "ambiguous");
  assert.deepEqual(ids(service.filterEntities({ entity_ids: ["west", "calderan_west"], parent_ids: ["calderan"] }, "narrator")), ["calderan_west"]);
  assert.equal(service.resolveEntityReference("Zul Rath", "narrator").kind, "not_found");
  assert.equal(service.resolveEntityReference("Elan", "narrator").kind, "not_found");
  assert.equal(found(service.resolveEntityReference("élan", "narrator")), "accent");
  assert.equal((await loadWorld("data")).hasEntity("calderan_west"), true);
});

test("request contracts reject malformed values, unknown keys, accessors, prototypes and sparse arrays", () => {
  for (const input of [null, [], {}, { query: " " }, { query: "x".repeat(513) }, { query: "x", limit: 0 }, { query: "x", limit: 6 }, { query: "x", limit: NaN }, { query: "x", limit: 1.5 }, { query: "x", filters: undefined }, { query: "x", execute: true }, Object.create({ query: "x" }), { query: 4 }]) assert.throws(() => validateWorldSearchRequest(input), RetrievalValidationError);
  for (const filter of [{ parent: "west" }, { ancestor_ids: ["west"] }, { entity_types: ["city"] }, { entity_ids: ["Bad ID"] }, { tags_all: [null] }, { tags_all: new Array(1) }, { tags_all: Object.assign([], { extra: true }) }, { tags_all: Array(65).fill("a") }, { tags_all: undefined }]) assert.throws(() => validateFilter(filter), RetrievalValidationError);
  let invoked = false;
  const accessor = Object.defineProperty({}, "query", { enumerable: true, get() { invoked = true; return "x"; } });
  assert.throws(() => validateWorldSearchRequest(accessor), RetrievalValidationError);
  const list = ["a"];
  Object.defineProperty(list, "0", { enumerable: true, get() { invoked = true; return "a"; } });
  assert.throws(() => validateFilter({ tags_any: list }), RetrievalValidationError);
  assert.equal(invoked, false);
  assert.throws(() => validateWorldSearchRequest({ query: "x", [Symbol("extra")]: true }), RetrievalValidationError);
  assert.deepEqual(validateWorldSearchRequest({ query: " Blackwater " }), { query: "Blackwater", limit: 5 });
  for (const input of [{}, { entity_id: "Blackwater" }, { chunk_id: "x.part" }, { entity_id: "x", chunk_id: "y.part" }, { entity_id: "x", chunk_id: undefined }, { entity_id: "x", source_path: "file" }]) assert.throws(() => validateWorldGetRequest(input), RetrievalValidationError);
  const service = new RetrievalService(new WorldStore([example("x")]));
  assert.equal(service.get({ entity_id: "x", chunk_id: "y.part" }, "narrator").kind, "invalid_request");
  assert.equal(service.get({ entity_id: "x", chunk_id: "x.missing" }, "narrator").kind, "not_found");
  assert.equal(service.get({ entity_id: "x" }, "invalid" as "narrator").kind, "invalid_request");
  for (const options of [{ limit: 6 }, { offset: -1 }, { offset: Number.MAX_SAFE_INTEGER }, { offset: undefined }, { extra: 1 }]) assert.throws(() => service.filterEntities({}, "narrator", options), RetrievalValidationError);
});

test("real canon resolution and filters return useful bounded results with no search engine", async () => {
  const world = await loadWorld("data"); const service = new RetrievalService(world);
  assert.equal(world.listEntities().length, 56); assert.equal(world.listChunks().length, 0);
  for (const [reference, id] of [["blackwater", "blackwater"], ["Blackwater", "blackwater"], ["The Unchained Haven", "blackwater"], ["The Port of Chains", "davenport"], ["The Fortress on the Edge", "ironbound"], ["West", "west"], ["Center", "center"]]) assert.equal(found(service.resolveEntityReference(reference, "narrator")), id);
  assert.deepEqual(ids(service.filterEntities({ entity_types: ["location"], parent_ids: ["west"] }, "narrator")), ["blackwater", "calderan", "davenport", "ironbound"]);
  const factionPage = service.filterEntities({ entity_types: ["faction"] }, "narrator");
  assert.deepEqual(ids(factionPage), ["artisans_guild", "church", "city_guard", "inquisition", "learned_arts_guild"]);
  assert.equal(factionPage.next_offset, 5);
  assert.deepEqual(ids(service.filterEntities({ entity_types: ["faction"] }, "narrator", { offset: 5 })), ["merchants_guild"]);
  let offset: number | null = 0; const geography: string[] = [];
  while (offset !== null) { const page: WorldSearchResult = service.filterEntities({ tags_any: ["geography"] }, "narrator", { offset }); geography.push(...ids(page)); offset = page.next_offset; }
  assert.equal(geography.length, 26); assert.deepEqual(geography, [...geography].sort());
  for (const entity of world.listEntities()) assert.equal(service.get({ entity_id: entity.id }, "narrator").kind, "found", entity.id);
  assert.equal(service.resolveEntityReference("Where are slaves sold near the border?", "narrator").kind, "not_found");
});

test("retrieval is deterministic and leaves canon, YAML, revision, time, mana and NPC positions untouched", async () => {
  const sources = fixtures();
  for (const s of sources) s.document.entity.knowledge = policy();
  const world = new WorldStore(sources);
  const runtime = new RuntimeState(world, { player_location: room, world_time: { world_minute: 1430 } });
  runtime.applySceneDelta({ mana_delta: -25 });
  const state = () => ({ revision: runtime.revision, scene: runtime.getSceneState(), npcs: runtime.getNpcLocations(), mana: runtime.getPlayerMana() });
  const before = state(); const canon = JSON.stringify(world.listEntities()); const dataset = world.datasetId;
  const yaml = await readFile("data/locations/west/blackwater.yaml", "utf8");
  const service = new RetrievalService(world);
  const equivalent = new RetrievalService(new WorldStore([...sources].reverse()));
  assert.deepEqual(service.indexSource().entities(), equivalent.indexSource().entities());
  assert.deepEqual(service.filterEntities({}, "narrator"), equivalent.filterEntities({}, "narrator"));
  assert.deepEqual(service.get({ entity_id: "brenna", chunk_id: "brenna.overview" }, "narrator"), equivalent.get({ entity_id: "brenna", chunk_id: "brenna.overview" }, "narrator"));
  service.resolveEntityId(room, "narrator"); service.resolveAlias("absent", "player");
  assert.deepEqual(state(), before);
  assert.equal(JSON.stringify(world.listEntities()), canon);
  assert.equal(await readFile("data/locations/west/blackwater.yaml", "utf8"), yaml);
  runtime.advanceTime(20);
  assert.equal(world.datasetId, dataset);
});
