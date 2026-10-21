import { usePlaySession } from "../../state/playSession";
import { SessionPage } from "../session/SessionPage";
import { SettingsPage } from "./SettingsPage";

/** `…/settings`: campaign controls and service diagnostics of the open session. */
export function SettingsRoute() {
  const { session } = usePlaySession();
  return <SessionPage session={session} title="Settings"><SettingsPage session={session} /></SessionPage>;
}
