import { useCallback, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import type { ActiveSessionPayload, PlayerCharacterDto, PortraitEditorDto, PortraitGalleryItemDto } from "../../api/types";
import { Alert } from "../../components/Alert/Alert";
import { Badge } from "../../components/Badge/Badge";
import { Button } from "../../components/Button/Button";
import { EmptyState } from "../../components/ErrorState/ErrorState";
import { Image } from "../../components/Image/Image";
import { playPath } from "../../lib/paths";
import { useActionBlockedReason } from "../../state/serverState";
import { AppearanceForm } from "./AppearanceForm";
import { formFields } from "./appearanceFields";
import { GenerationControls } from "./GenerationControls";
import { PortraitGallery } from "./PortraitGallery";
import { PortraitLightbox } from "./PortraitLightbox";
import { usePortraitActions } from "./usePortraitActions";
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
  // One set of portrait actions and one viewer for the whole page: the figures and the Gallery both open it.
  const actions = usePortraitActions(visual?.ref ?? "");
  const [token, setToken] = useState<string | null>(null);
  const gallerySection = useRef<HTMLElement>(null);
  const busy = actions.pending || !!blockedReason;
  const open = (next: string) => { actions.clearError(); setToken(next); };
  const close = () => { actions.clearError(); setToken(null); };
  // If the thumbnail that opened the viewer is gone (the image was deleted), focus goes to the Gallery section itself.
  const fallbackFocus = useCallback(() => gallerySection.current, []);
  const choose = {
    avatar: (item: PortraitGalleryItemDto) => actions.run({ type: "avatar", item: item.token }),
    fullBody: (item: PortraitGalleryItemDto) => actions.run({ type: "full-body", item: item.token }),
  };
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1 id={headingId} className={styles.title}>{player.name}</h1>
          <Badge>{player.role_label}</Badge>
        </div>
      </header>
      <div className={styles.columns}>
        <div className={styles.visualPane}>
          {visual ? <Figures portrait={visual.editor.portrait} fallbackAvatar={visual.avatar_url} onOpen={open} /> : <EmptyState>Portraits are not available for this character.</EmptyState>}
        </div>
        <div className={styles.details}>
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
          <section className={styles.section} aria-label="Profile and appearance">
            <h2 className={styles.heading}>Profile and appearance</h2>
            <p className={styles.hint}>Visible appearance only: what anyone present can see. Clothing comes from what {player.name} is wearing; background and private history are not part of this profile. The name is fixed.</p>
            <AppearanceForm fields={fields} blockedReason={blockedReason} />
          </section>
          {visual ? (
            <section ref={gallerySection} className={styles.section} aria-labelledby="gallery-heading" tabIndex={-1}>
              <div className={styles.sectionHead}>
                <h2 id="gallery-heading" className={styles.heading}>Gallery</h2>
                {visual.editor.portrait.gallery.length ? <span className={styles.count}>{visual.editor.portrait.gallery.length} of {visual.editor.portrait.gallery_limit}</span> : null}
                {visual.editor.portrait.full_body ? <Button size="sm" disabled={busy} onClick={() => actions.run({ type: "full-body", item: null })}>Clear Full Body</Button> : null}
              </div>
              <GenerationControls portrait={visual.editor.portrait} generating={actions.generating} blockedReason={blockedReason ?? (actions.pending ? "Wait for the current request to finish." : null)} onGenerate={(kind, pose) => actions.run({ type: "generate", kind, pose })} />
              {actions.error && token === null ? <Alert tone="error" onDismiss={actions.clearError}>{actions.error}</Alert> : null}
              <PortraitGallery portrait={visual.editor.portrait} generating={actions.generating} blocked={busy} onOpen={item => open(item.token)} onSetAvatar={choose.avatar} onSetFullBody={choose.fullBody} />
            </section>
          ) : null}
        </div>
      </div>
      {visual ? (
        <PortraitLightbox
          gallery={visual.editor.portrait.gallery}
          token={token}
          onToken={setToken}
          onClose={close}
          busy={busy}
          error={token ? actions.error : null}
          onSetAvatar={choose.avatar}
          onSetFullBody={choose.fullBody}
          onDelete={item => actions.run({ type: "delete", item: item.token })}
          returnFocus={fallbackFocus}
        />
      ) : null}
    </div>
  );
}

/** Avatar and Full Body as the server has selected them. Each opens the viewer on its image when the Gallery holds it. */
function Figures({ portrait, fallbackAvatar, onOpen }: { readonly portrait: PortraitEditorDto; readonly fallbackAvatar: string | null; readonly onOpen: (token: string) => void }) {
  const avatarItem = portrait.gallery.find(item => item.is_avatar), fullBodyItem = portrait.gallery.find(item => item.is_full_body);
  return (
    <>
      <figure className={styles.figure}>
        <Image src={portrait.avatar?.url ?? fallbackAvatar} alt="Avatar" ratio="avatar" fallback={<span className={styles.missing}>No avatar yet</span>}
          {...(avatarItem ? { onOpen: () => onOpen(avatarItem.token), openLabel: "View the Avatar", openProps: { "aria-haspopup": "dialog" as const } } : {})} />
        <figcaption className={styles.caption}>{!portrait.avatar ? "No avatar yet" : portrait.avatar.stale ? "Current Avatar · older appearance" : "Current Avatar"}</figcaption>
      </figure>
      <figure className={styles.figure}>
        <Image src={portrait.full_body?.url} alt="Full body" ratio="fullBody" fit="contain" fallback={<span className={styles.missing}>No full-body image selected</span>}
          {...(fullBodyItem ? { onOpen: () => onOpen(fullBodyItem.token), openLabel: "View the Full Body image", openProps: { "aria-haspopup": "dialog" as const } } : {})} />
        <figcaption className={styles.caption}>{!portrait.full_body ? "No full-body image selected." : portrait.full_body.stale ? "Appearance changed since this image was generated." : "Current Full Body"}</figcaption>
      </figure>
    </>
  );
}
