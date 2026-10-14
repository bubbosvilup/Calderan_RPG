import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Drawer } from "../Drawer/Drawer";
import { Modal } from "./Modal";

/** The Modal accessibility contract (UI2-14). The app root is `#root`, as in index.html, so inertness of the background is observable. */
function Harness({ dismissOnBackdrop, onClose = () => undefined, nested = false }: { readonly dismissOnBackdrop?: boolean; readonly onClose?: () => void; readonly nested?: boolean }) {
  const [open, setOpen] = useState(false), [inner, setInner] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open it</button>
      <a href="#elsewhere">Elsewhere</a>
      <Modal open={open} title="Rename the thing" onClose={() => { onClose(); setOpen(false); }} {...(dismissOnBackdrop !== undefined ? { dismissOnBackdrop } : {})}
        actions={<><button type="button" onClick={() => setOpen(false)}>Cancel</button><button type="button" onClick={() => nested ? setInner(true) : setOpen(false)}>{nested ? "Open inner" : "Save"}</button></>}>
        <label>Name <input /></label>
      </Modal>
      <Modal open={inner} title="Are you sure" onClose={() => setInner(false)}><button type="button" onClick={() => setInner(false)}>Yes</button></Modal>
    </>
  );
}
const mount = (ui: React.ReactElement) => {
  const root = document.createElement("div");
  root.id = "root";
  document.body.append(root);
  const view = render(ui, { container: root });
  return { ...view, root };
};

describe("Modal", () => {
  it("still closes on Escape when focus fell to the page body (the focused control became disabled)", async () => {
    const onClose = vi.fn();
    mount(<Harness onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Open it" }));
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is a labelled, modal dialog with a title, content and actions", async () => {
    mount(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open it" }));
    const dialog = screen.getByRole("dialog", { name: "Rename the thing" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(within(dialog).getByRole("heading", { level: 2, name: "Rename the thing" })).toBeTruthy();
    expect(within(dialog).getByLabelText("Name")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Close Rename the thing" })).toBeTruthy();
  });

  it("moves focus in, traps Tab and Shift+Tab, and makes the background inert and unscrollable while open", async () => {
    const { root } = mount(<Harness />);
    const opener = screen.getByRole("button", { name: "Open it" });
    await userEvent.click(opener);
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(root.inert).toBe(true);
    expect(document.documentElement.dataset.scrollLocked).toBe("true");
    for (let i = 0; i < 8; i++) { await userEvent.tab(); expect(dialog.contains(document.activeElement)).toBe(true); }
    for (let i = 0; i < 8; i++) { await userEvent.tab({ shift: true }); expect(dialog.contains(document.activeElement)).toBe(true); }
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(root.inert).toBe(false);
    expect(document.documentElement.dataset.scrollLocked).toBeUndefined();
    expect(document.activeElement).toBe(opener);
  });

  it("closes on Escape and returns focus to the control that opened it", async () => {
    const onClose = vi.fn();
    mount(<Harness onClose={onClose} />);
    const opener = screen.getByRole("button", { name: "Open it" });
    await userEvent.click(opener);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("does not close from a click outside unless asked to (a dialog holding input must survive a stray click)", async () => {
    const { unmount } = mount(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open it" }));
    expect(document.querySelector("[data-dialog-layer] button[tabindex='-1']")).toBeNull();
    await userEvent.click(document.querySelector("[data-dialog-layer]")!);
    expect(screen.getByRole("dialog")).toBeTruthy();
    unmount();
    mount(<Harness dismissOnBackdrop />);
    await userEvent.click(screen.getAllByRole("button", { name: "Open it" }).at(-1)!);
    await userEvent.click(document.querySelector<HTMLButtonElement>("[data-dialog-layer] button[tabindex='-1']")!);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("nesting: a dialog opened above another makes the first inert until it closes, and Escape closes only the top one", async () => {
    mount(<Harness nested />);
    await userEvent.click(screen.getByRole("button", { name: "Open it" }));
    await userEvent.click(screen.getByRole("button", { name: "Open inner" }));
    const [outer, inner] = screen.getAllByRole("dialog", { hidden: true });
    expect((outer!.closest("[data-dialog-layer]") as HTMLElement).inert).toBe(true);
    expect(!!(inner!.closest("[data-dialog-layer]") as HTMLElement).inert).toBe(false);
    expect(document.documentElement.dataset.scrollLocked).toBe("true");
    await userEvent.keyboard("{Escape}");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(!!(screen.getByRole("dialog").closest("[data-dialog-layer]") as HTMLElement).inert).toBe(false);
    expect(document.documentElement.dataset.scrollLocked).toBe("true");
    await userEvent.keyboard("{Escape}");
    expect(document.documentElement.dataset.scrollLocked).toBeUndefined();
  });

  it("has no clickable non-button controls: every interactive element in the dialog is a button, link or form control", async () => {
    mount(<Harness dismissOnBackdrop />);
    await userEvent.click(screen.getByRole("button", { name: "Open it" }));
    const dialog = screen.getByRole("dialog");
    const clickable = [...dialog.closest("[data-dialog-layer]")!.querySelectorAll<HTMLElement>("[onclick], [role='button'], [tabindex]")].filter(el => el !== dialog);
    expect(clickable.every(el => ["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA"].includes(el.tagName))).toBe(true);
  });
});

describe("Drawer shares the dialog contract", () => {
  it("locks scroll, makes the background inert and restores both on close", async () => {
    const { rerender, root } = mount(<Drawer open title="People" onClose={() => undefined}><button type="button">Inside</button></Drawer>);
    expect(root.inert).toBe(true);
    expect(document.documentElement.dataset.scrollLocked).toBe("true");
    rerender(<Drawer open={false} title="People" onClose={() => undefined}><button type="button">Inside</button></Drawer>);
    expect(root.inert).toBe(false);
    expect(document.documentElement.dataset.scrollLocked).toBeUndefined();
  });
});
