import { usePlaySession } from "../../state/playSession";
import { SessionPage } from "../session/SessionPage";
import { InventoryPage } from "./InventoryPage";

/** `…/inventory`: the inventory page of the open session. */
export function InventoryRoute() {
  const { session } = usePlaySession();
  return <SessionPage session={session} title="Inventory"><InventoryPage session={session} /></SessionPage>;
}
