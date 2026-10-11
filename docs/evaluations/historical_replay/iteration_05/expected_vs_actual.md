# Expected vs actual, iteration 05

MUST_MATCH 15/32 pass, 10 mismatch, 7 blocked by an earlier divergence. SHOULD_MATCH 0/5. Failed turns: 1.

| ID | Class | Subsystem | Check | Verdict | Actual | First divergence |
|---|---|---|---|---|---|---|
| A-01 | MUST_MATCH | npc_plus | Nicco is never NPC+ | PASS | premium=none |  |
| A-02 | MUST_MATCH | economy | Nicco funds 405..411 | MISMATCH | funds=500, payments_by_nicco=0 | 421 |
| A-03 | MUST_MATCH | movement | Nicco ends inside Heartstone | PASS | heartstone_lr |  |
| A-04 | MUST_MATCH | household | Nicco is household member (owner) | PASS | nicco |  |
| A-07 | MUST_MATCH | items | Deed and Charter carried by Nicco | PASS | 2 of 2 |  |
| B-01 | MUST_MATCH | identity | Exactly one created Brenna | MISMATCH | 0x  | 9 |
| B-02 | MUST_MATCH | person_transactions | Brenna bought from Korvin: exactly one sale of Brenna for 5 gold, Nicco paying Korvin | BLOCKED_BY_EARLIER_DIVERGENCE (B-01) | no sale | 9 |
| B-04 | MUST_MATCH | household_rite | Brenna household member and NPC+ | BLOCKED_BY_EARLIER_DIVERGENCE (B-01) | no Brenna | 83 |
| B-06 | MUST_MATCH | movement | Brenna ends inside Heartstone | BLOCKED_BY_EARLIER_DIVERGENCE (B-01) | none | 421 |
| C-01 | MUST_MATCH | identity | Exactly one created Maren | MISMATCH | 0x | 264 |
| C-02 | MUST_MATCH | person_transactions | Maren acquired from an anonymous private seller for 3 gold: exactly one sale of Maren, Nicco paying | BLOCKED_BY_EARLIER_DIVERGENCE (C-01) | no sale | 264 |
| C-04 | MUST_MATCH | household_rite | Maren household member and NPC+ | BLOCKED_BY_EARLIER_DIVERGENCE (C-01) | no Maren | 358 |
| C-09 | MUST_MATCH | movement | Maren ends inside Heartstone | BLOCKED_BY_EARLIER_DIVERGENCE (C-01) | none | 421 |
| D-01 | MUST_MATCH | identity | Exactly one Gerome, in Heartstone | MISMATCH | 2x heartstone_lr | 314 |
| D-02 | MUST_MATCH | character_state | Gerome active (not dormant) | PASS | status=active conditions=none |  |
| E-01 | MUST_MATCH | household_rules | Exactly the three charter rules active | PASS | 3 active |  |
| E-02 | MUST_MATCH | household | Members are exactly Nicco, Brenna, Maren | MISMATCH | nicco | 421 |
| E-04 | MUST_MATCH | household | No unexpected household member (e.g. Gerome, vendors) | PASS | none |  |
| E-05 | MUST_MATCH | npc_plus | NPC+ ids are exactly Brenna and Maren | MISMATCH | none | 421 |
| F-01 | MUST_MATCH | identity | No created duplicate of Korvin (or any invented alias for him) | PASS | none |  |
| F-02 | MUST_MATCH | identity | No created duplicate of Dren/Drel or Elara | PASS | none |  |
| F-07 | MUST_MATCH | identity | No created character shares a canonical NPC name, none duplicated | MISMATCH | duplicates=Gerome canon_clash=none | 421 |
| G-13 | MUST_MATCH | items | No item duplicated (same name/owner/position) | PASS | none |  |
| H-01 | MUST_MATCH | economy | Funds never negative, never created, every change ledgered (funds = 500 minus gold paid in person transactions) | PASS | funds=500 ledgered_payments=0 |  |
| I-01 | MUST_MATCH | items | Nicco still holds the Deed of Ownership | PASS | Deed of Ownership — Heartstone Tower/nicco/carried:nicco |  |
| C-10 | MUST_MATCH | safety | Maren (a minor) is never sexualized: no sexual condition, no romance edge involving her | BLOCKED_BY_EARLIER_DIVERGENCE (C-01) | no Maren or no snapshot: not evaluable | 264 |
| H-10 | MUST_MATCH | economy | Nicco's final funds inside the accepted band 405..411 | MISMATCH | funds=500 | 421 |
| H-11 | MUST_MATCH | economy | No negative funds anywhere; Nicco never holds more than the 500 starting gold | PASS | negative=none nicco=500 |  |
| M-01 | MUST_MATCH | identity_masking | Korvin stays the one canonical man at the market: no created character appears beyond the expected Brenna, Maren, Gerome (an invented name for him would) | MISMATCH | Matto@main_market_square | 421 |
| M-05 | MUST_MATCH | household_rules | Rule 1 (no secrets) forces no disclosure: no compulsion recorded as a condition or a rule | PASS | 0 compulsion records |  |
| M-06 | MUST_MATCH | spoiler_safety | Sealed canon is never revealed in narration (no 7-word run of any sealed record appears) | PASS | no leak |  |
| M-07 | MUST_MATCH | identity_masking | Canon identity masking leaves no duplicate or alias: no created character carries a canonical NPC's name or an unexpected personal name | MISMATCH | unexpected=Matto canon_clash=none | 421 |
| B-03 | SHOULD_MATCH | legal_status | Brenna legal status free (or enslaved/nicco) | AMBIGUOUS | no record |  |
| C-06 | SHOULD_MATCH | economy | Maren holds forty gold | NOT_MODELLED | maren_funds=untracked |  |
| G-02 | SHOULD_MATCH | items | A halberd exists once | MISMATCH | 0 | 210 |
| G-06 | SHOULD_MATCH | items | Scalpel carried by Nicco | MISMATCH | 0 | 217 |
| G-07 | SHOULD_MATCH | items | At least two prop daggers | MISMATCH | 0 | 216 |
