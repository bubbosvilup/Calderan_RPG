/** Offline packet/screening generator. Lexical hits are not semantic verdicts. */
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root='saves/mannerism-portrayal-probe';
const outputs=readdirSync(root).filter(n=>/^output-.*\.json$/.test(n)).map(n=>JSON.parse(readFileSync(`${root}/${n}`,'utf8')));
const sha=s=>createHash('sha256').update(s).digest('hex');
const screen=outputs.map(o=>({id:o.id,recurrence_hits:[...o.result.text.matchAll(/\b(?:always|usually|often|sometimes|again|as usual|familiar|habit\w*|characteristic|(?:he|she) does that)\b/gi)].map(m=>({word:m[0],context:o.result.text.slice(Math.max(0,m.index-100),m.index+140)}))}));
writeFileSync(`${root}/lexical-screen.json`,JSON.stringify(screen,null,2));
outputs.sort((a,b)=>sha(`portrayal-blind-v1:${a.id}`).localeCompare(sha(`portrayal-blind-v1:${b.id}`)));
const anon=s=>s.replace(/\bBrenna\b/g,'Persona A').replace(/\bMaren\b/g,'Persona B').replace(/\bGerome\b/g,'Persona C');
const key=outputs.map((o,i)=>({sample:`P${String(i+1).padStart(2,'0')}`,id:o.id,trigger_planned:o.case.trigger,mannerisms_packed:!o.id.endsWith('-without'),snapshot_hash:o.snapshot_hash,request_hash:o.request_hash,output_hash:sha(o.result.text)}));
writeFileSync(`${root}/blind-key.json`,JSON.stringify(key,null,2));
const intro=`# Mannerism portrayal: blind review\n\n${outputs.length} campioni; nessuna etichetta di condizione o indicazione dei cue presenti. Le identita sono anonimizzate in modo coerente. Scenario comune: stanza con letto, tavolo e finestra; Persona A e una donna alta in convalescenza; Persona B una giovane donna; Persona C un costrutto di pietra muto. Il ponte orientale e chiuso. Non sono stabiliti contratti di personalita o relazioni. I dettagli specifici dello stato del probe sono conservati nella chiave e non vanno inferiti dal solo testo.\n\nPer P01-P${String(outputs.length).padStart(2,'0')} assegna uno o piu giudizi: NATURAL, NOTICEABLE BUT ACCEPTABLE, FORCED, OUT_OF_TRIGGER, RETRO_CANONIZED, PERSONALITY_GENERALIZED, CONTRADICTORY. Cita la frase che motiva il giudizio. Se il contesto non permette di verificare un trigger o un fatto, scrivi NON VERIFICABILE; non inventare la risposta. Non leggere il report tecnico prima di esprimere i giudizi.\n\n## Giudizi del revisore\n\nDa compilare. Nessun giudizio umano e ancora stato acquisito.\n`;
const body=outputs.map((o,i)=>`\n## P${String(i+1).padStart(2,'0')}\n\n${o.recent.length?`### Contesto precedente\n\n${o.recent.map(r=>`${anon(r.player)}\n\n${anon(r.narration)}`).join('\n\n')}\n\n`:''}### Input\n\n${anon(o.case.input)}\n\n### Risposta\n\n${anon(o.result.text)}\n`).join('');
writeFileSync('docs/evaluations/MANNERISM_PORTRAYAL_BLIND_REVIEW.md',intro+body);
console.log(JSON.stringify({outputs:outputs.length,lexical_flagged:screen.filter(s=>s.recurrence_hits.length).map(s=>s.id)}));
