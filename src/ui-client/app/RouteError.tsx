import { Link, isRouteErrorResponse, useRouteError } from "react-router";
import { ErrorState } from "../components/ErrorState/ErrorState";
import { CampaignLayout } from "../layouts/CampaignLayout";

/** Unknown routes and unexpected render errors. Never shows an exception message or stack: only what the player can do next. */
export function RouteError({ notFound = false }: { readonly notFound?: boolean }) {
  const error = useRouteError();
  const missing = notFound || (isRouteErrorResponse(error) && error.status === 404);
  if (!missing && error) console.error("Caldrevan UI route error", error);
  return (
    <CampaignLayout>
      <ErrorState
        title={missing ? "Nothing here" : "This screen failed to load"}
        message={missing ? "That page does not exist in this version of Caldrevan." : "Something went wrong while showing this screen. Your campaign is safe on the game server; reload to try again."}
        action={<Link to="/">Back to campaigns</Link>}
      />
    </CampaignLayout>
  );
}
