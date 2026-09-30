import { parseCampaignProposal } from "../campaign/validation.js";
import type { CampaignCommand } from "../campaign/types.js";
import { ProviderError } from "./errors.js";

type Schema = { type?: string; enum?: readonly unknown[]; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: false; items?: Schema; maxItems?: number; anyOf?: Schema[] };
const string: Schema = { type: "string" }, integer: Schema = { type: "integer" };
const choice = (...values: string[]): Schema => ({ type: "string", enum: values });
const object = (properties: Record<string, Schema>): Schema => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const position: Schema = { anyOf: [object({ kind: choice("carried"), character_id: string }),
  object({ kind: choice("equipped"), character_id: string, slot: string, mode: choice("worn", "held") })] };
/** Deliberately small Phase 1K vocabulary. Relationship and arbitrary runtime edits are excluded. */
export const CONTROLLER_SCHEMA = object({ commands: { type: "array", maxItems: 8, items: { anyOf: [
  object({ kind: choice("place_item"), item_id: string, position }),
  object({ kind: choice("transfer_item"), item_id: string, owner_id: string, position }),
  object({ kind: choice("schedule_event"), id: string, title: string, scheduled_world_minute: integer, participants: { type: "array", items: string, maxItems: 16 } }),
  object({ kind: choice("set_knowledge"), knowledge: object({ character_id: string, fact_id: string, status: choice("knows", "believes", "suspects", "heard_rumor"),
    provenance: object({ source_character_id: string, acquisition_kind: choice("told") }) }) }),
  // Repair 1: class-B physical conditions only (full resulting list); status/presentation are not proposable.
  object({ kind: choice("set_condition"), character_id: string, conditions: { type: "array", items: string, maxItems: 8 } }),
  // Runtime Continuity Repair 1: a present temporary (created) character narrated as actually leaving the scene.
  object({ kind: choice("leave_scene"), character_id: string }),
] } } });
function matches(value: unknown, schema: Schema): boolean {
  if (schema.anyOf) return schema.anyOf.some(s => matches(value, s));
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type === "string") return typeof value === "string";
  if (schema.type === "integer") return typeof value === "number" && Number.isSafeInteger(value);
  if (schema.type === "array") return Array.isArray(value) && value.length <= (schema.maxItems ?? Infinity) && value.every(v => matches(v, schema.items!));
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const obj = value as Record<string, unknown>;
    return Object.keys(obj).every(k => Object.hasOwn(schema.properties!, k)) && schema.required!.every(k => Object.hasOwn(obj, k)) &&
      Object.entries(obj).every(([k, v]) => matches(v, schema.properties![k]!));
  }
  return false;
}
export function parseControllerProposal(text: string): readonly CampaignCommand[] {
  try {
    const value: unknown = JSON.parse(text);
    if (!matches(value, CONTROLLER_SCHEMA)) throw new Error();
    // Revision is an internal parsing placeholder, never a proposed/committable revision.
    return parseCampaignProposal({ expected_revision: 0, commands: (value as { commands: unknown }).commands }).commands;
  } catch { throw new ProviderError("structured_output_invalid"); }
}
/**
 * Phase 1O: the same command vocabulary, each command paired with a short verbatim evidence quote from the final narration.
 * The quote never authorizes anything by itself; see docs/architecture/EVIDENCE_AUTHORIZATION.md.
 */
export const EVIDENCE_QUOTE_MAX = 240;
export const CONTROLLER_EVIDENCE_SCHEMA = object({ commands: { type: "array", maxItems: 8, items: object({ command: CONTROLLER_SCHEMA.properties!.commands!.items!, evidence_quote: string }) } });
export interface ProposedCommandWithEvidence { readonly command: CampaignCommand; readonly evidence_quote: string }
/** Parses the evidence shape; commands pass the same strict vocabulary and campaign validation as parseControllerProposal. */
/**
 * Controller Reliability Pass 1: deterministic, lossless structural normalization, applied only after both strict parses fail.
 * Rule R1_FLAT_COMMAND_WITH_EVIDENCE: an entry that is a complete flat command (exactly one command schema matches its non-evidence
 * fields, no extra field) plus exactly one string evidence field named as a known contract field (`evidence_quote`, or `evidence`,
 * the ControllerResult field) becomes `{ command, evidence_quote }`. Canonical entries pass unchanged. Anything else, including a
 * nested `command` beside flat fields, two evidence keys, a non-string evidence, a flat entry without evidence, or any unknown or
 * missing field, rejects the whole output. Nothing is inferred, defaulted or repaired; the result still goes through the strict parser.
 */
export const NORMALIZATION_RULE = "R1_FLAT_COMMAND_WITH_EVIDENCE";
const EVIDENCE_KEYS = ["evidence_quote", "evidence"] as const;
export interface ControllerNormalization { readonly attempted: boolean; readonly raw_shape: string; readonly rule: string | null; readonly normalized_json: string | null; readonly reason: string }
export function normalizeControllerOutput(text: string): ControllerNormalization {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return { attempted: false, raw_shape: "invalid_json", rule: null, normalized_json: null, reason: "invalid_json" }; }
  const obj = value as { commands?: unknown };
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).join() !== "commands" || !Array.isArray(obj.commands) || obj.commands.length > 8)
    return { attempted: false, raw_shape: "not_a_commands_array", rule: null, normalized_json: null, reason: "top_level_shape" };
  const commandSchemas = CONTROLLER_SCHEMA.properties!.commands!.items!.anyOf!;
  const shapes: string[] = [], out: unknown[] = [];
  let changed = false, failure: string | null = null;
  for (const entry of obj.commands as unknown[]) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) { shapes.push("non_object"); failure ??= "entry_not_object"; continue; }
    const e = entry as Record<string, unknown>, keys = Object.keys(e);
    if ("command" in e) {
      const canonical = keys.length === 2 && keys.includes("evidence_quote") && typeof e.evidence_quote === "string" && matches(e.command, CONTROLLER_SCHEMA.properties!.commands!.items!);
      shapes.push(canonical ? "canonical" : "command_wrapper_invalid"); if (!canonical) failure ??= "kind" in e ? "conflicting_nested_and_flat" : "invalid_wrapper";
      out.push(e); continue;
    }
    const evidenceKeys = EVIDENCE_KEYS.filter(k => k in e);
    if (evidenceKeys.length !== 1) { shapes.push(evidenceKeys.length ? "flat_multiple_evidence" : "flat_without_evidence"); failure ??= evidenceKeys.length ? "conflicting_evidence_fields" : "missing_evidence"; continue; }
    const key = evidenceKeys[0]!, quote = e[key];
    if (typeof quote !== "string") { shapes.push("flat_evidence_not_string"); failure ??= "evidence_not_string"; continue; }
    const command = Object.fromEntries(Object.entries(e).filter(([k]) => k !== key));
    const mapped = commandSchemas.filter(s => matches(command, s));
    if (mapped.length !== 1) { shapes.push("flat_command_invalid"); failure ??= mapped.length ? "multiple_mappings" : "command_does_not_match_schema"; continue; }
    shapes.push(`flat_with_${key}`); out.push({ command, evidence_quote: quote }); changed = true;
  }
  const raw_shape = `commands[${shapes.join(",")}]`;
  if (failure) return { attempted: true, raw_shape, rule: null, normalized_json: null, reason: failure };
  if (!changed) return { attempted: true, raw_shape, rule: null, normalized_json: null, reason: "nothing_to_normalize" };
  return { attempted: true, raw_shape, rule: NORMALIZATION_RULE, normalized_json: JSON.stringify({ commands: out }), reason: "normalized" };
}
/** Repair 1.2: why a controller output failed strict parsing (diagnostics only; parsing itself is unchanged). */
export function diagnoseControllerOutput(text: string): string {
  let value: unknown;
  try { value = JSON.parse(text); } catch (error) { return `json_parse_error: ${(error as Error).message}`; }
  const evidence = matches(value, CONTROLLER_EVIDENCE_SCHEMA), legacy = matches(value, CONTROLLER_SCHEMA);
  if (!evidence && !legacy) return "schema_mismatch: output matches neither the evidence nor the legacy controller schema";
  const commands = evidence ? (value as { commands: { command: unknown }[] }).commands.map(c => c.command) : (value as { commands: unknown }).commands;
  try { parseCampaignProposal({ expected_revision: 0, commands }); } catch (error) { return `campaign_validation_error: ${(error as Error).message}`; }
  return "unknown: output parses when re-checked";
}
export function parseControllerEvidenceProposal(text: string): readonly ProposedCommandWithEvidence[] {
  try {
    const value: unknown = JSON.parse(text);
    if (!matches(value, CONTROLLER_EVIDENCE_SCHEMA)) throw new Error();
    const items = (value as { commands: { command: unknown; evidence_quote: string }[] }).commands;
    const commands = parseCampaignProposal({ expected_revision: 0, commands: items.map(i => i.command) }).commands;
    return commands.map((command, i) => ({ command, evidence_quote: items[i]!.evidence_quote }));
  } catch { throw new ProviderError("structured_output_invalid"); }
}
