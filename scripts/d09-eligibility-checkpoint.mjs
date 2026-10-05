/** Evaluation-only read-only checkpoint. Never changes a campaign or dispatches a provider. */
import {statementProvenance} from '../.build/src/turn/structured/reflection-v22.js';

export function inspectEligibilityCheckpoint(snapshot, catalog, characterId) {
  const statements=statementProvenance(catalog,characterId).map(link=>({...link,quote:catalog.find(e=>e.ref===link.statement_ref)?.payload.quote}));
  const distinct=statements.length>=2 && new Set(statements.map(s=>s.origin_revision)).size>=2;
  const respect=catalog.filter(e=>e.evidence_type==='relationship_change'&&e.owner_character_id===characterId&&e.payload.other_id==='nicco'&&e.payload.dimension==='respect');
  const levels=['none','low','moderate','high'];
  const trajectory=respect.length>=2 && new Set(respect.map(e=>e.revision)).size>=2
    && respect.every((e,i)=>levels.indexOf(e.payload.to)>levels.indexOf(e.payload.from)&&(!i||respect[i-1].payload.to===e.payload.from));
  return {revision:snapshot.revision,character_id:characterId,statement_authorities:statements,
    first_statement:statements[0]??null,two_independent_statement_authorities:distinct,
    action:distinct?'STOP SELF-STATEMENT DEVELOPMENT; validate relevance, semantic eligibility and normal packing before any A/B':statements.length?'FIRST STATEMENT RECORDED; bounded topic-only continuation permitted':'NO QUALIFYING STATEMENT AUTHORITY',
    stop_self_statement_development:distinct,
    respect_history:respect,stop_respect_development:trajectory,
    reflection_notes:snapshot.premium_reflections.find(r=>r.character_id===characterId)?.notes??[],
    reminder:'Authority does not prove usefulness or unique marginal value. Normal maintenance must not be suppressed, forced or edited.'};
}
