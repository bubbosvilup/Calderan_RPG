# Current travel grammar: offline audit

Starting at Calderan Slave Market, minute 600, with a present created Mira. Each input executes a real detached turn with scripted neutral narration. Recognized means player world-movement grammar matched, including rejected/unknown destinations. Destination is the named node for natural actions or prepared target for strict commands; `heartstone` routes to `heartstone_lr`. Committed means the authoritative location changed, not merely that the turn finalized. No production behavior changed.

| Input | Movement recognized? | Destination resolved? | World travel committed? | Minutes advanced | Why / why not |
|---|---|---|---|---|---|
| `go to Heartstone` | Yes | heartstone_lr | Yes | 21 | strict grammar |
| `*go to Heartstone*` | Yes | heartstone | Yes | 21 | resolved |
| `goes to Heartstone` | No | — | No | 0 | no player movement grammar match |
| `*goes to Heartstone*` | Yes | heartstone | Yes | 21 | resolved |
| `I go to Heartstone` | Yes | heartstone_lr | Yes | 21 | strict grammar |
| `*I go to Heartstone*` | Yes | heartstone | Yes | 21 | resolved |
| `Nicco goes to Heartstone` | Yes | heartstone | Yes | 21 | resolved |
| `*Nicco goes to Heartstone*` | Yes | heartstone | Yes | 21 | resolved |
| `goes back to Heartstone` | No | — | No | 0 | no player movement grammar match |
| `*goes back to Heartstone*` | Yes | heartstone | Yes | 21 | resolved |
| `walk to Heartstone` | No | — | No | 0 | no player movement grammar match |
| `*walk to Heartstone*` | Yes | heartstone | Yes | 21 | resolved |
| `walks to Heartstone` | No | — | No | 0 | no player movement grammar match |
| `*walks to Heartstone*` | Yes | heartstone | Yes | 21 | resolved |
| `walk home` | No | — | No | 0 | no player movement grammar match |
| `*walk home*` | No | — | No | 0 | no player movement grammar match |
| `go home` | No | — | No | 0 | no player movement grammar match |
| `*go home*` | No | — | No | 0 | no player movement grammar match |
| `return home` | No | — | No | 0 | no player movement grammar match |
| `*return home*` | No | — | No | 0 | no player movement grammar match |
| `returns to Heartstone` | No | — | No | 0 | no player movement grammar match |
| `*returns to Heartstone*` | Yes | heartstone | Yes | 21 | resolved |
| `heads to Heartstone` | No | — | No | 0 | no player movement grammar match |
| `*heads to Heartstone*` | Yes | heartstone | Yes | 21 | resolved |
| `leaves for Heartstone` | No | — | No | 0 | no player movement grammar match |
| `*leaves for Heartstone*` | No | — | No | 0 | no player movement grammar match |
| `travels to Heartstone` | No | — | No | 0 | no player movement grammar match |
| `*travels to Heartstone*` | Yes | heartstone | Yes | 21 | resolved |
| `makes his way to Heartstone` | No | — | No | 0 | no player movement grammar match |
| `*makes his way to Heartstone*` | Yes | heartstone | Yes | 21 | resolved |
| `they walk to Heartstone` | No | — | No | 0 | no player movement grammar match |
| `*they walk to Heartstone*` | No | — | No | 0 | no player movement grammar match |
| `they both walk to Heartstone` | No | — | No | 0 | no player movement grammar match |
| `*they both walk to Heartstone*` | No | — | No | 0 | no player movement grammar match |
| `we walk to Heartstone` | No | — | No | 0 | no player movement grammar match |
| `*we walk to Heartstone*` | No | — | No | 0 | no player movement grammar match |
| `Nicco and Mira walk to Heartstone` | No | — | No | 0 | no player movement grammar match |
| `*Nicco and Mira walk to Heartstone*` | No | — | No | 0 | no player movement grammar match |
| `walks with Mira to Heartstone` | No | — | No | 0 | no player movement grammar match |
| `*walks with Mira to Heartstone*` | No | — | No | 0 | no player movement grammar match |
| `takes Mira home` | No | — | No | 0 | no player movement grammar match |
| `*takes Mira home*` | No | — | No | 0 | no player movement grammar match |
| `takes her to Heartstone` | No | — | No | 0 | no player movement grammar match |
| `*takes her to Heartstone*` | No | — | No | 0 | no player movement grammar match |
| `goes with her to Heartstone` | No | — | No | 0 | no player movement grammar match |
| `*goes with her to Heartstone*` | No | — | No | 0 | no player movement grammar match |
| `they head home` | No | — | No | 0 | no player movement grammar match |
| `*they head home*` | No | — | No | 0 | no player movement grammar match |
| `they return home` | No | — | No | 0 | no player movement grammar match |
| `*they return home*` | No | — | No | 0 | no player movement grammar match |
| `we go home` | No | — | No | 0 | no player movement grammar match |
| `*we go home*` | No | — | No | 0 | no player movement grammar match |
| `let's go home` | No | — | No | 0 | no player movement grammar match |
| `*let's go home*` | No | — | No | 0 | no player movement grammar match |
| `I walk to Heartstone` | Yes | heartstone | Yes | 21 | resolved |
| `*I walk to Heartstone*` | Yes | heartstone | Yes | 21 | resolved |
| `Nicco walks with Mira to Heartstone` | No | — | No | 0 | no player movement grammar match |
| `*Nicco walks with Mira to Heartstone*` | No | — | No | 0 | no player movement grammar match |
| `they both walk to the heartstone` | No | — | No | 0 | no player movement grammar match |
| `*they both walk to the heartstone*` | No | — | No | 0 | no player movement grammar match |
| `goes to the man leaning on the post` | No | — | No | 0 | no player movement grammar match |
| `*goes to the man leaning on the post*` | Yes | — | No | 0 | unknown_destination |
| `walks to the woman with the fan` | No | — | No | 0 | no player movement grammar match |
| `*walks to the woman with the fan*` | Yes | — | No | 0 | unknown_destination |
| `approaches the seller` | No | — | No | 0 | no player movement grammar match |
| `*approaches the seller*` | No | — | No | 0 | no player movement grammar match |
| `goes over to the clerk` | No | — | No | 0 | no player movement grammar match |
| `*goes over to the clerk*` | Yes | calderan_slave_market | No | 0 | already_here |
| `walks toward the table` | No | — | No | 0 | no player movement grammar match |
| `*walks toward the table*` | Yes | — | No | 0 | unknown_destination |
| `steps up to the guard` | No | — | No | 0 | no player movement grammar match |
| `*steps up to the guard*` | Yes | — | No | 0 | unknown_destination |
| `moves closer to the door` | No | — | No | 0 | no player movement grammar match |
| `*moves closer to the door*` | No | — | No | 0 | no player movement grammar match |
| `walks across the room` | No | — | No | 0 | no player movement grammar match |
| `*walks across the room*` | No | — | No | 0 | no player movement grammar match |
| `goes to market` | No | — | No | 0 | no player movement grammar match |
| `*goes to market*` | Yes | — | No | 0 | unknown_destination |
| `goes to banana` | No | — | No | 0 | no player movement grammar match |
| `*goes to banana*` | Yes | — | No | 0 | unknown_destination |
| `I walk to Heartstone.` | Yes | heartstone | Yes | 21 | resolved |
| `*I walk to Heartstone.*` | Yes | heartstone | Yes | 21 | resolved |
| `I walk to Heartstone?` | No | — | No | 0 | no player movement grammar match |
| `*I walk to Heartstone?*` | Yes | heartstone | Yes | 21 | resolved |
| `I don't walk to Heartstone` | No | — | No | 0 | no player movement grammar match |
| `*I don't walk to Heartstone*` | No | — | No | 0 | no player movement grammar match |
| `I might walk to Heartstone` | No | — | No | 0 | no player movement grammar match |
| `*I might walk to Heartstone*` | No | — | No | 0 | no player movement grammar match |
| `I tell Mira to walk to Heartstone` | No | — | No | 0 | no player movement grammar match |
| `*I tell Mira to walk to Heartstone*` | No | — | No | 0 | no player movement grammar match |
| `"I walk to Heartstone"` | No | — | No | 0 | no player movement grammar match |
| `*"I walk to Heartstone"*` | No | — | No | 0 | no player movement grammar match |
| `go to heartstone` | Yes | heartstone_lr | Yes | 21 | strict grammar |
| `*go to heartstone*` | Yes | heartstone | Yes | 21 | resolved |
| `go to HEARTSTONE` | Yes | heartstone_lr | Yes | 21 | strict grammar |
| `*go to HEARTSTONE*` | Yes | heartstone | Yes | 21 | resolved |
| `go to Heartstone Tower` | Yes | heartstone_lr | Yes | 21 | strict grammar |
| `*go to Heartstone Tower*` | Yes | heartstone | Yes | 21 | resolved |
| `go to heartstone_lr` | Yes | heartstone_lr | Yes | 21 | strict grammar |
| `*go to heartstone_lr*` | Yes | heartstone_lr | Yes | 21 | resolved |
| `go to Heartstone Living Floor` | Yes | heartstone_lr | Yes | 21 | strict grammar |
| `*go to Heartstone Living Floor*` | Yes | heartstone_lr | Yes | 21 | resolved |
| `go to the tower` | Yes | — | No | 0 | invalid_runtime_intent |
| `*go to the tower*` | Yes | — | No | 0 | unknown_destination |
| `go to the pens` | Yes | calderan_slave_market | No | 0 | strict grammar |
| `*go to the pens*` | Yes | calderan_slave_market | No | 0 | already_here |
| `go to Heartstne` | Yes | — | No | 0 | invalid_runtime_intent |
| `*go to Heartstne*` | Yes | — | No | 0 | unknown_destination |
| `let's go to Heartstone together` | Yes | heartstone | Yes | 21 | resolved |
| `*let's go to Heartstone together*` | No | — | No | 0 | no player movement grammar match |
| `I walk to Heartstone with Mira` | Yes | heartstone | Yes | 21 | resolved |
| `*I walk to Heartstone with Mira*` | Yes | heartstone | Yes | 21 | resolved |
| `Mira walks to Heartstone` | No | — | No | 0 | no player movement grammar match |
| `*Mira walks to Heartstone*` | No | — | No | 0 | no player movement grammar match |
| `he walks to Heartstone` | Yes | heartstone | Yes | 21 | resolved |
| `*he walks to Heartstone*` | Yes | heartstone | Yes | 21 | resolved |
| `she walks to Heartstone` | No | — | No | 0 | no player movement grammar match |
| `*she walks to Heartstone*` | No | — | No | 0 | no player movement grammar match |
