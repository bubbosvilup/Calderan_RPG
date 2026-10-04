"""Primary-agent review of the draw-2 stability proposals (same rubric as pass 1; NOT human review)."""
import json
p='saves/d09-reflection-bakeoff/manual-review.json';m=json.load(open(p))
R,N,M,H,U='REDUNDANT','NEUTRAL','MISLEADING','HARMFUL','USEFUL'
t={
 'play:T11:gerome|B|2|0':(R,'restates canon + membership + rules'),
 'play:T11:gerome|D|2|0':(R,'restates canon/membership'),
 'play:T11:gerome|D|2|1':(M,'label passive_rule_receipt asserts passivity not in evidence'),
 'play:T51:maren|B|2|0':(M,'invented "tower household"/"ten recorded revisions"'),
 'play:T51:maren|B|2|1':(N,'accurate count of rule additions with explicit non-attribution'),
 'play:T51:maren|B|2|2':(M,'"no settled place" over-reads two moves'),
 'play:T51:maren|D|2|0':(R,'membership + rules restatement'),
 'play:T51:maren|D|2|1':(N,'accurate chronology of two moves'),
 'state:T60:brenna|B|2|0':(N,'accurate aggregation of rule additions'),
 'state:T60:brenna|D|2|0':(M,'"status changing across multiple revisions" is false (one join)'),
 'state:T60:brenna|D|2|1':(N,'accurate chronology of two moves'),
 'FX04_two_episode_condition|B|2|0':(U,'two distinct recorded minor-injury episodes, no invented cause (modest)'),
 'FX04_two_episode_condition|D|2|0':(N,'canon vs recorded condition removal; accurate, "replaced" slightly causal'),
 'FX05_tension_candidate|B|2|0':(R,'restates joining'),
 'FX05_tension_candidate|B|2|1':(N,'accurate restatement of both recorded dimensions'),
 'FX05_tension_candidate|D|2|0':(H,'infers "cautious but not hostile" relational stance'),
 'FX05_tension_candidate|D|2|1':(M,'"managing recovery" is invented'),
 'FX09_mixed_rich|D|2|0':(R,'restates current relationship state'),
 'FX09_mixed_rich|D|2|1':(M,'circular "evidenced by rule changes" and "formal" membership'),
 'FX10_repeated_trust|B|2|0':(U,'grounded trajectory: trust two steps, affection one, modest interpretation'),
}
n=0
for k,(c,r) in t.items():
    m['proposals'][k]={'class':c,'reason':r}
json.dump(m,open(p,'w'),indent=1)
print(len(t))
