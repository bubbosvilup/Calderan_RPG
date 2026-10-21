import { useId, useMemo, useState } from "react";
import { Link } from "react-router";
import type { ActiveSessionPayload, CharacterCardDto } from "../../api/types";
import { Avatar } from "../../components/Avatar/Avatar";
import { Badge } from "../../components/Badge/Badge";
import { Button } from "../../components/Button/Button";
import { EmptyState } from "../../components/ErrorState/ErrorState";
import { cx } from "../../lib/cx";
import { npcCharacterPath } from "../../lib/paths";
import { useActionBlockedReason } from "../../state/serverState";
import { CharacterDrawer } from "../characters/CharacterDrawer";
import { findCharacterCard } from "../characters/CharacterSidebar";
import styles from "./Household.module.css";

type Filter = "all" | "here" | "elsewhere";
const FILTERS: readonly { readonly id: Filter; readonly label: string }[] = [{ id: "all", label: "All" }, { id: "here", label: "Here" }, { id: "elsewhere", label: "Elsewhere" }];

const matches = (card: CharacterCardDto, query: string) => !query || `${card.name} ${card.role} ${card.known_location ?? ""} ${card.relationship}`.toLowerCase().includes(query);

/**
 * The household as the read model lists it. Names arrive masked by the server (an unfamiliar member stays "Unfamiliar household member");
 * whether a member is an NPC+, may be edited, or may be promoted are the engine's flags (`npc_plus`, `character_capabilities`), never
 * derived here. Filters and search change only what is listed. A card opens the same character drawer as in the story, so promotion keeps its
 * one confirmation flow.
 */
export function HouseholdPage({ session }: { readonly session: ActiveSessionPayload }) {
  const members = useMemo(() => session.play.household.flatMap(group => group.members), [session.play.household]);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const blockedReason = useActionBlockedReason(session.status);
  const headingId = useId(), searchId = useId(), totalsId = useId();
  const playerName = session.player_character?.name ?? "You";
  const here = members.filter(member => member.presence === "present").length;
  const needle = query.trim().toLowerCase();
  const visible = members.filter(member => (filter === "all" || (member.presence === "present" ? "here" : "elsewhere") === filter) && matches(member, needle));
  const selected = selectedRef ? findCharacterCard(session, selectedRef) : null;
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 id={headingId} className={styles.title}>{session.play.household_title}</h1>
          <p id={totalsId} className={styles.totals}>{members.length} {members.length === 1 ? "member" : "members"} · {here} here with you · {members.length - here} elsewhere</p>
        </div>
      </header>
      <div className={styles.controls}>
        <div role="group" aria-label="Show members" className={styles.filters}>
          {FILTERS.map(option => (
            <button key={option.id} type="button" className={cx(styles.filter, filter === option.id && styles.filterOn)} aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>{option.label}</button>
          ))}
        </div>
        <div className={styles.search}>
          <label htmlFor={searchId} className="sr-only">Search members</label>
          <input id={searchId} type="search" className={styles.searchInput} placeholder="Search members" value={query} onChange={event => setQuery(event.target.value)} autoComplete="off" />
        </div>
      </div>
      <section aria-labelledby={headingId}>
        {visible.length ? (
          <ul className={styles.grid} aria-describedby={totalsId}>
            {visible.map(member => <li key={member.ref}><MemberCard session={session} card={member} onOpen={setSelectedRef} /></li>)}
          </ul>
        ) : <EmptyState>{members.length ? "No members match this filter or search." : "No household members yet."}</EmptyState>}
      </section>
      <CharacterDrawer
        card={selected}
        playerName={playerName}
        blockedReason={blockedReason}
        onClose={() => setSelectedRef(null)}
        returnFocus={() => (selectedRef ? document.querySelector<HTMLElement>(`[data-member-ref="${selectedRef}"]`) : null)}
        editHref={selected?.character_capabilities.can_edit_npc_plus ? npcCharacterPath(session, selected.ref) : null}
      />
    </div>
  );
}

function MemberCard({ session, card, onOpen }: { readonly session: ActiveSessionPayload; readonly card: CharacterCardDto; readonly onOpen: (ref: string) => void }) {
  const editable = card.character_capabilities.can_edit_npc_plus;
  return (
    <article className={styles.card}>
      <button type="button" className={styles.body} aria-haspopup="dialog" aria-label={`View ${card.name}`} data-member-ref={card.ref} onClick={() => onOpen(card.ref)}>
        <Avatar url={card.avatar_url} name={card.name} nameKnown={card.name_known} size="lg" />
        <span className={styles.info}>
          <span className={styles.nameRow}>
            <strong className={styles.name}>{card.name}</strong>
            {card.npc_plus ? <Badge tone="accent">NPC+</Badge> : null}
          </span>
          {card.role && card.role !== "Not known" ? <span className={styles.role}>{card.role}</span> : null}
          <span className={styles.meta}>{card.presence === "present" ? "Here" : "Elsewhere"}{card.known_location ? ` · ${card.known_location}` : ""}</span>
          {card.relationship !== "Not recorded" ? <span className={styles.meta}>With you: {card.relationship}</span> : null}
          {card.state !== "Not recorded" ? <Badge>{card.state}</Badge> : null}
        </span>
      </button>
      {editable ? <Link to={npcCharacterPath(session, card.ref)} className={styles.edit} aria-label={`Edit ${card.name}`}>Edit</Link>
        : card.npc_plus && card.character_capabilities.edit_unavailable_reason ? <small className={styles.unavailable}>{card.character_capabilities.edit_unavailable_reason}</small> : null}
    </article>
  );
}
