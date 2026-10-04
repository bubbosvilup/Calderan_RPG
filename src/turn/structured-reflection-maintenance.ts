import { createHash } from 'node:crypto';
import type { CampaignState } from '../campaign/campaign-state.js';
import type { ReflectionNote, ReflectionKind } from '../campaign/types.js';
import { freezeSnapshot, REFLECTION_LIMITS } from '../campaign/validation.js';
import type { WorldStore } from '../world/world-store.js';
import { characterView } from '../campaign/projections.js';
import { reflectionDue, type ReflectionProvider, type ReflectionRequest, type ReflectionRun, type Proposal } from './reflection.js';
import { emitReflectionDiagnostics } from './reflection-diagnostics.js';
import { ReflectionPacing, reflectionPacing, type StructuredReflectionAttempt } from './reflection-pacing.js';
import { E1_SCHEMA, E1_VERSION, structuredReflectionEvidenceE1, environmentalE1Context, citationScopedReflectionWireE1, evaluateStructuredOutputE1, type E1Context } from './structured/reflection-v23-cvc-e1.js';
import { schemaMatches, type StructuredProposal } from './structured/reflection-v2.js';
import { citationVisibilityViolations } from './structured/reflection-v23-cvc.js';
import { ProviderError } from '../llm/errors.js';
import { failureClass, technicalRetryReason } from '../llm/reliability.js';
import type { ProviderAttemptRecord } from '../llm/retry.js';
import { TurnError } from './turn-types.js';
/** Strict qualified envelope only; semantic rejection is intentionally outside the retry boundary. */
export function parseProductionReflection(text: string, request: ReflectionRequest, context: E1Context): readonly unknown[] {
    if (!text.trim())
        throw new ProviderError('structured_output_invalid', undefined, undefined, 'empty_output');
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    }
    catch {
        throw new ProviderError('structured_output_invalid', undefined, undefined, 'malformed_envelope');
    }
    if (!schemaMatches(request.wire_schema, raw) || !schemaMatches(E1_SCHEMA, raw))
        throw new ProviderError('structured_output_invalid', undefined, undefined, 'schema_invalid');
    const proposals = (raw as {
        proposals: StructuredProposal[];
    }).proposals;
    if (proposals.some(p => citationVisibilityViolations(p, context.citation).length || (p.claim.type === 'environmental_shared_rule_text' && (!context.citation.evidence_refs.includes(String(p.claim.anchor_ref)) || !p.evidence_refs.includes(String(p.claim.anchor_ref))))))
        throw new ProviderError('structured_output_invalid', undefined, undefined, 'schema_invalid');
    return proposals;
}
export function captureProductionReflection(campaign: CampaignState, world: WorldStore, id: string) {
    const snapshot = campaign.exportSnapshot(), catalog = structuredReflectionEvidenceE1(world, snapshot, id).structured;
    // All current snapshots remain authority-only. Exact event metadata exposes selected quote handles.
    const evidence = catalog.filter(e => e.evidence_type !== 'relationship_snapshot' && (e.evidence_type !== 'self_statement' || !catalog.some(v => v.evidence_type === 'statement_event' && (v as {
        provenance?: {
            statement_ref: string;
        };
    }).provenance?.statement_ref === e.ref)));
    const character = { id, name: characterView(snapshot, world, id).profile.name ?? id }, existing = snapshot.premium_reflections.find(r => r.character_id === id)?.notes ?? [], context = environmentalE1Context({ character, evidence }, catalog, snapshot), wire = citationScopedReflectionWireE1(context);
    const request = freezeSnapshot({ character, evidence, existing: existing.map(n => ({ kind: n.kind, label: n.label, text: n.text })), wire_schema: wire.schema, timeout_ms: 20000 }) as ReflectionRequest;
    return { snapshot, catalog, existing, context, wire, request };
}
const kinds: Record<string, ReflectionKind> = { relationship_trajectory: 'signature_pattern', relationship_parallel: 'signature_pattern', relationship_contrast: 'unresolved_tension', condition_trajectory: 'signature_pattern', membership_trajectory: 'signature_pattern', movement_trajectory: 'signature_pattern', self_statement_synthesis: 'stance', environmental_motif: 'shared_motif', environmental_shared_rule_text: 'shared_motif' };
const prefixes: Record<string, string> = { relationship_trajectory: 'rel_traj', relationship_parallel: 'rel_parallel', relationship_contrast: 'rel_contrast', condition_trajectory: 'condition', membership_trajectory: 'membership', movement_trajectory: 'movement', self_statement_synthesis: 'self_statement', environmental_motif: 'env_count', environmental_shared_rule_text: 'env_shared' };
function mergeStructuredNotes(existing: readonly ReflectionNote[], accepted: readonly {
    proposal: StructuredProposal;
    text: string;
}[], catalog: readonly {
    ref: string;
}[], revision: number, source: number): ReflectionNote[] {
    const live = new Set(catalog.map(e => e.ref)), notes: ReflectionNote[] = existing.flatMap(n => { if (n.structured)
        return n.evidence_refs.every(r => live.has(r)) ? [structuredClone(n)] : []; const refs = n.evidence_refs.filter(r => live.has(r)); return refs.length ? [{ ...structuredClone(n), evidence_refs: refs }] : []; }), fresh = new Set<string>();
    for (const n of accepted) {
        const p = n.proposal, kind = kinds[p.claim.type]!, label = `${prefixes[p.claim.type]}_${createHash('sha256').update(JSON.stringify(p.claim)).digest('hex').slice(0, 12)}`, match = notes.find(v => v.structured && v.kind === kind && v.label === label);
        const fields = { kind, label, text: n.text, evidence_refs: [...p.evidence_refs], confidence: p.confidence, updated_revision: revision, structured: { format_version: 1 as const, semantic_version: E1_VERSION as 'V2.3-CVC-E1', source_revision: source, proposal: { ...structuredClone(p), evidence_refs: [...p.evidence_refs] } } };
        if (match) {
            Object.assign(match, fields);
            fresh.add(match.id);
        }
        else {
            let serial = notes.length + 1, id = `r${revision}_${kind}_${serial}`;
            while (notes.some(v => v.id === id))
                id = `r${revision}_${kind}_${++serial}`;
            notes.push({ id, created_revision: revision, ...fields });
            fresh.add(id);
        }
    }
    return (['stance', 'signature_pattern', 'shared_motif', 'emerging_role', 'unresolved_tension'] as ReflectionKind[]).flatMap(kind => notes.filter(n => n.kind === kind).sort((a, b) => Number(fresh.has(b.id)) - Number(fresh.has(a.id)) || (['low', 'medium', 'high'].indexOf(b.confidence) - ['low', 'medium', 'high'].indexOf(a.confidence)) || b.updated_revision - a.updated_revision || a.id.localeCompare(b.id)).slice(0, REFLECTION_LIMITS[kind]));
}
const active = new WeakSet<CampaignState>();
export async function reflectStructuredAfterTurn(campaign: CampaignState, world: WorldStore, provider: ReflectionProvider, options: Parameters<typeof import('./reflection.js').reflectAfterTurn>[3] = {}): Promise<readonly ReflectionRun[]> {
    if (active.has(campaign))
        return [];
    active.add(campaign);
    const base = campaign.exportSnapshot(), due = base.premium_characters.filter(p => reflectionDue(base, p.character_id)).map(p => p.character_id), runs: ReflectionRun[] = [], started = performance.now(), pacing = options.pacing ?? reflectionPacing;
    try {
        for (const id of due.slice(0, options.max_characters ?? 1)) {
            const c = captureProductionReflection(campaign, world, id), source = c.snapshot.revision, logical = `${c.snapshot.campaign_id}:${id}:r${source}`, begin = performance.now(), details: StructuredReflectionAttempt[] = [], attempts: ProviderAttemptRecord = { attempts: 0, retry_reasons: [], failure_classes: [], logical_request_id: logical, recovered: false, provider_ms: 0, final_outcome: 'pending' }, empty = { character_id: id, accepted: [], rejected: [], notes: c.existing.length, logical_reflection_id: logical, source_revision: source, model: 'qwen/qwen3.8-flash', provider: 'Alibaba' };
            if (!c.catalog.length) {
                runs.push({ ...empty, status: 'no_evidence' });
                continue;
            }
            const checkpoint = () => { if (campaign.revision !== source)
                throw new TurnError('stale_turn'); };
            let output: Awaited<ReturnType<ReflectionProvider['reflect']>>, raw: readonly unknown[];
            try {
                const result = await pacing.serialized(async () => {
                    const deadline = pacing.now() + 60000, max = Math.min(2, Math.max(1, options.retry_policy?.max_attempts ?? 2));
                    for (let n = 1; n <= max; n++) {
                        checkpoint();
                        if (!await pacing.launch(deadline, checkpoint))
                            throw new ProviderError('timeout');
                        attempts.attempts = n;
                        const at = performance.now();
                        let response: Awaited<ReturnType<ReflectionProvider['reflect']>> | undefined;
                        try {
                            response = await provider.reflect({ ...c.request, timeout_ms: Math.floor(Math.min(20000, options.timeout_ms ?? 20000, deadline - pacing.now())) });
                            checkpoint();
                            const proposals = parseProductionReflection(response.text, c.request, c.context);
                            details.push({ attempt: n, model: response.model ?? empty.model, provider: response.provider ?? empty.provider, wire_valid: true, canonical_valid: true, visibility_valid: true, elapsed_ms: performance.now() - at, ...(response.cost_usd !== undefined ? { cost_usd: response.cost_usd } : {}) });
                            attempts.final_outcome = 'success';
                            attempts.recovered = n > 1;
                            return { response, proposals };
                        }
                        catch (error) {
                            const family = failureClass(error);
                            attempts.failure_classes!.push(family);
                            attempts.final_outcome = error instanceof ProviderError ? error.code : error instanceof TurnError ? 'stale_turn' : 'parser_failure';
                            let wire_valid: boolean | undefined, canonical_valid: boolean | undefined;
                            try {
                                const v = JSON.parse(response?.text ?? '');
                                wire_valid = schemaMatches(c.request.wire_schema, v);
                                canonical_valid = schemaMatches(E1_SCHEMA, v);
                            }
                            catch { }
                            details.push({ attempt: n, model: response?.model ?? empty.model, provider: response?.provider ?? empty.provider, failure_family: family, elapsed_ms: performance.now() - at, ...(wire_valid !== undefined ? { wire_valid } : {}), ...(canonical_valid !== undefined ? { canonical_valid } : {}), ...(response?.cost_usd !== undefined ? { cost_usd: response.cost_usd } : {}) });
                            if (error instanceof ProviderError && error.code === 'rate_limited')
                                pacing.rateLimited(n, (error as ProviderError & {
                                    retry_after_ms?: number;
                                }).retry_after_ms);
                            const retry = technicalRetryReason(error);
                            if (n === max || !retry)
                                throw error;
                            attempts.retry_reasons.push(retry);
                        }
                        finally {
                            pacing.completed();
                            attempts.provider_ms += performance.now() - at;
                        }
                    }
                    throw new ProviderError('invalid_provider_response');
                });
                output = result.response;
                raw = result.proposals;
            }
            catch (error) {
                runs.push({ ...empty, attempts, attempt_details: details, status: error instanceof TurnError ? 'stale' : error instanceof ProviderError && error.code === 'structured_output_invalid' ? 'malformed' : 'provider_failed', elapsed_ms: performance.now() - begin, provider_ms: attempts.provider_ms });
                continue;
            }
            const names = new Map([...world.getEntitiesByType('character').map(e => [e.id, e.name] as [
                    string,
                    string
                ]), ...c.snapshot.characters.flatMap(v => v.profile.name ? [[v.id, v.profile.name] as [
                        string,
                        string
                    ]] : [])]), result = evaluateStructuredOutputE1(raw, c.context, names), accepted: Proposal[] = result.accepted.map(n => ({ kind: kinds[n.proposal.claim.type]!, label: prefixes[n.proposal.claim.type]!, text: n.text, evidence_refs: n.proposal.evidence_refs, confidence: n.proposal.confidence })), rejected = result.diagnostics.filter(d => !d.accepted).map(d => ({ reason: d.reasons.join(','), proposal: d.proposal })), notes = mergeStructuredNotes(c.existing as ReflectionNote[], result.accepted, c.catalog, source + 1, source), measured = { ...empty, attempts, attempt_details: details, accepted, rejected, parsed_proposals: raw.length, semantic_result: accepted.length ? 'accepted' as const : rejected.length ? 'semantic_rejected' as const : 'no_useful_notes' as const, provider_ms: attempts.provider_ms, ...(output.usage ? { usage: output.usage } : {}), ...(output.cost_usd !== undefined ? { cost_usd: output.cost_usd } : {}) };
            try {
                checkpoint();
                campaign.apply({ expected_revision: source, commands: [{ kind: 'record_reflection', character_id: id, notes, reflected_revision: source }] });
            }
            catch (error) {
                runs.push({ ...measured, status: campaign.revision !== source ? 'stale' : 'persistence_failed', elapsed_ms: performance.now() - begin });
                continue;
            }
            const new_notes = notes.filter(n => !c.existing.some(v => v.id === n.id)).length;
            runs.push({ ...measured, status: 'committed', notes: notes.length, committed_revision: campaign.revision, new_notes, updated_notes: accepted.length - new_notes, elapsed_ms: performance.now() - begin });
        }
        return runs;
    }
    finally {
        active.delete(campaign);
        emitReflectionDiagnostics(options.diagnostics_sink, base.revision, campaign.revision, due, runs, performance.now() - started);
    }
}
