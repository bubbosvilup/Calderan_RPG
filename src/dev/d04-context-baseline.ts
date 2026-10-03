import { mkdir, writeFile } from "node:fs/promises";
import { loadWorld } from "../world/loader.js";
import { createOpeningCampaign, OPENING_HOUSEHOLD } from "../campaign/opening-state.js";
import type { CampaignCommand } from "../campaign/types.js";
import { buildTurnContext, type TurnContext } from "../turn/context-builder.js";
import { buildNarratorPrompt, relevanceSignals } from "../turn/prompt-builder.js";
import { ContextBudgetManager, estimateContextTokens, serializeContextBaseline } from "../turn/context-budget.js";
import { projectKnowledgeAccess, renderKnowledgeAccess } from "../turn/narrative-authority.js";
const world = await loadWorld("data"), c = createOpeningCampaign(world, "d04_baseline");
const commands: CampaignCommand[] = [];
for (let i = 0; i < 7; i++) {
 const id = `campaign_character_d04_${i}`;
 commands.push({ kind: "register_character", character: { id, origin: { kind: "created" }, profile: { name: `D04 Person ${i}` }, current: { current_location: "heartstone_square", status: "active" } } }, { kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: id });
}
for (let k = 0; k < 32; k++) {
 const id = `campaign_fact_d04_${k}`;
 commands.push({ kind: "create_fact", fact: { id, content: { kind: "campaign", statement: `Ledger ${k}: the sealed harbor shipment arrived at sunset; keeper verified wax and recorded the debt.`, truth: "true" } } });
 for (const character_id of ["nicco", ...Array.from({ length: 7 }, (_, i) => `campaign_character_d04_${i}`)]) commands.push({ kind: "set_knowledge", knowledge: { character_id, fact_id: id, status: "knows" } });
}
for(let i=0;i<commands.length;i+=80)c.apply({ expected_revision:c.revision,commands:commands.slice(i,i+80) });
let serialized = "", oversized = false;
try { buildTurnContext(world, c.exportSnapshot(), { input: "What does the harbor ledger say?", inspect_serialized: value => { serialized = value; } }); } catch (error) { if (!serialized) throw error; oversized = true; }
const context = JSON.parse(serialized) as TurnContext, request = buildNarratorPrompt("What does the harbor ledger say?",context,[],undefined,{candidates:[],runtime:[]});
const knowledge = renderKnowledgeAccess(projectKnowledgeAccess(context, undefined, relevanceSignals("What does the harbor ledger say?", [], { candidates: [], runtime: [] })));
const measurement = { npc_plus: c.exportSnapshot().premium_characters.length, source_facts_per_npc:32, shown_facts:context.facts.length, narrator_campaign_facts:projectKnowledgeAccess(context, undefined, relevanceSignals("What does the harbor ledger say?", [], { candidates: [], runtime: [] })).facts.filter(f => f.source === "campaign_fact").length, known_edges:224, serialized_context_characters:JSON.stringify(context).length, serialized_request_bytes:Buffer.byteLength(JSON.stringify(request)), knowledge_tokens:estimateContextTokens(knowledge), budget:new ContextBudgetManager().measure(request), context_too_large:oversized };
await mkdir("saves/d04-context",{recursive:true});
await writeFile("saves/d04-context/baseline.json", serializeContextBaseline(request));
await writeFile("saves/d04-context/measurements.json",JSON.stringify(measurement,null,2));
console.log(JSON.stringify(measurement,null,2));
