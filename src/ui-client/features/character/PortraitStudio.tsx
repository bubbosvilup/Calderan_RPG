import { useCallback, useRef, useState, type ReactNode } from "react";
import type { PortraitEditorDto, PortraitGalleryItemDto } from "../../api/types";
import { Alert } from "../../components/Alert/Alert";
import { Button } from "../../components/Button/Button";
import { Image } from "../../components/Image/Image";
import { useActionBlockedReason } from "../../state/serverState";
import { GenerationControls } from "./GenerationControls";
import { PortraitGallery } from "./PortraitGallery";
import { PortraitLightbox } from "./PortraitLightbox";
import { usePortraitActions } from "./usePortraitActions";
import styles from "./Character.module.css";

/**
 * The portrait tools of one character: the selected Avatar and Full Body, the Gallery, generation, and the viewer. The player's page and an
 * NPC+'s editor page use this one component, so both behave identically: every action is one server request carrying the opaque editor ref
 * and the rendered revision, and the screen ends on the server's state.
 *
 * The pieces are handed to `children` because the two pages place them differently (figures beside the details, Gallery inside them); the
 * viewer is rendered here, once, so the figures and the Gallery share it.
 */
export function PortraitStudio({ editorRef, portrait, fallbackAvatar, status, children }: {
  readonly editorRef: string;
  readonly portrait: PortraitEditorDto;
  readonly fallbackAvatar: string | null;
  /** The session status: the portrait controls wait while the narrator works. */
  readonly status: Parameters<typeof useActionBlockedReason>[0];
  readonly children: (parts: { readonly figures: ReactNode; readonly gallery: ReactNode }) => ReactNode;
}) {
  const blockedReason = useActionBlockedReason(status);
  const actions = usePortraitActions(editorRef);
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
  const figures = <Figures portrait={portrait} fallbackAvatar={fallbackAvatar} onOpen={open} />;
  const gallery = (
    <section ref={gallerySection} className={styles.section} aria-labelledby="gallery-heading" tabIndex={-1}>
      <div className={styles.sectionHead}>
        <h2 id="gallery-heading" className={styles.heading}>Gallery</h2>
        {portrait.gallery.length ? <span className={styles.count}>{portrait.gallery.length} of {portrait.gallery_limit}</span> : null}
        {portrait.full_body ? <Button size="sm" disabled={busy} onClick={() => actions.run({ type: "full-body", item: null })}>Clear Full Body</Button> : null}
      </div>
      <GenerationControls portrait={portrait} generating={actions.generating} blockedReason={blockedReason ?? (actions.pending ? "Wait for the current request to finish." : null)} onGenerate={(kind, pose) => actions.run({ type: "generate", kind, pose })} />
      {actions.error && token === null ? <Alert tone="error" onDismiss={actions.clearError}>{actions.error}</Alert> : null}
      <PortraitGallery portrait={portrait} generating={actions.generating} blocked={busy} onOpen={item => open(item.token)} onSetAvatar={choose.avatar} onSetFullBody={choose.fullBody} />
    </section>
  );
  return (
    <>
      {children({ figures, gallery })}
      <PortraitLightbox
        gallery={portrait.gallery}
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
    </>
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
