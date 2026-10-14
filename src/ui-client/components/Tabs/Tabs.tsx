import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import styles from "./Tabs.module.css";

export interface TabItem { readonly id: string; readonly label: string; readonly content: ReactNode }

/**
 * WAI-ARIA tabs: one tab stop for the list, Arrow keys / Home / End move and select, each panel is labelled by its tab. Which tab is
 * open is local presentation state.
 */
export function Tabs({ label, items }: { readonly label: string; readonly items: readonly TabItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  const base = useId(), refs = useRef(new Map<string, HTMLButtonElement>());
  const current = items.some(item => item.id === active) ? active : items[0]?.id ?? "";
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = items.findIndex(item => item.id === current);
    const next = event.key === "ArrowRight" ? index + 1 : event.key === "ArrowLeft" ? index - 1 : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : null;
    if (next === null || !items.length) return;
    event.preventDefault();
    const target = items[(next + items.length) % items.length]!;
    setActive(target.id);
    refs.current.get(target.id)?.focus();
  };
  return (
    <div className={styles.tabs}>
      <div className={styles.list} role="tablist" aria-label={label} onKeyDown={move}>
        {items.map(item => (
          <button
            key={item.id}
            ref={node => { if (node) refs.current.set(item.id, node); else refs.current.delete(item.id); }}
            type="button"
            role="tab"
            id={`${base}-tab-${item.id}`}
            aria-selected={item.id === current}
            aria-controls={`${base}-panel-${item.id}`}
            tabIndex={item.id === current ? 0 : -1}
            className={styles.tab}
            onClick={() => setActive(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {items.map(item => (
        <div key={item.id} role="tabpanel" id={`${base}-panel-${item.id}`} aria-labelledby={`${base}-tab-${item.id}`} hidden={item.id !== current} className={styles.panel} tabIndex={0}>
          {item.id === current ? item.content : null}
        </div>
      ))}
    </div>
  );
}
