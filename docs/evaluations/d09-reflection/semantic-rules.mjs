/**
 * D-09 semantic validator calibration: CANDIDATE deterministic rules, evaluation-only. Applied AFTER the unchanged production
 * validateProposals accepts a proposal. No model, embedding or provider call. Production code is not modified.
 *
 * Every rule reads only: proposal kind, label, text, cited refs, and the cited catalog entries' {kind, text}. Development text is the
 * deterministic output of production describeDevelopment(), so its template identifies the development kind and who owns it exactly.
 */

/** Ownership class of one catalog entry, recovered from the deterministic describeDevelopment() templates (src/turn/reflection.ts). */
export function ownership(entry, characterName) {
  const t = entry.text ?? '';
  if (entry.kind === 'canon') return 'canon';
  if (entry.kind === 'contract') return 'self_statement';
  if (entry.kind === 'relationship') return 'relationship_state';
  if (entry.kind === 'rollup') return 'aggregate';
  if (/^A household rule was added to a household .+ belongs to .*it is not .+'s act\.$/.test(t)) return 'membership_context';
  if (/ became a member of a household | left a household /.test(t)) return 'membership';
  if (/ explicitly described their own /.test(t)) return 'self_statement';
  if (/ moved from .+ to .+ \(revision/.test(t)) return 'self_move';
  if (/'s \w+ toward .+ moved .+ → /.test(t)) return t.startsWith(`${characterName}'s `) ? 'self_relationship_change' : 'other_relationship_change';
  if (/^The condition ".+" was (?:recorded for|removed from) /.test(t)) return 'condition_state';
  if (/legal status changed|A person transaction/.test(t)) return 'status_state';
  return 'unknown';
}

/** Character-level claim kinds: these say something about WHO the character is or how they act. shared_motif may stay environmental. */
const CHARACTER_KINDS = new Set(['signature_pattern', 'emerging_role', 'stance']);
const PASSIVE = new Set(['canon', 'membership', 'membership_context']);

/** Words that only restate household membership authority. */
const MEMBERSHIP_VOCAB = new Set(['household', 'member', 'membership', 'resident', 'residence', 'resides', 'belongs', 'belonging', 'inhabitant', 'tenant', 'occupant', 'house', 'home', 'present', 'presence']);
const STOP = new Set(['a', 'an', 'the', 'of', 'in', 'to', 'and', 'as', 'who', 'is', 'at', 'on', 'for', 'with', 'nicco', 'niccos', 'stable', 'continued', 'ongoing', 'long', 'term', 'current']);
const stem = w => w.slice(0, 5);

/** Absence / missing-provenance statements. They justify "unknown", never a tension. */
export const ABSENCE = /\b(?:not|never)\s+(?:\w+\s+){0,3}?(?:recorded|documented|attributed|stated|known|specified|noted|established|explained|given)\b|\b(?:none|nothing)\s+(?:\w+\s+){0,2}?(?:is|are|was|were)\s+(?:\w+\s+)?recorded\b|\b(?:unknown|unrecorded|undocumented|unattributed|unexplained|unclear|unspecified)\b|\bno\s+(?:recorded\s+|documented\s+|stated\s+)?(?:evidence|record|explanation|cause|reason|attribution|author\w*)\b|\bwithout\s+(?:\w+\s+){0,3}?(?:recorded|documented|attributed)\b/i;
const CONTRAST_SPLIT = /\b(?:but|while|yet|although|though|despite|even as|whereas|versus|vs)\b/i;

/**
 * Trait / temperament / disposition words that no recorded state change, membership or move can establish on its own.
 * Deliberately excludes relational-trust words ("cautious trust" over a recorded trust dimension is an accepted production example).
 */
export const TRAIT = /\b(?:passiv\w*|bystander\w*|recipient\w*|receptive\w*|reactiv\w*|impulsiv\w*|volatil\w*|erratic\w*|resign\w*|indifferen\w*|complian\w*|complia\w*|submissiv\w*|deferen\w*|obedien\w*|acquiesc\w*|accepting|acceptance|reluctan\w*|hesitan\w*|ambivalen\w*|restless\w*|unsettled|rootless\w*|aloof\w*|detached|withdrawn|stoic\w*|meek\w*|timid\w*)\b/i;

const words = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);

/**
 * Returns every candidate rule that fires (in priority order) for one ALREADY-ACCEPTED proposal. Empty array = still accepted.
 * catalog: [{ref, kind, text}]; character: {id, name}.
 */
export function semanticFindings(p, catalog, character) {
  const byRef = new Map(catalog.map(e => [e.ref, e]));
  const cited = p.evidence_refs.map(r => byRef.get(r)).filter(Boolean);
  const own = cited.map(e => ownership(e, character.name));
  const canonWords = new Set(catalog.filter(e => e.kind === 'canon').flatMap(e => words(e.text)).filter(w => w.length >= 4).map(stem));
  const claim = `${p.label.replaceAll('_', ' ')} ${p.text}`;
  const out = [];

  // 1. reflection_restates_authority: a character-level role/pattern whose LABEL contains nothing beyond membership authority or the
  //    character's own canon. A new role word that is not in canon ("quartermaster") is not a restatement and is left alone.
  if (CHARACTER_KINDS.has(p.kind)) {
    const content = words(p.label).filter(w => !STOP.has(w));
    if (content.length && content.every(w => MEMBERSHIP_VOCAB.has(w) || canonWords.has(stem(w))) && content.some(w => MEMBERSHIP_VOCAB.has(w)))
      out.push('reflection_restates_authority');
  }

  // 2. passive_membership_not_character_evidence: a character-level claim whose every cited source is canon, membership, or a
  //    household event the evidence itself says is not the character's act. Environment is not character evidence.
  if (CHARACTER_KINDS.has(p.kind) && own.length && own.every(o => PASSIVE.has(o)) && own.includes('membership_context'))
    out.push('passive_membership_not_character_evidence');

  // 3. tension_from_missing_provenance: an unresolved_tension whose contrast side is an absence statement ("but her role is not
  //    recorded"). Missing information is not a competing fact.
  if (p.kind === 'unresolved_tension') {
    const parts = p.text.split(CONTRAST_SPLIT);
    if (parts.length >= 2 && parts.slice(1).some(s => ABSENCE.test(s)) || parts.length >= 2 && ABSENCE.test(parts[0]) && /^\s*(?:although|though|while|despite)\b/i.test(p.text))
      out.push('tension_from_missing_provenance');
  }

  // 4. unsupported_character_inference: trait/temperament vocabulary in label or text when no cited source is the character's own
  //    statement. State changes, moves and memberships record what changed, never temperament.
  if (TRAIT.test(claim) && !own.includes('self_statement')) out.push('unsupported_character_inference');

  return out;
}
