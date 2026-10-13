/** Reflection evidence catalog: typed, state-derived evidence records for one subject (Cleanup C; formerly the V2 catalog, V2.2 provenance and E1 rule-text join). */
import type { CampaignSnapshot, PremiumHistoryEntry } from "../../campaign/types.js";
import type { DeepReadonly } from "../../types/readonly.js";
import type { WorldStore } from "../../world/world-store.js";
import { npcDeepSources } from "../npc-plus.js";
import { reflectionEvidence, type ReflectionEvidence } from "../reflection.js";

type Payload = Record<string, unknown>;
export interface StructuredEvidence {
  readonly ref: string; readonly evidence_version: 2; readonly evidence_type: string;
  readonly subject_character_id: string; readonly owner_character_id: string | null;
  readonly revision: number | null; readonly world_minute: number | null;
  readonly event_id: string | null; readonly payload: Payload;
}
export interface EvidenceCatalog { readonly structured: readonly StructuredEvidence[]; readonly legacy: readonly ReflectionEvidence[] }
/** Structured source payloads, never English-template parsing. Unknown actor/provenance remains null. */
function baseReflectionEvidence(world: WorldStore, snapshot: DeepReadonly<CampaignSnapshot>, subject: string): EvidenceCatalog {
  const structured: StructuredEvidence[] = [];
  const add = (ref: string, evidence_type: string, payload: Payload, owner: string | null, revision: number | null, minute: number | null, event: string | null) =>
    structured.push({ ref, evidence_version: 2, evidence_type, subject_character_id: subject, owner_character_id: owner, revision, world_minute: minute, event_id: event, payload });
  for (const s of npcDeepSources(world, snapshot, subject)) {
    if (s.visibility !== "public") continue;
    if (s.kind === "history") {
      const e = JSON.parse(s.exact_payload) as PremiumHistoryEntry;
      const types: Record<string, string> = { moved: "movement", relationship_changed: "relationship_change", condition_added: "condition_change", condition_removed: "condition_change", joined_household: "household_membership", rejoined_household: "household_membership", left_household: "household_membership", migrated_member: "household_membership", household_rule_added: "household_context", contract_established: "statement_event", legal_status_changed: "legal_status", person_transaction: "transaction" };
      const owner = e.kind === "relationship_changed" ? e.actor_id : ["moved", "contract_established"].includes(e.kind) ? subject : null;
      add(s.handle, types[e.kind] ?? "other", { ...e }, owner, e.revision, e.world_minute, s.handle);
    } else if (s.kind === "contract") {
      const e = JSON.parse(s.exact_payload) as Payload;
      add(s.handle, "self_statement", e, subject, Number(e.revision), null, `statement:${subject}:${e.revision}:${e.field}`);
    } else if (s.kind === "canon") add(s.handle, "canon", { text: s.exact_payload }, null, null, null, null);
    else if (s.kind === "rollup") add(s.handle, "aggregate", JSON.parse(s.exact_payload) as Payload, null, null, null, null);
  }
  for (const e of snapshot.relationships.filter(e => (e.from_character_id === subject || e.to_character_id === subject) && e.dimensions && Object.values(e.dimensions).some(v => v !== "none")))
    add(`npcrel:${e.from_character_id}:${e.to_character_id}`, "relationship_snapshot", { target_character_id: e.to_character_id, dimensions: { ...e.dimensions } }, e.from_character_id, snapshot.revision, snapshot.runtime.scene.world_time.world_minute, null);
  return { structured, legacy: reflectionEvidence(world, snapshot, subject) };
}

export interface StatementProvenance { readonly statement_ref: string; readonly statement_id: string; readonly origin_revision: number; readonly field: string; readonly source_event_ref: string | null }
export interface ProvenanceEvidence extends StructuredEvidence {readonly provenance?:StatementProvenance}
/** Candidate catalog exposes identical quote/event identity; persisted production state is never rewritten. */
function provenanceReflectionEvidence(world:WorldStore,snapshot:DeepReadonly<CampaignSnapshot>,subject:string){const evidence=baseReflectionEvidence(world,snapshot,subject),links=statementProvenance(evidence.structured,subject);return {...evidence,structured:evidence.structured.map((e):ProvenanceEvidence=>{const provenance=links.find(l=>l.statement_ref===e.ref||l.source_event_ref===e.ref);return provenance?{...e,provenance}:e;})};}
/** Identity comes from authoritative contract revision/field, never quote similarity. Ambiguous identities have no link. */
export function statementProvenance(catalog: readonly StructuredEvidence[], subject: string): readonly StatementProvenance[] {
 const statements=catalog.filter(e=>e.evidence_type==="self_statement"&&e.subject_character_id===subject&&e.owner_character_id===subject);
 return statements.flatMap(e=>{
  const field=e.payload.field,revision=e.revision;
  if(typeof field!=="string"||!Number.isSafeInteger(revision)||revision===null||e.payload.revision!==revision||e.event_id!==`statement:${subject}:${revision}:${field}`||typeof e.payload.quote!=="string"||!e.payload.quote.trim())return [];
  if(statements.filter(s=>s.event_id===e.event_id).length!==1||catalog.filter(s=>s.ref===e.ref).length!==1)return [];
  const events=catalog.filter(s=>s.evidence_type==="statement_event"&&s.subject_character_id===subject&&s.owner_character_id===subject&&s.revision===revision&&s.payload.revision===revision&&s.payload.field===field&&s.payload.kind==="contract_established"&&s.event_id===s.ref);
  return [{statement_ref:e.ref,statement_id:e.event_id,origin_revision:revision,field,source_event_ref:events.length===1?events[0]!.ref:null}];
 });
}
/** Exact immutable rule identity/text joined from authoritative state; no categories authored here. */
export function reflectionEvidenceCatalog(world:WorldStore,snapshot:DeepReadonly<CampaignSnapshot>,subject:string){
 const base=provenanceReflectionEvidence(world,snapshot,subject);
 return {...base,structured:base.structured.map(e=>{if(e.evidence_type!=='household_context')return e;const rule=snapshot.households.find(h=>h.id===e.payload.household_id)?.rules?.find(r=>r.id===e.payload.rule_id);return rule&&rule.created_revision===e.revision?{...e,payload:{...e.payload,rule_text:rule.text}}:e;})};
}
