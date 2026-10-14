import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmationCard } from "./ConfirmationCard";
import { PendingConfirmations } from "./PendingConfirmations";
import { renderWithProviders } from "../../test/render";

describe("ConfirmationCard", () => {
  it("is reachable and operable from the keyboard alone", async () => {
    const onConfirm = vi.fn(), onCancel = vi.fn();
    renderWithProviders(<><button>before</button><ConfirmationCard title="Free Maren?" body="Maren will be free." confirmLabel="Free her" cancelLabel="Not now" onConfirm={onConfirm} onCancel={onCancel} pending={false} /></>);
    const user = userEvent.setup();
    screen.getByText("before").focus();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Confirm: Free her" }));
    await user.keyboard("{Enter}");
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel: Free Maren? Not now" }));
    await user.keyboard(" ");
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("group", { name: "Free Maren?" })).toBeTruthy();
  });
  it("disables both buttons with the reason attached while unavailable", () => {
    renderWithProviders(<ConfirmationCard title="Free Maren?" body="b" confirmLabel="Free her" cancelLabel="Not now" onConfirm={() => undefined} onCancel={() => undefined} pending={false} unavailableReason="Available when the narrator finishes." />);
    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
      expect(document.getElementById(button.getAttribute("aria-describedby")!)?.textContent).toBe("Available when the narrator finishes.");
    }
  });
});

describe("PendingConfirmations", () => {
  it("renders the engine's cards with their own labels and shows notices only for cards this page showed", () => {
    const card = { ref: "a1", title: "Free Maren?", body: "Maren will be free.", confirm_label: "Free her", cancel_label: "Not now" };
    const { rerender } = renderWithProviders(<PendingConfirmations view={{ cards: [card], recent: [{ ref: "old", status: "confirmed", subject_label: "Someone", text: "Confirmed." }] }} blockedReason={null} />);
    expect(screen.getByRole("button", { name: "Confirm: Free her" })).toBeEnabled();
    expect(screen.queryByText(/Someone/)).toBeNull();
    rerender(<PendingConfirmations view={{ cards: [], recent: [{ ref: "a1", status: "confirmed", subject_label: "Maren", text: "Confirmed." }] }} blockedReason={null} />);
    expect(screen.getByText(/Maren: Confirmed\./)).toBeTruthy();
  });
});
