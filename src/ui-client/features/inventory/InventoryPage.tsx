import { useEffect, useId, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../api/queryKeys";
import type { ActiveSessionPayload, InventoryItemDto } from "../../api/types";
import { EmptyState } from "../../components/ErrorState/ErrorState";
import { cx } from "../../lib/cx";
import { EquipmentPanel } from "./EquipmentPanel";
import { InventoryItemCard } from "./InventoryItemCard";
import { ItemDetail } from "./ItemDetail";
import styles from "./Inventory.module.css";

type Filter = "all" | "carried" | "equipped";
const FILTERS: readonly { readonly id: Filter; readonly label: string }[] = [{ id: "all", label: "All" }, { id: "carried", label: "Carried" }, { id: "equipped", label: "Equipped" }];
const SPRITE_POLL_MS = 2000;

const matches = (item: InventoryItemDto, query: string) => !query || `${item.name} ${item.description ?? ""} ${item.category_label}`.toLowerCase().includes(query);

/**
 * Nicco's inventory, exactly as the engine's Inventory read model describes it: items, how each is held, gold, the equipment figure. The
 * filter, the search text and the selection are presentation state; nothing here decides what Nicco owns, carries or may do with an item. While
 * an item illustration is still being made, the session read model is refreshed every two seconds (the same cache, no second source).
 */
export function InventoryPage({ session }: { readonly session: ActiveSessionPayload }) {
  const { inventory } = session;
  const client = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const headingId = useId(), searchId = useId(), countId = useId();
  const pending = inventory.items.some(item => item.sprite_status === "pending");
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => void client.invalidateQueries({ queryKey: queryKeys.session }), SPRITE_POLL_MS);
    return () => clearTimeout(timer);
  }, [pending, client, inventory]);
  const needle = query.trim().toLowerCase();
  const visible = useMemo(() => inventory.items.filter(item => (filter === "all" || item.position.kind === filter) && matches(item, needle)), [inventory.items, filter, needle]);
  const selected = inventory.items.find(item => item.id === selectedId) ?? null;
  const { total, carried, equipped } = inventory.counts;
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1 id={headingId} className={styles.pageTitle}>Inventory</h1>
          <p id={countId} className={styles.summary}>{total} {total === 1 ? "item" : "items"} · {carried} carried · {equipped} equipped</p>
        </div>
        <dl className={styles.gold}>
          <dt>Gold</dt>
          <dd data-testid="inventory-gold">{inventory.gold === null ? "Not tracked" : inventory.gold}</dd>
        </dl>
      </header>
      <div className={styles.controls}>
        <div role="group" aria-label="Show items" className={styles.filters}>
          {FILTERS.map(option => (
            <button key={option.id} type="button" className={cx(styles.filter, filter === option.id && styles.filterOn)} aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>{option.label}</button>
          ))}
        </div>
        <div className={styles.search}>
          <label htmlFor={searchId} className="sr-only">Search items</label>
          <input id={searchId} type="search" className={styles.searchInput} placeholder="Search items" value={query} onChange={event => setQuery(event.target.value)} autoComplete="off" />
        </div>
      </div>
      <div className={styles.layout}>
        <section className={styles.listArea} aria-labelledby={headingId}>
          {visible.length ? (
            <ul className={styles.grid} aria-describedby={countId}>
              {visible.map(item => <li key={item.id}><InventoryItemCard item={item} selected={item.id === selectedId} onSelect={setSelectedId} /></li>)}
            </ul>
          ) : (
            <EmptyState>{inventory.items.length ? "No items match this filter or search." : "Your inventory is empty. Items you take or equip will appear here."}</EmptyState>
          )}
        </section>
        <aside className={styles.side} aria-label="Selected item and equipment">
          <section className={styles.panel} aria-label="Item details">
            <h2 className={styles.panelTitle}>Item</h2>
            <ItemDetail item={selected} />
          </section>
          <section className={styles.panel} aria-label="Equipment">
            <h2 className={styles.panelTitle}>Equipment</h2>
            <EquipmentPanel equipment={inventory.equipment} items={inventory.items} onSelect={setSelectedId} />
          </section>
        </aside>
      </div>
    </div>
  );
}
