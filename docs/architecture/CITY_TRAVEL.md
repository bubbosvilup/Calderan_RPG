# Deterministic city travel

`src/world/travel.ts` implements positive-integer weighted Dijkstra traversal over
location `connections`. An edge requires `target`, `description`, `minutes` and may
have `kind` (`street`, `road`, `door`, `stairs`, `gate`, `bridge`, `square_access`).
Validation rejects missing/nonpositive/fractional/unsafe durations, self edges,
duplicate outgoing targets and missing/non-location targets. Reciprocal edges are
authored, never inferred; city regression tests require matching reverse costs and
kinds. A location's optional `entrance` is validated as a location reference.

The queue is sorted by elapsed minutes, then the complete node-ID sequence in
code-point lexicographic order. Positive costs and settled nodes prevent cycles;
safe-integer checks prevent path-sum overflow. Equal-cost routes do not depend on
YAML file order, connection order, locale, wall clock or an LLM. Same-node routes
cost zero without creating a zero-cost edge. Missing/unreachable destinations
return no route. Containers resolve only through explicit `entrance` metadata;
ancestry does not generate connections. The PNG is never loaded by runtime.

`playerIntent` and `resolveNaturalActions` share `reachable`, which resolves an
explicit entrance and calls the route finder. `/go <ID/name>`, the existing `I go`
forms, bare `go to`, `walk back to`, `head to`, and completed asterisk movement use
this path. Exact names/aliases/IDs precede conservative contextual resolution.
In Calderan, the bare destination “Center” means the district; the nation retains
its ID and name elsewhere. Ambiguous destinations are not guessed.

A successful intent emits one `runtime_delta` containing both `player_location`
and `time_advance_minutes`. Campaign preparation projects the destination for
narration, but finalization commits the movement, duration and other authorized
commands atomically. Existing safe-integer time bounds, day rollover and daily
mana recovery apply unchanged. Rejected routes produce no move/time effect;
failed/cancelled/stale turns do not commit the projection. Low-level state restore
and runtime delta APIs remain state-management primitives, not routing APIs.

`resolvePlayerCarry` reuses an already-resolved movement command, or resolves the
carry clause through the same route finder. Its `move_character` shares the final
player destination and the campaign transaction. It neither runs a separate NPC
route nor charges time again. Nobody follows based on ownership or household
membership. Other campaign-character movement still requires the existing explicit
completed-movement/evidence path. Carrying is same-turn only, not a persistent
follower or carrying-state system.

`TurnResult.travel` exposes origin, final destination, ordered node IDs, per-edge
origin/target/minutes/kind and total minutes for command, natural and carry travel.
Natural-action diagnostics also include the route. The existing play `--debug`
output prints this object. `node .build/src/dev/inspect-city.js` reports calibrated
routes, graph metrics, diameter and the full POI inventory without a provider call.

Save format is unchanged: final location, authoritative time, characters and legal
state are persisted, not cached routes. Saves retain the existing dataset-ID guard;
snapshots made against the old canonical dataset require the existing explicit
migration policy and are not silently accepted as this dataset. New saves round-trip
after city travel and carried-character movement.

Verification: `tests/city-travel.test.ts` covers route optimality and tie breaks,
schema errors, reachability, boundary cut sets, bridge crossings, end-to-end
historical routes, time, day recovery, failure rollback and save/load.
`tests/location-continuity.test.ts` exercises the narrator-created seller, promotion,
purchase, full Maren carry route and Tomas's unchanged location on a multi-hop trip.
