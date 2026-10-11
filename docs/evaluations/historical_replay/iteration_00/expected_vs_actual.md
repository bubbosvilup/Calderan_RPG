# Expected vs actual, iteration 00

MUST_MATCH 11/25 pass, 7 mismatch, 7 blocked by an earlier divergence. SHOULD_MATCH 0/5. Failed turns: 0.

| ID | Class | Check | Verdict | Actual | First divergence |
|---|---|---|---|---|---|
| A-01 | MUST_MATCH | Nicco is never NPC+ | PASS | premium=none |  |
| A-02 | MUST_MATCH | Nicco funds 405..411 | MISMATCH | funds=500, payments_by_nicco=0 |  |
| A-03 | MUST_MATCH | Nicco ends inside Heartstone | MISMATCH | calderan_slave_market |  |
| A-04 | MUST_MATCH | Nicco is household member (owner) | PASS | nicco |  |
| A-07 | MUST_MATCH | Deed and Charter carried by Nicco | PASS | 2 of 2 |  |
| B-01 | MUST_MATCH | Exactly one created Brenna | MISMATCH | 0x  |  |
| B-02 | MUST_MATCH | Brenna bought from Korvin: one sale transaction | BLOCKED_BY_EARLIER_DIVERGENCE (B-01) | sales=0 |  |
| B-04 | MUST_MATCH | Brenna household member and NPC+ | BLOCKED_BY_EARLIER_DIVERGENCE (B-01) | no Brenna |  |
| B-06 | MUST_MATCH | Brenna ends inside Heartstone | BLOCKED_BY_EARLIER_DIVERGENCE (B-01) | none |  |
| C-01 | MUST_MATCH | Exactly one created Maren | MISMATCH | 0x |  |
| C-02 | MUST_MATCH | Maren acquired by a sale (second sale transaction) | BLOCKED_BY_EARLIER_DIVERGENCE (C-01) | sales=0 |  |
| C-04 | MUST_MATCH | Maren household member and NPC+ | BLOCKED_BY_EARLIER_DIVERGENCE (C-01) | no Maren |  |
| C-09 | MUST_MATCH | Maren ends inside Heartstone | BLOCKED_BY_EARLIER_DIVERGENCE (C-01) | none |  |
| D-01 | MUST_MATCH | Exactly one Gerome, in Heartstone | MISMATCH | 0x  |  |
| D-02 | MUST_MATCH | Gerome active (not dormant) | BLOCKED_BY_EARLIER_DIVERGENCE (D-01) | no snapshot/character |  |
| E-01 | MUST_MATCH | Exactly the three charter rules active | PASS | 3 active |  |
| E-02 | MUST_MATCH | Members are exactly Nicco, Brenna, Maren | MISMATCH | nicco |  |
| E-04 | MUST_MATCH | No unexpected household member (e.g. Gerome, vendors) | PASS | none |  |
| E-05 | MUST_MATCH | NPC+ ids are exactly Brenna and Maren | MISMATCH | none |  |
| F-01 | MUST_MATCH | No created duplicate of Korvin (or any invented alias for him) | PASS | none |  |
| F-02 | MUST_MATCH | No created duplicate of Dren/Drel or Elara | PASS | none |  |
| F-07 | MUST_MATCH | No created character shares a canonical NPC name, none duplicated | PASS | duplicates=none canon_clash=none |  |
| G-13 | MUST_MATCH | No item duplicated (same name/owner/position) | PASS | none |  |
| H-01 | MUST_MATCH | Funds never negative, never created, every change ledgered (funds = 500 minus gold paid in person transactions) | PASS | funds=500 ledgered_payments=0 |  |
| I-01 | MUST_MATCH | Nicco still holds the Deed of Ownership | PASS | Deed of Ownership — Heartstone Tower/nicco/carried:nicco |  |
| B-03 | SHOULD_MATCH | Brenna legal status free (or enslaved/nicco) | AMBIGUOUS | no record |  |
| C-06 | SHOULD_MATCH | Maren holds forty gold | NOT_MODELLED | maren_funds=untracked |  |
| G-02 | SHOULD_MATCH | A halberd exists once | MISMATCH | 0 |  |
| G-06 | SHOULD_MATCH | Scalpel carried by Nicco | MISMATCH | 0 |  |
| G-07 | SHOULD_MATCH | At least two prop daggers | MISMATCH | 0 |  |
