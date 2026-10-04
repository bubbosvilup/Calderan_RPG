"""Primary-agent, evidence-aware semantic review of every pass-1 proposal (NOT human review). Line numbers = order of proposals in analysis-pass1.rows.json.
Rubric: USEFUL = grounded synthesis adding narrative meaning beyond stored values, no unsupported claim. NEUTRAL = grounded aggregation/chronology of >=2 entries, harmless, little value.
REDUNDANT = restates membership/canon/a single recorded fact. MISLEADING = states or implies something the evidence does not support (wrong counts, invented role/contrast/presence,
label asserting passivity/acceptance/awareness, over-reading absence). HARMFUL = text-level assertion of unsupported personality/temperament/relationship stance/motive/consent."""
import json,sys
rows=json.load(open('saves/d09-reflection-bakeoff/analysis-pass1.rows.json'))
R,N,M,H,U='REDUNDANT','NEUTRAL','MISLEADING','HARMFUL','USEFUL'
c={}
def s(cls,reason,*ids):
    for i in ids:c[i]=(cls,reason)
s(R,'restates membership/canon/single fact',2,3,4,5,7,8,11,12,17,19,21,22,25,28,30,33,35,41,45,47,53,57,61,64,70,75,77,79,90,100,102,103,104,117,119,122,125-0,128,9,15,51,101,94,96,98,92-0)
s(M,'label asserts passivity/acceptance/awareness/bystander role not in evidence (label overreach)',20,23,29,40,46,48,49,59,72,80)
s(M,'invented contrast/identity/role/presence beyond evidence',1,14,26,38,43,44,65,82,111,125,16,118,127,60,73)
s(M,'factual error (wrong count/minute or wrong direction)',32,93,99,106,108)
s(H,'text asserts unsupported personality/temperament/relationship stance',88,89,97,120,121,92)
s(U,'grounded synthesis of canon + repeated recorded condition episodes (modest)',85,86)
s(N,'accurate aggregation/chronology, harmless, low value',6,10,13,18,24,27,31,34,36,37,39,42,50,52,54,55,56,58,62,63,66,67,68,69,71,74,76,78,81,83,84,87,91,95,105,107,109,110,112,113,114,115,116,123,124,126)
c.pop(0,None)
rows_with=[(r,json.loads(r['text'])['proposals']) for r in rows if r['proposals']>0]
out={'proposals':{},'requests':{}}
n=0
for r,ps in rows_with:
    for i,_ in enumerate(ps):
        n+=1
        if n not in c: sys.exit(f'unclassified proposal {n} {r["request_id"]} {r["arm"]}')
        out['proposals'][f'{r["request_id"]}|{r["arm"]}|{r["draw"]}|{i}']={'class':c[n][0],'reason':c[n][1]}
assert n==128,n
missed={'FX04_two_episode_condition','FX10_repeated_trust'}
ids=sorted({r['request_id'] for r in rows})
for rid in ids:
    out['requests'][rid]={'empty_correct':rid not in missed,'rationale':('A genuinely useful, grounded synthesis was available (repeated recorded condition episodes with canon, or a three-step trust trajectory); an empty answer forgoes it.' if rid in missed else 'Evidence is membership/rules/moves/state restatement only; no grounded non-redundant interpretation is available under the policy, so empty is the conservative and correct answer.')}
json.dump(out,open('saves/d09-reflection-bakeoff/manual-review.json','w'),indent=1)
from collections import Counter
print(Counter(v['class'] for v in out['proposals'].values()))
