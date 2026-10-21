import { usePlaySession } from "../../state/playSession";
import { SessionPage } from "../session/SessionPage";
import { HouseholdPage } from "./HouseholdPage";

/** `…/household`: the household page of the open session. */
export function HouseholdRoute() {
  const { session } = usePlaySession();
  return <SessionPage session={session} title="Household"><HouseholdPage session={session} /></SessionPage>;
}
