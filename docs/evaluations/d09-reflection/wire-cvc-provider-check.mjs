/** Mechanical harness checks, no API or mutation. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {completionValidation} from './wire-cvc-provider-validation.mjs';
import {reflectionCitationContext} from '../../../.build/src/dev/reflection-v23-cvc.js';
const old=JSON.parse(readFileSync('saves/structured-reflection-wire-v2/preregistered-plan.json')),wire=JSON.parse(readFileSync('saves/d09-reflection-citation-visibility/wire-recheck.json')),samples=JSON.parse(readFileSync('saves/structured-reflection-wire-v2/local-samples.json')),c=old.screen[0],schema=wire.rows.find(r=>r.id===c.id).schema,context=reflectionCitationContext(c.request,c.evidence_catalog),p=samples.find(s=>s.id===c.id).proposal;
assert.ok(completionValidation(JSON.stringify({proposals:[p]}),schema,context).usable);
assert.ok(completionValidation('{"proposals":[]}',schema,context).usable);
const bad=completionValidation(JSON.stringify({proposals:[{...p,evidence_refs:['A prose summary']}]}),schema,context);assert.equal(bad.usable,false);assert.equal(bad.enum_violations[0].path,'$.proposals[0].evidence_refs[0]');assert.equal(bad.enum_violations[0].actual,'A prose summary');assert.equal(bad.enum_violations[0].enum_domain_size,context.evidence_refs.length);
const dup=completionValidation(JSON.stringify({proposals:[{...p,evidence_refs:[p.evidence_refs[0],p.evidence_refs[0]]}]}),schema,context);assert.equal(dup.structural.wire_valid,true);assert.equal(dup.structural.canonical_valid,false);assert.equal(dup.usable,false);
assert.equal(completionValidation('{"proposals":',schema,context).usable,false);
console.log('PASS: canonical usable, valid empty, exact enum violation path/value/domain, canonical-only uniqueness, malformed rejection; no repair');
