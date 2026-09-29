import type { EntityType, WorldEntity } from "../types/entities.js";
import type { WorldDocument } from "../types/knowledge.js";

export interface WorldSource { source: string; document: unknown }
export interface ValidatedWorldSource { source: string; document: WorldDocument }

export class WorldValidationError extends Error {
  constructor(
    public readonly source: string,
    public readonly entityId: string | undefined,
    public readonly field: string,
    reason: string,
  ) {
    super(`${source}${entityId ? ` [${entityId}]` : ""} ${field}: ${reason}`);
    this.name = "WorldValidationError";
  }
}

const idPattern = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const types = ["location", "character", "event", "faction", "item", "concept", "world_lore"] as const;
const common = ["id", "type", "name", "display_name", "parent", "aliases", "summary", "tags", "search_context", "content", "lifecycle", "knowledge"];
const subtypeFields: Record<EntityType, string[]> = {
  location: ["features", "connections"],
  character: ["role", "location", "traits", "relationships", "base_location", "work_location", "home_location", "species", "sex", "age_band", "appearance", "occupation", "purpose", "morality", "private_notes", "affiliations"],
  event: ["location", "related_locations", "characters", "participants", "time", "importance"],
  faction: ["members", "territory", "relations"],
  item: ["owner", "location", "container", "state"],
  concept: ["related_entities"],
  world_lore: ["category", "related_entities"],
};

/** Local shape checks run before any value is trusted as a TypeScript contract. */
class Check {
  constructor(readonly source: string, public entityId?: string) {}
  fail(field: string, reason: string): never {
    throw new WorldValidationError(this.source, this.entityId, field, reason);
  }
  object(value: unknown, field: string): Record<string, unknown> {
    if (value === null || typeof value !== "object" || Array.isArray(value) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      this.fail(field, "expected an object");
    }
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (typeof key !== "string" || !descriptor.enumerable || !("value" in descriptor)) {
        this.fail(field, "expected enumerable string-keyed data properties");
      }
    }
    return value as Record<string, unknown>;
  }
  keys(value: Record<string, unknown>, allowed: readonly string[], field: string): void {
    for (const key of Object.keys(value).sort()) {
      if (!allowed.includes(key)) this.fail(`${field}.${key}`, "unknown field");
    }
  }
  text(value: unknown, field: string, allowEmpty = false): string {
    if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
      this.fail(field, allowEmpty ? "expected a string" : "expected a nonempty string");
    }
    return value;
  }
  id(value: unknown, field: string): string {
    const id = this.text(value, field);
    if (!idPattern.test(id)) this.fail(field, "expected a lowercase snake_case ID");
    return id;
  }
  nullableId(value: unknown, field: string): void {
    if (value !== null) this.id(value, field);
  }
  choice(value: unknown, choices: readonly string[], field: string): void {
    if (typeof value !== "string" || !choices.includes(value)) {
      this.fail(field, `expected one of: ${choices.join(", ")}`);
    }
  }
  array(value: unknown, field: string): unknown[] {
    if (!Array.isArray(value)) this.fail(field, "expected an array");
    for (const key of Reflect.ownKeys(value)) {
      if (key !== "length" && (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)) {
        this.fail(field, "unexpected array property");
      }
    }
    for (let i = 0; i < value.length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        this.fail(`${field}[${i}]`, "expected a data entry; holes and accessors are invalid");
      }
    }
    return value;
  }
  strings(value: unknown, field: string, ids = false): void {
    const seen = new Set<string>();
    this.array(value, field).forEach((entry, i) => {
      const text = ids ? this.id(entry, `${field}[${i}]`) : this.text(entry, `${field}[${i}]`);
      if (ids && seen.has(text)) this.fail(`${field}[${i}]`, `duplicate ID ${text}`);
      seen.add(text);
    });
  }
  knowledge(value: unknown, field: string): void {
    const policy = this.object(value, field);
    this.keys(policy, ["visibility", "known_by", "awareness"], field);
    if ("awareness" in policy && (typeof policy.awareness !== "string" || !/^(?:public|specialized|private|local:[a-z][a-z0-9]*(?:_[a-z0-9]+)*)$/.test(policy.awareness))) this.fail(`${field}.awareness`, "expected public, specialized, private or local:<location_id>");
    const visibility = this.object(policy.visibility, `${field}.visibility`);
    this.keys(visibility, ["narrator", "player"], `${field}.visibility`);
    for (const audience of ["narrator", "player"]) {
      if (typeof visibility[audience] !== "boolean") this.fail(`${field}.visibility.${audience}`, "expected a boolean");
    }
    this.strings(policy.known_by, `${field}.known_by`, true);
  }
  edges(value: unknown, field: string, kind: boolean): void {
    const seen = new Set<string>();
    this.array(value, field).forEach((entry, i) => {
      const p = `${field}[${i}]`;
      const edge = this.object(entry, p);
      this.keys(edge, kind ? ["target", "kind", "description"] : ["target", "description"], p);
      const target = this.id(edge.target, `${p}.target`);
      if (seen.has(target)) this.fail(`${p}.target`, `duplicate ID ${target}`);
      seen.add(target);
      this.text(edge.description, `${p}.description`);
      if (kind) this.text(edge.kind, `${p}.kind`);
    });
  }
}

function validateShape(input: WorldSource): ValidatedWorldSource {
  const c = new Check(input.source);
  const doc = c.object(input.document, "$" );
  // Capture identity for diagnostics even when another envelope field is invalid.
  const identity = doc.entity && typeof doc.entity === "object" ? Object.getOwnPropertyDescriptor(doc.entity, "id") : undefined;
  if (identity && "value" in identity && typeof identity.value === "string") c.entityId = identity.value;
  c.keys(doc, ["schema_version", "entity", "chunks"], "$");
  if (doc.schema_version !== 1) c.fail("schema_version", "only schema version 1 is supported");
  const e = c.object(doc.entity, "entity");
  c.id(e.id, "entity.id");
  c.choice(e.type, types, "entity.type");
  const type = e.type as EntityType;
  c.keys(e, [...common, ...subtypeFields[type]], "entity");
  for (const key of ["name", "display_name", "summary", "content"]) c.text(e[key], `entity.${key}`);
  c.text(e.search_context, "entity.search_context", true);
  c.nullableId(e.parent, "entity.parent");
  c.strings(e.aliases, "entity.aliases"); // Ambiguity is valid, including across entities.
  c.strings(e.tags, "entity.tags", true);
  if ("lifecycle" in e) c.choice(e.lifecycle, ["active", "inactive", "destroyed", "dead", "retired"], "entity.lifecycle");
  if ("knowledge" in e) c.knowledge(e.knowledge, "entity.knowledge");
  switch (type) {
    case "location":
      c.array(e.features, "entity.features").forEach((feature, i) => {
        const p = `entity.features[${i}]`;
        const f = c.object(feature, p);
        c.keys(f, ["name", "description"], p);
        c.text(f.name, `${p}.name`); c.text(f.description, `${p}.description`);
      });
      c.edges(e.connections, "entity.connections", false);
      break;
    case "character":
      c.choice(e.role, ["player", "npc"], "entity.role");
      if ("base_location" in e) {
        if ("location" in e) c.fail("entity.location", "use base_location or legacy location, never both");
        for (const key of ["base_location", "work_location", "home_location"]) c.nullableId(e[key], `entity.${key}`);
        for (const key of ["species", "age_band", "appearance", "occupation", "purpose", "morality"]) {
          if (e[key] !== null) {
            const value = c.text(e[key], `entity.${key}`);
            if (value.length > (["appearance", "purpose", "morality"].includes(key) ? 800 : 200)) c.fail(`entity.${key}`, "character field exceeds bound");
          }
        }
        if (e.sex !== null) c.choice(e.sex, ["male", "female", "intersex"], "entity.sex");
        c.strings(e.affiliations, "entity.affiliations", true);
        if ((e.affiliations as unknown[]).length > 24) c.fail("entity.affiliations", "at most 24 affiliations");
        if ("private_notes" in e && c.text(e.private_notes, "entity.private_notes").length > 1600) c.fail("entity.private_notes", "at most 1600 characters");
        if (c.array(e.traits, "entity.traits").length > 24) c.fail("entity.traits", "at most 24 traits");
        (e.traits as unknown[]).forEach((t, i) => { if (c.text(t, `entity.traits[${i}]`).length > 200) c.fail(`entity.traits[${i}]`, "at most 200 characters"); });
        if (!e.knowledge) c.fail("entity.knowledge", "canonical character contract requires explicit knowledge policy");
      } else {
        c.nullableId(e.location, "entity.location");
        for (const key of ["work_location", "home_location", "species", "sex", "age_band", "appearance", "occupation", "purpose", "morality", "private_notes", "affiliations"]) if (key in e) c.fail(`entity.${key}`, "extended character fields require the complete base_location contract");
      }
      c.strings(e.traits, "entity.traits");
      c.edges(e.relationships, "entity.relationships", true);
      break;
    case "event":
      c.nullableId(e.location, "entity.location");
      for (const key of ["characters", "participants"]) c.strings(e[key], `entity.${key}`, true);
      if ("related_locations" in e) c.strings(e.related_locations, "entity.related_locations", true);
      if (e.time !== null) {
        const time = c.object(e.time, "entity.time");
        c.keys(time, ["world_minute"], "entity.time");
        if (!Number.isSafeInteger(time.world_minute)) c.fail("entity.time.world_minute", "expected a safe integer");
      }
      c.choice(e.importance, ["minor", "significant", "major"], "entity.importance");
      break;
    case "faction":
      c.strings(e.members, "entity.members", true);
      c.strings(e.territory, "entity.territory", true);
      c.edges(e.relations, "entity.relations", true);
      break;
    case "item": {
      const placements = ["owner", "location", "container"].filter(key => Object.hasOwn(e, key));
      if (placements.length !== 1) c.fail("entity", "item requires exactly one of owner/location/container");
      const placement = placements[0]!;
      c.id(e[placement], `entity.${placement}`);
      const state = c.object(e.state, "entity.state");
      for (const key of Object.keys(state).sort()) {
        c.id(key, `entity.state.${key}`);
        if ([...common, ...Object.values(subtypeFields).flat()].includes(key)) c.fail(`entity.state.${key}`, "structured fields cannot be hidden in state");
        const value = state[key];
        if (!(value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)))) {
          c.fail(`entity.state.${key}`, "expected a finite number, string, boolean, or null");
        }
      }
      break;
    }
    case "world_lore":
      c.choice(e.category, ["fundamentals", "history", "cultures", "races", "magic", "religion"], "entity.category");
      c.strings(e.related_entities, "entity.related_entities", true);
      break;
    case "concept": c.strings(e.related_entities, "entity.related_entities", true); break;
  }
  c.array(doc.chunks, "chunks").forEach((entry, i) => {
    const p = `chunks[${i}]`;
    const chunk = c.object(entry, p);
    c.keys(chunk, ["id", "entity_id", "section", "summary", "search_context", "content", "tags", "knowledge"], p);
    c.id(chunk.entity_id, `${p}.entity_id`);
    if (chunk.entity_id !== e.id) c.fail(`${p}.entity_id`, "chunk must belong to its enclosing entity");
    c.id(chunk.section, `${p}.section`);
    if (chunk.id !== `${chunk.entity_id}.${chunk.section}`) c.fail(`${p}.id`, "expected <entity_id>.<section>");
    c.text(chunk.summary, `${p}.summary`); c.text(chunk.content, `${p}.content`);
    c.text(chunk.search_context, `${p}.search_context`, true);
    c.strings(chunk.tags, `${p}.tags`, true);
    if ("knowledge" in chunk) c.knowledge(chunk.knowledge, `${p}.knowledge`);
  });
  return { source: input.source, document: input.document as WorldDocument };
}

/** Validates the complete dataset; fails at the first error in source-path order. */
export function validateWorldSources(inputs: readonly WorldSource[]): ValidatedWorldSource[] {
  const sources = [...inputs].sort((a, b) => a.source < b.source ? -1 : a.source > b.source ? 1 : 0).map(validateShape);
  const entities = new Map<string, WorldEntity>();
  const chunks = new Set<string>();
  for (const { source, document } of sources) {
    const e = document.entity;
    const c = new Check(source, e.id);
    if (entities.has(e.id)) c.fail("entity.id", `duplicate entity ID ${e.id}`);
    entities.set(e.id, e);
    document.chunks.forEach((chunk, i) => {
      if (chunks.has(chunk.id)) c.fail(`chunks[${i}].id`, `duplicate chunk ID ${chunk.id}`);
      chunks.add(chunk.id);
    });
  }
  for (const { source, document } of sources) {
    const e = document.entity;
    const c = new Check(source, e.id);
    const ref = (id: string | null, field: string, allowed?: readonly EntityType[]) => {
      if (id === null) return;
      const target = entities.get(id);
      if (!target) return c.fail(field, `unknown entity ${id}`);
      if (allowed && !allowed.includes(target.type)) c.fail(field, `${id} must reference type ${allowed.join(" or ")}`);
    };
    const refs = (ids: readonly string[], field: string, allowed?: readonly EntityType[]) => ids.forEach((id, i) => ref(id, `${field}[${i}]`, allowed));
    ref(e.parent, "entity.parent", [e.type]);
    const knowledge = (policy: WorldEntity["knowledge"], field: string) => {
      if (!policy) return;
      refs(policy.known_by, `${field}.known_by`, ["character"]);
      if (policy.awareness?.startsWith("local:")) ref(policy.awareness.slice(6), `${field}.awareness`, ["location"]);
      policy.known_by.forEach((id, i) => {
        const target = entities.get(id);
        if (id === "nicco" || (target?.type === "character" && target.role !== "npc")) c.fail(`${field}.known_by[${i}]`, "known_by must reference an NPC; player knowledge uses visibility.player");
      });
    };
    knowledge(e.knowledge, "entity.knowledge");
    document.chunks.forEach((chunk, i) => knowledge(chunk.knowledge, `chunks[${i}].knowledge`));
    switch (e.type) {
      case "location": e.connections.forEach((edge, i) => ref(edge.target, `entity.connections[${i}].target`, ["location"])); break;
      case "character":
        if (e.base_location !== undefined) {
          ref(e.base_location, "entity.base_location", ["location"]);
          ref(e.work_location ?? null, "entity.work_location", ["location"]);
          ref(e.home_location ?? null, "entity.home_location", ["location"]);
          refs(e.affiliations ?? [], "entity.affiliations", ["faction", "concept"]);
        } else ref(e.location ?? null, "entity.location", ["location"]);
        e.relationships.forEach((edge, i) => ref(edge.target, `entity.relationships[${i}].target`, ["character"]));
        break;
      case "event":
        ref(e.location, "entity.location", ["location"]);
        refs(e.related_locations ?? [], "entity.related_locations", ["location"]);
        refs(e.characters, "entity.characters", ["character"]);
        refs(e.participants, "entity.participants", ["character", "faction"]);
        e.characters.forEach((id, i) => { if (!e.participants.includes(id)) c.fail(`entity.characters[${i}]`, "event characters must be a subset of participants"); });
        break;
      case "faction":
        refs(e.members, "entity.members", ["character"]);
        refs(e.territory, "entity.territory", ["location"]);
        e.relations.forEach((edge, i) => ref(edge.target, `entity.relations[${i}].target`, ["faction"]));
        break;
      case "item":
        if (e.owner !== undefined) ref(e.owner, "entity.owner", ["character", "faction"]);
        if (e.location !== undefined) ref(e.location, "entity.location", ["location"]);
        if (e.container !== undefined) {
          ref(e.container, "entity.container", ["item"]);
          if (e.container === e.id) c.fail("entity.container", "item cannot contain itself");
        }
        break;
      case "concept": case "world_lore": refs(e.related_entities, "entity.related_entities"); break;
    }
  }
  // References are now known to exist; walk explicit edges, never ID substrings.
  for (const field of ["parent", "container"] as const) {
    const finished = new Set<string>();
    for (const { source, document } of sources) {
      const chain = new Set<string>();
      let current: WorldEntity | undefined = document.entity;
      while (current && !finished.has(current.id)) {
        if (chain.has(current.id)) new Check(source, document.entity.id).fail(`entity.${field}`, `${field} cycle through ${current.id}`);
        chain.add(current.id);
        const next: string | null | undefined = field === "parent" ? current.parent : current.type === "item" ? current.container : undefined;
        current = next ? entities.get(next) : undefined;
      }
      for (const id of chain) finished.add(id);
    }
  }
  return sources;
}
