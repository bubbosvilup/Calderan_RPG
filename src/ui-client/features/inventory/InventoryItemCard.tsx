import { memo } from "react";
import type { InventoryItemDto } from "../../api/types";
import { Image } from "../../components/Image/Image";
import { cx } from "../../lib/cx";
import styles from "./Inventory.module.css";

/** How the item is held, from the read model's position kind. A kind this client does not know is shown as Unknown, never guessed. */
export function positionLabel(kind: string): string {
  return kind === "carried" ? "Carried" : kind === "equipped" ? "Equipped" : kind === "stored" ? "Stored" : "Unknown";
}

/** The accessible name of an item cell: its name, how it is held and, when it applies, that it belongs to someone else. */
export const itemLabel = (item: InventoryItemDto) => `${item.name}, ${positionLabel(item.position.kind).toLowerCase()}${item.held_for_other ? ", belongs to someone else" : ""}`;

/**
 * One inventory item: its icon, name and how it is held. A real button (selection is presentation state of the page). Everything shown is
 * a field of the read model; the card decides nothing about the item (what it can do, where it may go). The icon URL comes from the server;
 * a missing or failed image falls back to the category's initial.
 */
export const InventoryItemCard = memo(function InventoryItemCard({ item, selected, onSelect }: {
  readonly item: InventoryItemDto;
  readonly selected: boolean;
  readonly onSelect: (id: string) => void;
}) {
  return (
    <button type="button" className={cx(styles.card, selected && styles.selected, item.equipped && styles.equipped)} aria-pressed={selected} aria-label={itemLabel(item)} title={item.name} onClick={() => onSelect(item.id)}>
      <span className={styles.icon}>
        <Image src={item.visual.icon.url} alt="" ratio="avatar" fit="contain" fallback={<span className={styles.initial} aria-hidden="true">{item.category_label.charAt(0).toUpperCase() || "◇"}</span>} />
        {item.sprite_status === "pending" ? <span className={styles.pending} title="Illustration on its way" /> : null}
      </span>
      <span className={styles.cardText}>
        <strong className={styles.itemName}>{item.name}</strong>
        <small className={styles.itemMeta}>{positionLabel(item.position.kind)}{item.held_for_other ? " · not yours" : ""}</small>
      </span>
    </button>
  );
});
