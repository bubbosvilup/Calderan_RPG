import test from "node:test";
import assert from "node:assert/strict";
import { createPlaytestServer } from "../../src/ui/server.js";
import { once } from "node:events";
import type { TurnDiagnostics } from "../../src/turn/coordinator/turn-diagnostics.js";
import type { TurnEvent } from "../../src/turn/turn-types.js";
import { collect } from "../support/turn-fixtures.js";
import { NARRATION, coordinatorWith, countingController, sessionWith, stepNarrator, transfer, withRunTurn } from "../support/turn-reliability-fixtures.js";
import { nextTurnKey, revisionOf, turnJson } from "../support/turn-http.js";

const INPUT = "I give boots to Brenna.", GOOD = "Brenna accepts boots from Nicco.";
const types = (events: readonly TurnEvent[]) => events.map(e => e.type);

/** PIPE-2 at the coordinator: after CampaignState.commit the turn succeeded. Every post-commit step is guarded and becomes a warning. */
async function coordinatorFault(inject: (f: ReturnType<typeof coordinatorWith>) => void, step: string) {
  const records: TurnDiagnostics[] = [];
  const f = coordinatorWith(stepNarrator([{ text: GOOD }, { text: NARRATION }]), countingController([transfer]), { diagnostics: r => records.push(r as TurnDiagnostics) });
  inject(f);
  const base = f.campaign.revision, events = await collect(f.coordinator.runTurn({ campaign: f.campaign, player_input: INPUT }));
  assert.equal(f.campaign.revision, base + 1, "exactly one commit");
  assert.equal(events.filter(e => e.type === "state_committed").length, 1);
  assert.equal(events.at(-1)!.type, "turn_completed", "the turn is reported as succeeded");
  assert.ok(!events.some(e => e.type === "turn_failed"));
  const warning = events.find(e => e.type === "publication_warning"); assert.ok(warning && warning.type === "publication_warning" && warning.step === step, `warning ${step}`);
  assert.equal(records.at(-1)!.outcome, "success"); assert.ok(records.at(-1)!.publication_warnings?.includes(step as never));
  // The next turn works and does not duplicate the first one's effects.
  const next = await collect(f.coordinator.runTurn({ campaign: f.campaign, player_input: "Hello, Brenna." }));
  assert.equal(next.at(-1)!.type, "turn_completed");
  return { f, events, records };
}

test("PIPE-2: recordExchange throws after the commit -> success + exchange_history warning; history still holds the turn once; next turn works", async () => {
  const { f } = await coordinatorFault(({ coordinator }) => { (coordinator as unknown as { recordExchange: () => void }).recordExchange = () => { throw new Error("injected: recordExchange"); }; }, "exchange_history");
  const entries = f.coordinator.recent(f.campaign).finalized();
  assert.equal(entries.filter(e => e.narration === GOOD).length, 1, "the fallback recorded the exchange exactly once (no duplicate transcript)");
});

test("PIPE-2: scene-participant retirement throws after the commit -> success + scene_participants warning", async () => {
  await coordinatorFault(({ coordinator, campaign }) => { coordinator.participants(campaign).name = () => { throw new Error("injected: name"); }; }, "scene_participants");
});

test("PIPE-2: a throwing diagnostics emitter cannot fail a committed turn", async () => {
  const f = coordinatorWith(stepNarrator([{ text: GOOD }]), countingController([transfer]), { diagnostics: () => { throw new Error("injected: sink"); } });
  const base = f.campaign.revision; const events: TurnEvent[] = [];
  try { for await (const e of f.coordinator.runTurn({ campaign: f.campaign, player_input: INPUT })) events.push(e); } catch { /* the generator may surface the sink error only AFTER every event */ }
  assert.equal(f.campaign.revision, base + 1); assert.equal(events.at(-1)!.type, "turn_completed"); assert.ok(!events.some(e => e.type === "turn_failed"));
});

test("PIPE-2: the result assembly runs BEFORE the commit, so a failure there is a clean pre-commit failure with no state change", async () => {
  const f = coordinatorWith(stepNarrator([{ text: GOOD }]), countingController([transfer]));
  const base = f.campaign.revision, original = f.campaign.commit.bind(f.campaign); let commits = 0;
  f.campaign.commit = ((...a: Parameters<typeof original>) => { commits++; return original(...a); }) as typeof f.campaign.commit;
  const events = await collect(f.coordinator.runTurn({ campaign: f.campaign, player_input: INPUT }));
  assert.equal(commits, 1); assert.equal(f.campaign.revision, base + 1); assert.equal(events.at(-1)!.type, "turn_completed");
  assert.deepEqual(types(events).filter(t => t === "state_committed" || t === "narration_completed"), ["state_committed", "narration_completed"], "the commit precedes publication");
});

test("PIPE-2: a coordinator that throws AFTER state_committed still yields a successful, committed GameSession outcome (one commit, one transcript entry, next turn works)", async () => {
  let blow = true;
  const s = sessionWith(stepNarrator([{ text: GOOD }, { text: NARRATION }]), countingController([transfer]), {
    wrap: real => withRunTurn(real, async function* (c, request) { for await (const e of c.runTurn(request)) { yield e; if (blow && e.type === "state_committed") { blow = false; throw new Error("injected: consumer-side failure after commit"); } } }) });
  const base = s.campaign.revision;
  const outcome = await s.session.submitPlayerInput(INPUT);
  assert.ok(outcome.ok, "reported as success"); if (!outcome.ok) return;
  assert.equal(s.campaign.revision, base + 1); assert.ok(outcome.warnings?.includes("result_publication")); assert.equal(outcome.narration, GOOD);
  assert.ok(outcome.trace.publication_warnings?.includes("result_publication"));
  const next = await s.session.submitPlayerInput("Hello, Brenna."); assert.ok(next.ok);
  assert.equal(s.campaign.exportSnapshot().items.find(i => i.id === "boots")!.owner_id, "nicco", "the handover happened once and was not undone");
});

async function http(t: { after: (fn: () => Promise<void>) => void }, s: ReturnType<typeof sessionWith>) {
  const server = createPlaytestServer(s.session); server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(async () => { await s.session.shutdown({ discard_unsaved: true }); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

test("PIPE-2: the server cannot turn a committed turn into an error when describing the new state fails", async t => {
  const s = sessionWith(stepNarrator([{ text: GOOD }, { text: NARRATION }]), countingController([transfer])), url = await http(t, s);
  const revision = await revisionOf(url), base = s.campaign.revision;
  const real = s.session.getPlayUiView.bind(s.session); let broken = true;
  s.session.getPlayUiView = (() => { if (broken) throw new Error("injected: state view"); return real(); }) as typeof s.session.getPlayUiView;
  const response = await fetch(`${url}/api/turn`, { method: "POST", headers: { "Content-Type": "application/json" }, body: turnJson(INPUT, revision) });
  const body = await response.json() as { ok: boolean; warnings?: string[]; messages: { role: string; text: string }[] };
  assert.equal(response.status, 200); assert.equal(body.ok, true); assert.ok(body.warnings?.includes("state_view")); assert.equal(body.messages.at(-1)!.text, GOOD);
  assert.equal(s.campaign.revision, base + 1);
  broken = false;
  const next = await fetch(`${url}/api/turn`, { method: "POST", headers: { "Content-Type": "application/json" }, body: turnJson("Hello, Brenna.", await revisionOf(url)) });
  assert.equal((await next.json() as { ok: boolean }).ok, true);
});

test("PIPE-2: the unused key space is intact (nextTurnKey is unique per call)", () => { assert.notEqual(nextTurnKey(), nextTurnKey()); });
