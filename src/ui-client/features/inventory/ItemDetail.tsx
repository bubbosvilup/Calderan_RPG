import type { InventoryItemDto } from "../../api/types";
import { Badge } from "../../components/Badge/Badge";
import { Image } from "../../components/Image/Image";
import { positionLabel } from "./InventoryItemCard";
import styles from "./Inventory.module.css";

/** The selected item in full: larger artwork (the detail role), description, category and state. Read-only; no actions exist yet. */
export function ItemDetail({ item }: { readonly item: InventoryItemDto | null }) {
  if (!item) return <p className={styles.detailEmpty}>Select an item to see it here.</p>;
  return (
    <div className={styles.detailBody}>
      <div className={styles.detailArt}>
        <Image src={item.visual.detail.url} alt={item.name} ratio="avatar" fit="contain" fallback={<span className={styles.initial}>{item.category_label.charAt(0).toUpperCase() || "◇"}</span>} />
      </div>
      <div className={styles.detailText}>
        <h3 className={styles.detailName}>{item.name}</h3>
        <div className={styles.badges}>
          <Badge>{item.category_label}</Badge>
          <Badge tone={item.equipped ? "accent" : "neutral"}>{positionLabel(item.position.kind)}</Badge>
          {item.sprite_status === "pending" ? <Badge>Illustration on its way</Badge> : null}
        </div>
        <p className={styles.description}>{item.description || "No description available."}</p>
        <dl className={styles.facts}>
          <dt>State</dt><dd>{item.state_label}</dd>
          {item.held_for_other ? <><dt>Ownership</dt><dd>Belongs to someone else.</dd></> : null}
        </dl>
      </div>
    </div>
  );
}
