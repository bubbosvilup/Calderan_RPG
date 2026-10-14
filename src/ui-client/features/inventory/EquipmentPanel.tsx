import type { InventoryDto, InventoryItemDto } from "../../api/types";
import { Image } from "../../components/Image/Image";
import styles from "./Inventory.module.css";

/**
 * The equipment figure: Nicco's selected Full Body (or the silhouette the server names) and the slots as the read model lists them. Read-only:
 * which item sits in which slot is decided by the engine's categories; this panel only displays it. No equip action exists.
 */
export function EquipmentPanel({ equipment, items, onSelect }: { readonly equipment: InventoryDto["equipment"]; readonly items: readonly InventoryItemDto[]; readonly onSelect: (id: string) => void }) {
  const byId = new Map(items.map(item => [item.id, item] as const));
  const loose = equipment.unclassified_equipped.length;
  return (
    <div className={styles.equipment}>
      <div className={styles.figure}>
        <Image src={equipment.full_body_url ?? equipment.silhouette_url} alt="" ratio="fullBody" fit="contain" fallback={<span className={styles.initial} aria-hidden="true">◇</span>} />
      </div>
      <ul className={styles.slots}>
        {equipment.slots.map(slot => (
          <li key={slot.id} className={styles.slot} data-state={slot.conflict ? "conflict" : slot.item_ids.length ? "filled" : "empty"}>
            <span className={styles.slotLabel}>{slot.label}</span>
            {slot.item_ids.length ? (
              <span className={styles.slotItems}>
                {slot.item_ids.map(id => byId.get(id)).filter((item): item is InventoryItemDto => !!item).map(item => (
                  <button key={item.id} type="button" className={styles.slotItem} onClick={() => onSelect(item.id)}>{item.name}</button>
                ))}
                {slot.conflict ? <small className={styles.warning}>Multiple equipped items</small> : null}
              </span>
            ) : <span className={styles.slotEmpty}>Empty</span>}
          </li>
        ))}
      </ul>
      {loose ? <small className={styles.note}>{loose} equipped {loose === 1 ? "item has" : "items have"} no slot classification.</small> : null}
    </div>
  );
}
