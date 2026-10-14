import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { PortraitGalleryItemDto } from "../../api/types";
import { Alert } from "../../components/Alert/Alert";
import { Badge } from "../../components/Badge/Badge";
import { Button } from "../../components/Button/Button";
import { Image } from "../../components/Image/Image";
import { Modal } from "../../components/Modal/Modal";
import { KIND_LABELS, rolesOf } from "./PortraitGallery";
import styles from "./Character.module.css";

const generatedAt = (iso: string) => `Generated ${iso.slice(0, 16).replace("T", " ")} UTC`;

/**
 * A large view of one Gallery image, on the shared Modal: previous/next (buttons and Left/Right keys, wrapping), Escape and the close button,
 * focus kept inside and returned to the thumbnail that opened it. With a single image the step controls are not rendered. Role buttons and
 * Delete send the image's opaque token; the viewer shows whatever the server's next state says. Delete asks for an inline confirmation, and
 * a refusal (an image that holds a role cannot be deleted) arrives as the server's own sentence.
 */
export function PortraitLightbox({ gallery, token, onToken, onClose, busy, error, onSetAvatar, onSetFullBody, onDelete, returnFocus }: {
  readonly gallery: readonly PortraitGalleryItemDto[];
  /** The opened image's token, or null when closed. */
  readonly token: string | null;
  readonly onToken: (token: string) => void;
  readonly onClose: () => void;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onSetAvatar: (item: PortraitGalleryItemDto) => void;
  readonly onSetFullBody: (item: PortraitGalleryItemDto) => void;
  readonly onDelete: (item: PortraitGalleryItemDto) => void;
  readonly returnFocus?: () => HTMLElement | null;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const index = token ? gallery.findIndex(item => item.token === token) : -1;
  const item = index >= 0 ? gallery[index]! : null;
  const step = (delta: number) => {
    if (gallery.length < 2 || index < 0) return;
    setConfirming(null);
    onToken(gallery[(index + delta + gallery.length) % gallery.length]!.token);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); step(event.key === "ArrowLeft" ? -1 : 1); }
  };
  const asking = !!item && confirming === item.token;
  // The confirmation swaps the footer's buttons, so focus is moved by hand: to Cancel when it appears, back to Delete when it is dismissed.
  const cancelRef = useRef<HTMLButtonElement>(null), deleteRef = useRef<HTMLButtonElement>(null), wasAsking = useRef(false);
  useEffect(() => {
    if (asking) cancelRef.current?.focus();
    else if (wasAsking.current) deleteRef.current?.focus();
    wasAsking.current = asking;
  }, [asking]);
  return (
    <Modal
      open={!!item}
      title={item ? `Portrait ${index + 1} of ${gallery.length}` : "Portrait"}
      size="wide"
      onKeyDown={onKeyDown}
      dismissOnBackdrop
      onClose={() => (asking ? setConfirming(null) : onClose())}
      {...(returnFocus ? { returnFocus } : {})}
      actions={item ? (asking ? (
        <>
          <span className={styles.confirmText} role="alert">Delete this image? This cannot be undone.</span>
          <Button ref={cancelRef} onClick={() => setConfirming(null)}>Cancel</Button>
          <Button variant="danger" disabled={busy} onClick={() => onDelete(item)}>Delete image</Button>
        </>
      ) : (
        <>
          <Button disabled={busy || item.is_avatar || !item.can_be_avatar} aria-pressed={item.is_avatar} onClick={() => onSetAvatar(item)}>{item.is_avatar ? "Avatar ✓" : "Set as Avatar"}</Button>
          <Button disabled={busy || item.is_full_body || !item.can_be_full_body} aria-pressed={item.is_full_body} onClick={() => onSetFullBody(item)}>{item.is_full_body ? "Full Body ✓" : "Set as Full Body"}</Button>
          <Button ref={deleteRef} variant="danger" disabled={busy} onClick={() => setConfirming(item.token)}>Delete</Button>
        </>
      )) : undefined}
    >
      {item ? (
        <div className={styles.viewer}>
          <div className={styles.stage}>
            {gallery.length > 1 ? <Button className={styles.step} aria-label="Previous portrait" onClick={() => step(-1)}>‹</Button> : null}
            <div className={styles.bigImage}>
              <Image src={item.url} alt={`Portrait ${index + 1} of ${gallery.length}`} ratio="fill" fit="contain" priority fallback={<span className={styles.missing}>Image unavailable</span>} />
            </div>
            {gallery.length > 1 ? <Button className={styles.step} aria-label="Next portrait" onClick={() => step(1)}>›</Button> : null}
          </div>
          <div className={styles.viewerInfo}>
            <span className={styles.badges}>
              {rolesOf(item).map(role => <Badge key={role} tone="accent">{role}</Badge>)}
              {item.stale ? <Badge>Older appearance</Badge> : null}
            </span>
            <p className={styles.hint}>{[KIND_LABELS[item.kind], item.pose_label ? `Pose: ${item.pose_label}` : "", generatedAt(item.generated_at), item.model_label, item.reference_used ? "Reference used" : ""].filter(Boolean).join(" · ")}</p>
          </div>
          {error ? <Alert tone="error">{error}</Alert> : null}
        </div>
      ) : null}
    </Modal>
  );
}
