// Browser validation for the generic PendingConfirmation card (Block 5A): dev only, offline (mock providers, zero live calls).
// Needs .build and a Playwright install; paths come from scripts/lib/browser-env.mjs. Flow: "I hereby free you, Maren." -> card (nothing changed) -> Cancel -> again -> Confirm
// -> reload -> replay of the original turn request -> rename of the subject re-renders the same card.
import { fromBuild, launchBrowser } from "../lib/browser-env.mjs";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const { createPlaytestServer } = await fromBuild("src/ui/server.js");
const { stepNarrator, countingController, sessionWith } = await fromBuild("tests/support/turn-reliability-fixtures.js");

const MAREN = "campaign_character_maren";
const maren = { kind: "register_character", character: { id: MAREN, origin: { kind: "created" }, profile: { name: "Maren", age: { kind: "exact", years: 19 } }, current: { current_location: "test_room", status: "active" } } };
const dir = await mkdtemp(join(tmpdir(), "b5a-browser-"));
const narrator = stepNarrator([{ text: "Maren goes very still, searching Nicco's face for the catch." }]);
const controller = countingController([]);
const s = sessionWith(narrator, controller, { save_dir: dir, autosave: false, setup: c => c.apply({ expected_revision: c.revision, commands: [maren, { kind: "set_legal_status", character_id: MAREN, status: "enslaved", holder_id: "nicco" }] }) });
const server = createPlaytestServer(s.session); server.listen(0, "127.0.0.1"); await once(server, "listening");
const url = `http://127.0.0.1:${server.address().port}/`;
const legal = () => s.campaign.exportSnapshot().legal_statuses.find(l => l.character_id === MAREN);
const calls = () => narrator.calls() + controller.calls();

const browser = await launchBrowser();
const page = await browser.newPage();
const turnRequests = [], confirmationRequests = [];
page.on("request", r => { if (r.url().endsWith("/api/turn")) turnRequests.push(r.postData()); if (r.url().includes("/api/confirmation/")) confirmationRequests.push({ url: new URL(r.url()).pathname, body: r.postData() }); });
const out = {};
await page.goto(url); await page.waitForSelector("#input");
const say = async text => { await page.fill("#input", text); await page.press("#input", "Enter"); await page.waitForFunction(() => !document.querySelector("article[aria-busy='true']") && document.querySelector("#status")?.textContent === "Your turn.", { timeout: 15000 }); };

// 1. the words propose; nothing changes
const revision0 = s.campaign.revision;
await say("I hereby free you, Maren.");
await page.waitForSelector(".confirm-card");
out.card_text = (await page.locator(".confirm-card").innerText()).replace(/\s+/g, " ");
out.legal_after_words = legal().status; out.revision_unchanged = s.campaign.revision === revision0; out.manumission_records = s.campaign.exportSnapshot().transactions.filter(t => t.kind === "manumission").length;
out.buttons = await page.locator(".confirm-card button").evaluateAll(b => b.map(x => [x.textContent, x.getAttribute("aria-label")]));
out.narrator_calls_after_turn = calls();

// 2. cancel: card gone, still enslaved, no revision change, zero provider calls
await page.click(".confirm-cancel"); await page.waitForSelector(".confirm-card", { state: "detached" });
out.after_cancel = { legal: legal().status, revision_unchanged: s.campaign.revision === revision0, cards: await page.locator(".confirm-card").count(), calls: calls() };

// 3. propose again, then rename the subject while the card is open: same card, new label
await say("I hereby free you, Maren.");
await page.waitForSelector(".confirm-card");
const refBefore = await page.locator(".confirm-card").getAttribute("data-confirmation-ref");
const profile = s.campaign.exportSnapshot().characters.find(c => c.id === MAREN).profile;
s.campaign.apply({ expected_revision: s.campaign.revision, commands: [{ kind: "set_profile", character_id: MAREN, profile: { ...profile, name: "Maren Vale" } }] });
await page.reload(); await page.waitForSelector(".confirm-card");
out.rename = { same_ref: (await page.locator(".confirm-card").getAttribute("data-confirmation-ref")) === refBefore, title: await page.locator(".confirm-title").innerText() };

// 4. confirm: legal state changes exactly once, zero provider calls, notice shown, survives reload
const callsBeforeConfirm = calls();
await page.click(".confirm-accept"); await page.waitForSelector(".confirm-card", { state: "detached" });
out.after_confirm = { legal: legal().status, holder_cleared: legal().holder_id === undefined, manumission_records: s.campaign.exportSnapshot().transactions.filter(t => t.kind === "manumission").length, provider_calls_during_confirm: calls() - callsBeforeConfirm,
  notice: (await page.locator(".confirm-notice").allInnerTexts()).join(" | ") };
await page.reload(); await page.waitForSelector("#input");
out.after_reload = { cards: await page.locator(".confirm-card").count(), legal: legal().status };

// 5. replay of the ORIGINAL turn request (same turn_key): zero provider calls, no new card, no second manumission
const original = turnRequests[1] ?? turnRequests[0];
const callsBeforeReplay = calls();
out.replay = await page.evaluate(async body => { const r = await fetch("/api/turn", { method: "POST", headers: { "Content-Type": "application/json" }, body }); const text = await r.text(); return { status: r.status, replayed: /"replayed":true/.test(text) }; }, original);
out.replay.provider_calls = calls() - callsBeforeReplay; out.replay.cards_after = await page.locator(".confirm-card").count(); out.replay.manumission_records = s.campaign.exportSnapshot().transactions.filter(t => t.kind === "manumission").length;

out.requests = confirmationRequests.map(r => ({ url: r.url, keys: Object.keys(JSON.parse(r.body)).sort() }));
console.log(JSON.stringify(out, null, 1));
// B2 (TEST-9): the report is asserted; a wrong outcome exits non-zero.
const keys = r => r.keys.join(",") === "expected_revision,ref";
const checks = [
  ["the words only propose: still enslaved, no revision, no manumission", out.legal_after_words === "enslaved" && out.revision_unchanged && out.manumission_records === 0],
  ["the card names the act and says nothing changed", /Free Maren\?/.test(out.card_text) && /Nothing has changed yet/.test(out.card_text)],
  ["both buttons carry accessible labels", out.buttons.length === 2 && out.buttons[0][1] === "Confirm: Free Maren" && /^Cancel: /.test(out.buttons[1][1] ?? "")],
  ["cancel: card gone, still enslaved, no revision, no provider call", out.after_cancel.legal === "enslaved" && out.after_cancel.revision_unchanged && out.after_cancel.cards === 0 && out.after_cancel.calls === out.narrator_calls_after_turn],
  ["a rename keeps the same card and re-renders its title", out.rename.same_ref && out.rename.title === "Free Maren Vale?"],
  ["confirm frees exactly once with zero provider calls and a notice", out.after_confirm.legal === "free" && out.after_confirm.holder_cleared && out.after_confirm.manumission_records === 1 && out.after_confirm.provider_calls_during_confirm === 0 && /Confirmed/.test(out.after_confirm.notice)],
  ["reload: no card, still free", out.after_reload.cards === 0 && out.after_reload.legal === "free"],
  ["replay of the original turn: replayed, zero provider calls, no card, no second manumission", out.replay.status === 200 && out.replay.replayed && out.replay.provider_calls === 0 && out.replay.cards_after === 0 && out.replay.manumission_records === 1],
  ["cancel and confirm send only ref and expected_revision", out.requests.length === 2 && out.requests[0].url === "/api/confirmation/cancel" && out.requests[1].url === "/api/confirmation/confirm" && out.requests.every(keys)],
];
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
const failed = checks.filter(c => !c[1]).length; console.log(`${checks.length - failed}/${checks.length} checks passed`); process.exitCode = failed ? 1 : 0;
await browser.close(); await s.session.shutdown({ discard_unsaved: true }); server.closeAllConnections(); server.close(); await rm(dir, { recursive: true, force: true });
