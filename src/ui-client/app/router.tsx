import { createBrowserRouter, type RouteObject } from "react-router";
import { CampaignsPage } from "../features/campaigns/CampaignsPage";
import { RootLayout } from "./RootLayout";
import { RouteError } from "./RouteError";

/**
 * Routes. Served under /app/ (Vite `base`), so `/app/play/<id>` is `/play/<id>` here. Only implemented screens have routes; later modules
 * (household, property, world, journal, settings) add a route when they exist, lazily loaded like the play screen. A feature that is a
 * drawer, a modal or a panel (not a page) gets no route: the gallery and the lightbox live inside the player character page.
 *
 * The `play` route is the session layout: it owns the server-state query and hands the session to the page the URL selects. The pages exist
 * under `/play/…` for the disposable playtest session (no campaign) and under `/play/:campaignId/…` for a persistent campaign.
 */
const sessionPages: RouteObject[] = [
  { index: true, lazy: async () => ({ Component: (await import("../features/play/PlayPage")).PlayPage }) },
  { path: "inventory", lazy: async () => ({ Component: (await import("../features/inventory/InventoryRoute")).InventoryRoute }) },
  { path: "character/player", lazy: async () => ({ Component: (await import("../features/character/PlayerCharacterRoute")).PlayerCharacterRoute }) },
];

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <CampaignsPage /> },
      {
        path: "play",
        lazy: async () => ({ Component: (await import("../features/play/PlayRoute")).PlayRoute }),
        children: [...sessionPages, { path: ":campaignId", children: sessionPages }],
      },
      { path: "*", element: <RouteError notFound /> },
    ],
  },
];

const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

export const createAppRouter = () => createBrowserRouter(routes, { basename });
