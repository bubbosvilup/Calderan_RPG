import { useId, useState } from "react";
import { Link } from "react-router";
import { keepTrack } from "../../api/characters";
import type { ActiveSessionPayload, CharacterCardDto, ParticipantDto, ProvisionalPersonDto } from "../../api/types";
import { Avatar } from "../../components/Avatar/Avatar";
import { Button } from "../../components/Button/Button";
import { EmptyState } from "../../components/ErrorState/ErrorState";
import { cx } from "../../lib/cx";
import { playerCharacterPath } from "../../lib/paths";
import { errorMessage, useSessionAction } from "../../state/serverState";
import styles from "./Characters.module.css";

/**
 * People the player can see: who is in the scene (the player, Campaign NPCs, NPC+), the scene's temporary people, and the household.
 * Every name and category arrives masked from the server's knowledge-aware projection; opaque refs are used as keys and request handles,
 * never shown. A row opens the character drawer only when the read model provides a card for it.
 */
export function CharacterSidebar({ session, onOpenCharacter, blockedReason, onSettled }: {
  readonly session: ActiveSessionPayload;
  readonly onOpenCharacter: (ref: string) => void;
  readonly blockedReason: string | null;
  readonly onSettled?: () => void;
}) {
  const participants = session.play.participants;
  const members = session.play.household.flatMap(group => group.members);
  const here = members.filter(m => m.presence === "present").length;
  const playerAvatar = session.player_character?.visual?.avatar_url ?? null;
  const sceneHeading = useId(), householdHeading = useId();
  return (
    <div className={styles.sidebar}>
      <section className={styles.section} aria-labelledby={sceneHeading}>
        <div className={styles.sectionHead}>
          <h2 id={sceneHeading} className={styles.heading}>In the scene</h2>
          <span className={styles.count}>{participants.length} present</span>
        </div>
        <ul className={styles.list}>
          {participants.map(person => (
            <li key={person.ref}><ParticipantRow person={person} playerAvatar={playerAvatar} playerHref={playerCharacterPath(session)} onOpen={onOpenCharacter} /></li>
          ))}
        </ul>
        <TemporaryPeople people={session.provisional.people} blockedReason={blockedReason} {...(onSettled ? { onSettled } : {})} />
      </section>
      <section className={styles.section} aria-labelledby={householdHeading}>
        <div className={styles.sectionHead}>
          <h2 id={householdHeading} className={styles.heading}>{session.play.household_title}</h2>
          {members.length ? <span className={styles.count}>{here} here · {members.length - here} away</span> : null}
        </div>
        {members.length ? (
          <ul className={styles.list}>
            {members.map(member => <li key={member.ref}><CardRow card={member} detail={member.presence === "present" ? `Here${member.known_location ? ` · ${member.known_location}` : ""}` : "Away"} onOpen={onOpenCharacter} /></li>)}
          </ul>
        ) : <EmptyState>No household members yet.</EmptyState>}
      </section>
    </div>
  );
}

function ParticipantRow({ person, playerAvatar, playerHref, onOpen }: {
  readonly person: ParticipantDto; readonly playerAvatar: string | null; readonly playerHref: string; readonly onOpen: (ref: string) => void;
}) {
  if (person.card) return <CardRow card={person.card} detail={person.category} onOpen={onOpen} />;
  // The player's own entry is a link to the player character page (a page, not a drawer: it holds the appearance editor and the Gallery).
  if (person.ref === "player") {
    return (
      <Link to={playerHref} className={cx(styles.row, styles.interactive)} aria-label={`${person.name}: open the character page`}>
        <Avatar url={playerAvatar} name={person.name} nameKnown={person.name_known !== false} />
        <span className={styles.who}><strong className={styles.name}>{person.name}</strong><small className={styles.detail}>{person.category}</small></span>
      </Link>
    );
  }
  // Any other entry without a card is information, not a control.
  return (
    <div className={styles.row}>
      <Avatar url={null} name={person.name} nameKnown={person.name_known !== false} />
      <span className={styles.who}><strong className={styles.name}>{person.name}</strong><small className={styles.detail}>{person.category}</small></span>
    </div>
  );
}

function CardRow({ card, detail, onOpen }: { readonly card: CharacterCardDto; readonly detail: string; readonly onOpen: (ref: string) => void }) {
  return (
    <button type="button" className={cx(styles.row, styles.interactive, card.npc_plus && styles.npcPlus)} aria-haspopup="dialog" onClick={() => onOpen(card.ref)} data-character-ref={card.ref}>
      <Avatar url={card.avatar_url} name={card.name} nameKnown={card.name_known} />
      <span className={styles.who}><strong className={styles.name}>{card.name}</strong><small className={styles.detail}>{detail}</small></span>
    </button>
  );
}

/** Temporary (provisional) people: not characters yet. "Keep track" asks the engine to make one an ordinary Campaign NPC. */
function TemporaryPeople({ people, blockedReason, onSettled }: { readonly people: readonly ProvisionalPersonDto[]; readonly blockedReason: string | null; readonly onSettled?: () => void }) {
  const keep = useSessionAction("keep-track", (token: string, revision) => keepTrack({ token, expectedRevision: revision }));
  const [failure, setFailure] = useState<{ readonly token: string; readonly message: string } | null>(null);
  const headingId = useId();
  if (!people.length) return null;
  const onKeep = (token: string) => {
    if (keep.isPending) return;
    setFailure(null);
    keep.mutate(token, { onError: error => setFailure({ token, message: errorMessage(error, "That person could not be kept. Nothing changed.") }), onSettled: () => onSettled?.() });
  };
  return (
    <div className={styles.temporary} role="group" aria-labelledby={headingId}>
      <h3 id={headingId} className={styles.subheading}>Temporary</h3>
      <ul className={styles.list}>
        {people.map(person => (
          <li key={person.token} className={styles.temporaryRow} data-keep-token={person.token}>
            <span className={styles.who}>
              <strong className={styles.name}>{person.label}</strong>
              <small className={styles.detail}>{person.keepable ? (person.held ? "Temporary · held" : "Temporary · not kept") : person.reason ?? "Cannot be kept"}</small>
            </span>
            <Button size="sm" onClick={() => onKeep(person.token)} disabled={!person.keepable || keep.isPending || !!blockedReason} aria-label={`Keep track of ${person.label}`}>
              {keep.isPending && keep.variables === person.token ? "Keeping…" : "Keep track"}
            </Button>
            {failure?.token === person.token ? <p className={styles.error} role="alert">{failure.message}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The card behind an opaque ref in the current read model (scene participants, then household), or null when it is gone. */
export function findCharacterCard(session: ActiveSessionPayload, ref: string): CharacterCardDto | null {
  return session.play.participants.find(p => p.card?.ref === ref)?.card
    ?? session.play.household.flatMap(group => group.members).find(member => member.ref === ref)
    ?? null;
}
