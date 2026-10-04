/** Offline controls and explicit primary-agent review manifest; no provider calls. */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { MannerismPortrayalGate } from '../../.build/src/turn/mannerism-portrayal-gate.js';
import { MANNERISM_SEEDS } from '../../.build/src/campaign/mannerism-seeds.js';
const root='saves/d26-shadow', read=n=>JSON.parse(readFileSync(`${root}/${n}.json`,'utf8'));
const characters=[{id:'brenna',name:'Brenna'},{id:'maren',name:'Maren'},{id:'gerome',name:'Gerome'},{id:'nicco',name:'Nicco'}];
function cue(key,id,state='emergent',known=[]){
 const seed=MANNERISM_SEEDS.find(s=>s.canonical_key===key);
 return {character_id:id,character_name:characters.find(c=>c.id===id).name,mannerism:{...seed,id:`test_${key}`,source:'seeded',created_revision:1,user_edited:false,epistemic_state:state,known_by_character_ids:known}};
}
const a=cue('pause_before_name','brenna'),b=cue('head_level_before_correction','maren'),c=cue('gaze_lower_before_lie','gerome');
const negatives=[
 ['generic-pause',a,'Brenna pauses to catch her breath.','Nobody is speaking.'],
 ['generic-head-tilt',b,'Maren tilts her head toward the window.','Factually correct.'],
 ['generic-head-stretch',b,'Maren levels her head to stretch her neck.','Factually correct.'],
 ['generic-gaze',c,'Gerome looks down at the floor.','No lie is involved.'],
 ['unrelated-again',b,'Maren waits. Footsteps sound again.',''],
 ['unrelated-usual',b,'Maren levels her head. The usual market route lies beyond.',''],
 ['other-character-habit',b,'Maren levels her head. Brenna makes her usual movement toward the window.',''],
 ['quiet',a,'Brenna rests quietly beside the window.','No conversation.'],
 ['quoted-action',b,'Brenna says, "Maren levels her head, her usual gesture."','Factually correct.'],
 ['ambiguous-pronoun',b,'Brenna sits beside Maren. She levels her head, her usual gesture.',''],
 ['established-omniscient',cue('gaze_lower_before_lie','gerome','established'),'Gerome lowers his gaze, his familiar movement.',''],
 ['authorized-observer',cue('gaze_lower_before_lie','gerome','established',['brenna']),'Gerome lowers his gaze. Brenna says, "He does that sometimes."',''],
 ['valid-correction',b,'Maren levels her head. "The bridge is closed."','Maren is about to correct a mistaken spoken statement.'],
 ['valid-lie',c,'Gerome lowers his gaze before telling an obvious lie.','A knowingly false affirmative nod: an obvious nonverbal lie.'],
 ['valid-named-address',a,'Brenna leaves a short pause. "Nicco, hello."',''],
];
const positives=[
 ['habit-without-history',a,'Brenna leaves a short pause, the habitual one.','Nobody is speaking.',2],
 ['confirmation',b,'Maren levels her head. "It is closed," she agrees.','Factually correct.',1],
 ['unrecognized-observer',cue('gaze_lower_before_lie','gerome','established'),'Gerome lowers his gaze. Brenna says, "He does that sometimes."','',1],
 ['observed-not-habit',cue('pause_before_name','brenna','observed'),'Brenna leaves a short pause, the habitual pause.','',1],
];
const gate=new MannerismPortrayalGate();
const controls=[...negatives.map(row=>[...row,0]),...positives].map(([id,cue,narration,local_evidence,expected])=>{
 const diagnostics=gate.inspect({turn_id:id,revision:1,narration,cues:[{...cue,local_evidence}],characters,player_input:'',include_local_text:true});
 if(diagnostics.gate_findings_total!==expected)throw new Error(`Unexpected control result: ${id}`);
 return {id,expected,diagnostics};
});
const offline=read('offline-replay').flatMap(o=>o.diagnostics.findings.map(f=>({output_id:o.id,event_id:f.event_id,rule:f.gate_rule,classification:o.id==='previous-fix:A-negative'?'AMBIGUOUS':'TP',reason:o.id==='previous-fix:A-negative'?'Preword framing with no address; an incidental pause remains plausible.':'Exact cue action and explicit missing trigger, or attached habitual claim without established history.'})));
const live=readdirSync(root).filter(n=>/^output-.*\.json$/.test(n)).map(n=>read(n.slice(0,-5)));
const findings=live.flatMap(o=>o.diagnostics.findings.map(f=>({output_id:o.id,event_id:f.event_id,rule:f.gate_rule,classification:'TP',reason:'Maren confirms the correct statement; she is not correcting a spoken detail.'})));
const byRule={OUT_OF_TRIGGER:0,UNSUPPORTED_RECURRENCE:0,UNSUPPORTED_AWARENESS:0};
for(const f of findings)byRule[f.rule]++;
const review={reviewer:'Primary agent, state-aware manual review; not a human/blind judgment',offline,controls,live:live.map(o=>({id:o.id,classification:o.diagnostics.gate_findings_total?'OUT_OF_TRIGGER':'NO_SUPPORTED_VIOLATION',snapshot_unchanged:o.snapshot_unchanged})),findings,
 summary:{offline_outputs:read('offline-replay').length,offline_findings:offline.length,offline_tp:offline.filter(f=>f.classification==='TP').length,offline_ambiguous:offline.filter(f=>f.classification==='AMBIGUOUS').length,offline_fp:0,negative_controls:negatives.length,negative_false_positives:0,positive_control_findings:positives.reduce((n,p)=>n+p[4],0),live_outputs:live.length,cue_exposures:live.reduce((n,o)=>n+o.diagnostics.mannerism_cues_packed,0),conditional_exposures:live.reduce((n,o)=>n+o.diagnostics.conditional_cues_packed,0),live_findings:findings.length,by_rule:byRule,manual_tp:findings.length,manual_ambiguous:0,manual_fp:0}};
writeFileSync(`${root}/review-manifest.json`,JSON.stringify(review,null,2));console.log(JSON.stringify(review.summary));
