import type { PortraitEditorDto, PortraitGalleryItemDto, PortraitKindDto } from "../../api/types";
import { Badge } from "../../components/Badge/Badge";
import { Button } from "../../components/Button/Button";
import { EmptyState } from "../../components/ErrorState/ErrorState";
import { Image } from "../../components/Image/Image";
import { cx } from "../../lib/cx";
import styles from "./Character.module.css";

export const KIND_LABELS = { avatar: "Avatar image", fullbody: "Full-body image", legacy: "Earlier image" } as const;

/** Names of the roles an image holds, from the read model's flags. */
export const rolesOf = (item: PortraitGalleryItemDto) => [item.is_avatar ? "Avatar" : "", item.is_full_body ? "Full Body" : ""].filter(Boolean);

/** The accessible name of a thumbnail's button: which image of how many, its kind and the roles it holds. */
export const thumbnailLabel = (item: PortraitGalleryItemDto, index: number, total: number) =>
  `View portrait ${index + 1} of ${total}, ${KIND_LABELS[item.kind]}${rolesOf(item).length ? ` (${rolesOf(item).join(", ")})` : ""}`;

/**
 * The player's Gallery: thumbnails of every stored image with the roles they hold, quick Avatar / Full Body buttons and a viewer. Roles and
 * eligibility are flags of the read model; choosing one only sends the image's opaque token, and the roles shown change when the server's
 * fresh state arrives. A grid of fixed-ratio cells keeps a large Gallery from shifting while its images load (they load lazily).
 */
export function PortraitGallery({ portrait, generating, blocked, onOpen, onSetAvatar, onSetFullBody }: {
  readonly portrait: PortraitEditorDto;
  readonly generating: PortraitKindDto | null;
  readonly blocked: boolean;
  readonly onOpen: (item: PortraitGalleryItemDto) => void;
  readonly onSetAvatar: (item: PortraitGalleryItemDto) => void;
  readonly onSetFullBody: (item: PortraitGalleryItemDto) => void;
}) {
  const { gallery } = portrait;
  if (!gallery.length && !generating) return <EmptyState>No portraits yet. Generate {portrait.batch_size} avatars or {portrait.batch_size} full-body images to start the Gallery.</EmptyState>;
  return (
    <ul className={styles.gallery}>
      {generating ? Array.from({ length: portrait.batch_size }, (_, i) => (
        <li key={`pending-${i}`} className={styles.pendingTile} aria-hidden="true">
          <span className={styles.pendingBox}>{generating === "avatar" ? "Avatar" : "Full body"} {i + 1} of {portrait.batch_size}…</span>
        </li>
      )) : null}
      {gallery.map((item, index) => (
        <li key={item.token} className={styles.galleryItem} data-kind={item.kind}>
          <Image
            src={item.url}
            alt={`Portrait ${index + 1} of ${gallery.length}`}
            ratio="portrait"
            fallback={<span className={styles.missing}>Image unavailable</span>}
            onOpen={() => onOpen(item)}
            openLabel={thumbnailLabel(item, index, gallery.length)}
            openProps={{ "aria-haspopup": "dialog" }}
            className={styles.thumb}
          />
          <span className={styles.badges}>
            {rolesOf(item).map(role => <Badge key={role} tone="accent">{role}</Badge>)}
            {item.stale ? <Badge>Older appearance</Badge> : null}
            <Badge>{KIND_LABELS[item.kind]}</Badge>
          </span>
          <span className={styles.chips}>
            <RoleButton label="Avatar" held={item.is_avatar} allowed={item.can_be_avatar} disabled={blocked} index={index} onClick={() => onSetAvatar(item)} />
            <RoleButton label="Full Body" held={item.is_full_body} allowed={item.can_be_full_body} disabled={blocked} index={index} onClick={() => onSetFullBody(item)} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function RoleButton({ label, held, allowed, disabled, index, onClick }: {
  readonly label: "Avatar" | "Full Body"; readonly held: boolean; readonly allowed: boolean; readonly disabled: boolean; readonly index: number; readonly onClick: () => void;
}) {
  const wrongKind = !held && !allowed;
  return (
    <Button
      size="sm"
      className={cx(held && styles.chipOn)}
      aria-pressed={held}
      aria-label={held ? `${label} (current)` : wrongKind ? `Set portrait ${index + 1} as ${label} (not available for this image kind)` : `Set portrait ${index + 1} as ${label}`}
      title={wrongKind ? (label === "Avatar" ? "Only avatar images can be the Avatar." : "Only full-body images can be the Full Body.") : undefined}
      disabled={disabled || held || wrongKind}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}
