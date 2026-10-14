import { Outlet } from "react-router";
import styles from "./RootLayout.module.css";

/** Every screen: a skip link to the screen's <main>, then the route. */
export function RootLayout() {
  return (
    <>
      <a href="#main-content" className={styles.skip}>Skip to content</a>
      <Outlet />
    </>
  );
}
