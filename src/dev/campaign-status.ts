import type { WorldStore } from "../world/world-store.js";
import type { CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import { characterView } from "../campaign/projections.js";
import { describeDimensions, relationshipHeadline } from "../campaign/relationship-summary.js";
import { narratorEphemeralCharacters } from "../campaign/promotion.js";

/**
 * Household Pass 1 deterministic status, derived only from committed campaign state (never from prose). The player view shows
 * money, legal status of people Nicco holds or has freed, household membership and rules, and relationship headlines toward
 * Nicco. The debug view adds every relationship edge with its dimensions and the transaction ledger.
 */
export function formatCampaignStatus(snapshot: DeepReadonly<CampaignSnapshot>, world: WorldStore, view: "player" | "debug" = "player"): string {
  const name = (id: string) => { try { return characterView(snapshot, world, id).profile.name ?? snapshot.characters.find(c => c.id === id)?.origin_snapshot?.label ?? id; } catch { return id; } };
  const lines: string[] = [];
  const gold = snapshot.funds.find(f => f.character_id === "nicco")?.gold;
  lines.push(`Money: ${gold === undefined ? "not tracked" : `${gold} gold`}`);
  const relevantLegal = snapshot.legal_statuses.filter(l => view === "debug" || l.holder_id === "nicco" || l.transfer?.from_holder_id === "nicco");
  if (relevantLegal.length) {
    lines.push("Legal:");
    for (const l of relevantLegal) {
      const papers = l.transfer ? `; ${l.transfer.documentation === "documented" ? "documented transfer" : l.transfer.documentation === "undocumented" ? "unpapered transfer" : "papers not established"}` : "";
      lines.push(`  ${name(l.character_id)} — ${l.status}${l.holder_id ? `; holder=${name(l.holder_id)}` : ""}${papers}`);
    }
  }
  for (const h of snapshot.households.filter(x => view === "debug" || x.members.some(m => m.character_id === "nicco" && m.status === "member"))) {
    const members = h.members.filter(m => m.status === "member" && m.role !== "owner").map(m => name(m.character_id));
    lines.push(`${h.name ?? h.id} Household: ${members.length} — ${members.length ? members.join(", ") : "no members besides the keeper"}`);
    const rules = (h.rules ?? []).filter(r => r.active);
    if (rules.length) { lines.push("  Rules:"); for (const r of rules) lines.push(`    ${r.id}: ${r.text}`); }
  }
  const edges = snapshot.relationships.filter(e => e.dimensions && (view === "debug" || e.to_character_id === "nicco"));
  if (edges.length) {
    lines.push("Relationships:");
    for (const e of edges) lines.push(`  ${name(e.from_character_id)} → ${name(e.to_character_id)}: ${relationshipHeadline(e)}${view === "debug" ? ` (${describeDimensions(e)})` : ""}`);
  }
  // Promotion Pass 1.1 (debug only): who became persistent from narration, when, and exactly what was established at that moment.
  const promoted = view === "debug" ? narratorEphemeralCharacters(snapshot) : [];
  if (promoted.length) {
    lines.push("Promoted characters:");
    for (const c of promoted) {
      const o = c.origin_snapshot!, e = o.established, l = snapshot.legal_statuses.find(x => x.character_id === c.id);
      const household = snapshot.households.filter(h => h.members.some(m => m.character_id === c.id && m.status === "member")).map(h => h.name ?? h.id);
      const age = e.age ? (e.age.kind === "exact" ? `${e.age.years}` : e.age.description) : undefined;
      const facts = [e.name ? `name ${e.name}` : "name unestablished", e.sex && `sex ${e.sex}`, age && `age ${age}`, e.species && `species ${e.species}`, e.appearance?.length && `appearance ${e.appearance.join(", ")}`,
        e.condition?.length && `condition ${e.condition.join(", ")}`, e.role && `role ${e.role}`].filter(Boolean).join("; ");
      lines.push(`  ${name(c.id)} (${c.id})`, `    Origin: ${o.source} (${o.trigger}); promoted at revision ${o.promoted_revision}, minute ${o.promoted_world_minute}, at ${o.location_id}${o.ephemeral_ref ? `; was ${o.ephemeral_ref}` : ""}`,
        `    Established at promotion: ${facts}`, ...(e.background ?? []).map(b => `    Background (${b.source}): ${b.text}`),
        `    Legal: ${l ? `${l.status}${l.holder_id ? `; holder=${name(l.holder_id)}` : ""}${l.transfer ? `; ${l.transfer.documentation}` : ""}` : "unestablished"}`,
        `    Household: ${household.length ? `member of ${household.join(", ")}` : "not member"}`);
    }
  }
  if (view === "debug" && snapshot.transactions.length) {
    lines.push("Transactions:");
    for (const t of snapshot.transactions) lines.push(`  ${t.id}: ${t.kind} ${name(t.subject_id)} ${t.from_counterparty ? `${t.from_counterparty.label} (anonymous seller at ${t.from_counterparty.location_id}; authority: "${t.from_counterparty.authority_evidence.join(" / ")}")` : name(t.from_holder_id!)}${t.to_holder_id ? ` → ${name(t.to_holder_id)}` : " → free"}${t.gold !== undefined ? ` for ${t.gold} gold` : ""} (${t.documentation}, revision ${t.revision})`);
  }
  return lines.join("\n");
}
