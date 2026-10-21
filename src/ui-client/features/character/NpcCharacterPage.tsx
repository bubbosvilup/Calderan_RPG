import { Fragment, useId, useMemo } from "react";
import { Link } from "react-router";
import { saveNpcAppearance } from "../../api/characters";
import type { ActiveSessionPayload, CharacterCardDto } from "../../api/types";
import { Avatar } from "../../components/Avatar/Avatar";
import { Badge } from "../../components/Badge/Badge";
import { EmptyState } from "../../components/ErrorState/ErrorState";
import { householdPath } from "../../lib/paths";
import { useActionBlockedReason } from "../../state/serverState";
import { AppearanceForm } from "./AppearanceForm";
import { npcFormFields } from "./appearanceFields";
import { PortraitStudio } from "./PortraitStudio";
import styles from "./Character.module.css";

/**
 * The appearance and portrait editor of one NPC+. It exists only for a character the engine reports as editable (`can_edit_npc_plus`, with
 * an `appearance_editor` in the read model): the page never derives that from tier, household or presence. Saving, generating and choosing
 * images are the same requests the player's page uses, aimed at this character's opaque ref and carrying the rendered revision.
 */
export function NpcCharacterPage({ session, card }: { readonly session: ActiveSessionPayload; readonly card: CharacterCardDto | null }) {
  const headingId = useId();
  if (!card) {
    return (
      <div className={styles.page}>
        <h1 id={headingId} className={styles.title}>Character</h1>
        <EmptyState>This character is not in your household or the scene right now, so there is nothing to edit.</EmptyState>
        <Link to={householdPath(session)}>Back to the household</Link>
      </div>
    );
  }
  const editor = card.appearance_editor;
  if (!card.character_capabilities.can_edit_npc_plus || !editor) {
    return (
      <div className={styles.page}>
        <h1 id={headingId} className={styles.title}>{card.name}</h1>
        <EmptyState>{card.character_capabilities.edit_unavailable_reason ?? "Only an NPC+ can have its appearance and portraits edited."}</EmptyState>
        <Link to={householdPath(session)}>Back to the household</Link>
      </div>
    );
  }
  return <Editor session={session} card={card} editor={editor} />;
}

function Editor({ session, card, editor }: { readonly session: ActiveSessionPayload; readonly card: CharacterCardDto; readonly editor: NonNullable<CharacterCardDto["appearance_editor"]> }) {
  const blockedReason = useActionBlockedReason(session.status);
  const headingId = useId();
  const fields = useMemo(() => npcFormFields(editor.fields), [editor.fields]);
  const details = (
    <section className={styles.section} aria-label="Details">
      <h2 className={styles.heading}>Details</h2>
      <dl className={styles.facts}>
        {card.role && card.role !== "Not known" ? <><dt>Role</dt><dd>{card.role}</dd></> : null}
        {card.relationship !== "Not recorded" ? <><dt>With {session.player_character?.name ?? "you"}</dt><dd>{card.relationship}</dd></> : null}
        <dt>Where</dt><dd>{card.where}</dd>
        {card.state !== "Not recorded" ? <><dt>State</dt><dd>{card.state}</dd></> : null}
        {editor.identity.map(line => <Fragment key={line.label}><dt>{line.label}</dt><dd>{line.value}</dd></Fragment>)}
      </dl>
      <div>
        <h3 className={styles.subheading}>Resolved permanent appearance</h3>
        <p className={styles.prose}>{card.appearance}</p>
        <p className={styles.hint}>This is the visible-appearance text the narrator receives every turn, as character data and never as instructions. Unsaved edits are not included.</p>
      </div>
    </section>
  );
  const form = (
    <section className={styles.section} aria-label="Permanent appearance">
      <h2 className={styles.heading}>Permanent appearance</h2>
      <p className={styles.hint}>Permanent appearance only: not current wounds, illness, clothing or mood. Fields hold saved values; reference text under a field is shown for context and is never copied when you save.</p>
      <AppearanceForm label={`Permanent appearance of ${card.name}`} fields={fields} blockedReason={blockedReason} save={(patch, revision) => saveNpcAppearance({ ref: card.ref, patch, expectedRevision: revision })} />
    </section>
  );
  return (
    <div className={styles.page}>
      <nav aria-label="Breadcrumb"><Link to={householdPath(session)}>‹ Back to the household</Link></nav>
      <header className={styles.pageHeader}>
        <div className={styles.identity}>
          <Avatar url={card.avatar_url} name={card.name} nameKnown={card.name_known} size="lg" />
          <div>
            <h1 id={headingId} className={styles.title}>{card.name}</h1>
            <Badge tone="accent">NPC+</Badge>
          </div>
        </div>
      </header>
      <PortraitStudio editorRef={card.ref} portrait={editor.portrait} fallbackAvatar={card.avatar_url} status={session.status}>
        {({ figures, gallery }) => (
          <div className={styles.columns}>
            <div className={styles.visualPane}>{figures}</div>
            <div className={styles.details}>{details}{form}{gallery}</div>
          </div>
        )}
      </PortraitStudio>
    </div>
  );
}
