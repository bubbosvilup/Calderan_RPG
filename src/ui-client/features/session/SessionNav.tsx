import { NavLink } from "react-router";
import type { ActiveSessionPayload } from "../../api/types";
import { householdPath, inventoryPath, playerCharacterPath, playPath, settingsPath } from "../../lib/paths";
import styles from "./SessionNav.module.css";

/**
 * The one navigation of an open session, shown in the header of every page of it (the story, Household, Inventory, the player's page,
 * Settings). Every link stays inside the campaign the server has open. The story page keeps the composer draft across these links because
 * the session route above owns it.
 */
export function SessionNav({ session }: { readonly session: ActiveSessionPayload }) {
  const characterName = session.player_character?.name ?? "Character";
  const link = ({ isActive }: { readonly isActive: boolean }) => (isActive ? styles.active : styles.link);
  return (
    <nav className={styles.nav} aria-label="Campaign pages">
      <NavLink to={playPath(session)} end className={link}>Play</NavLink>
      <NavLink to={householdPath(session)} className={link}>Household</NavLink>
      <NavLink to={inventoryPath(session)} className={link}>Inventory</NavLink>
      <NavLink to={playerCharacterPath(session)} className={link}>{characterName}</NavLink>
      <NavLink to={settingsPath(session)} className={link}>Settings</NavLink>
    </nav>
  );
}
