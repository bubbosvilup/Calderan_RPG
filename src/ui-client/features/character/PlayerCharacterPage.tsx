import { useId, useMemo } from "react";
import { Link } from "react-router";
import { saveProfile } from "../../api/player";
import type { ActiveSessionPayload, PlayerCharacterDto } from "../../api/types";
import { Badge } from "../../components/Badge/Badge";
import { EmptyState } from "../../components/ErrorState/ErrorState";
import { playPath } from "../../lib/paths";
import { useActionBlockedReason } from "../../state/serverState";
import { AppearanceForm } from "./AppearanceForm";
import { formFields } from "./appearanceFields";
import { PortraitStudio } from "./PortraitStudio";
import styles from "./Character.module.css";

/**
 * The player character's page: who they are, what they look like, their Gallery. Everything comes from the session read model (the profile
 * and the player's visual state); the page invents no stat, class or level. The visual tools are the same portrait pipeline NPC+ characters
 * use, in player mode: the player is not an NPC+ and has no record of one.
 */
export function PlayerCharacterPage({ session }: { readonly session: ActiveSessionPayload }) {
  const player = session.player_character;
  const headingId = useId();
  if (!player) {
    return (
      <div className={styles.page}>
        <h1 id={headingId} className={styles.title}>Character</h1>
        <EmptyState>This campaign has no player character to show.</EmptyState>
        <Link to={playPath(session)}>Back to the story</Link>
      </div>
    );
  }
  return <PlayerCharacter session={session} player={player} />;
}

function PlayerCharacter({ session, player }: { readonly session: ActiveSessionPayload; readonly player: PlayerCharacterDto }) {
  const blockedReason = useActionBlockedReason(session.status);
  const headingId = useId();
  const visual = player.visual;
  const fields = useMemo(() => formFields(player.identity, visual?.editor.fields ?? []), [player.identity, visual]);
  const details = (
    <section className={styles.section} aria-label="Details">
      <h2 className={styles.heading}>Details</h2>
      <dl className={styles.facts}>
        <dt>Gold</dt><dd data-testid="character-gold">{session.play.gold === null ? "Not tracked" : session.play.gold}</dd>
        <dt>Location</dt><dd>{session.scene.location}</dd>
      </dl>
      {player.narrator_summary ? (
        <div>
          <h3 className={styles.subheading}>The narrator sees</h3>
          <p className={styles.prose}>{player.narrator_summary}</p>
        </div>
      ) : null}
    </section>
  );
  const form = (
    <section className={styles.section} aria-label="Profile and appearance">
      <h2 className={styles.heading}>Profile and appearance</h2>
      <p className={styles.hint}>Visible appearance only: what anyone present can see. Clothing comes from what {player.name} is wearing; background and private history are not part of this profile. The name is fixed.</p>
      <AppearanceForm fields={fields} blockedReason={blockedReason} save={(patch, revision) => saveProfile({ patch, expectedRevision: revision })} />
    </section>
  );
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1 id={headingId} className={styles.title}>{player.name}</h1>
          <Badge>{player.role_label}</Badge>
        </div>
      </header>
      {visual ? (
        <PortraitStudio editorRef={visual.ref} portrait={visual.editor.portrait} fallbackAvatar={visual.avatar_url} status={session.status}>
          {({ figures, gallery }) => (
            <div className={styles.columns}>
              <div className={styles.visualPane}>{figures}</div>
              <div className={styles.details}>{details}{form}{gallery}</div>
            </div>
          )}
        </PortraitStudio>
      ) : (
        <div className={styles.columns}>
          <div className={styles.visualPane}><EmptyState>Portraits are not available for this character.</EmptyState></div>
          <div className={styles.details}>{details}{form}</div>
        </div>
      )}
    </div>
  );
}
