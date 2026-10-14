import { createBrowserRouter, type RouteObject } from "react-router";
import { CampaignsPage } from "../features/campaigns/CampaignsPage";
import { RootLayout } from "./RootLayout";
import { RouteError } from "./RouteError";

/**
 * Routes. Served under /app/ (Vite `base`), so `/app/play/<id>` is `/play/<id>` here. Only implemented screens have routes; later modules
 * (character sheet, inventory, household, property, world, journal, settings) add a route when they exist, lazily loaded like the play
 * screen. A feature that is a drawer or a panel (not a page) gets no route.
 */
export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <CampaignsPage /> },
      { path: "play", lazy: async () => ({ Component: (await import("../features/play/PlayRoute")).PlayRoute }) },
      { path: "play/:campaignId", lazy: async () => ({ Component: (await import("../features/play/PlayRoute")).PlayRoute }) },
      { path: "*", element: <RouteError notFound /> },
    ],
  },
];

const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

export const createAppRouter = () => createBrowserRouter(routes, { basename });
