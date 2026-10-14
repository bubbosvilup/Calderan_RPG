import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActualOfferCard } from "./ActualOfferCard";
import { makeOffer } from "../../test/fixtures";
import { renderWithProviders } from "../../test/render";

const card = (props: Partial<Parameters<typeof ActualOfferCard>[0]> = {}) => {
  const onAccept = vi.fn();
  renderWithProviders(<ActualOfferCard offer={makeOffer()} onAccept={onAccept} pending={false} blockedReason={null} error={null} {...props} />);
  return onAccept;
};

describe("ActualOfferCard", () => {
  it("renders BUY with text and icon, price and lines; Accept sends only the opaque ref", async () => {
    const onAccept = card();
    const region = screen.getByRole("region", { name: "Buy offer" });
    expect(region.textContent).toMatch(/▼ BUY/);
    expect(region.textContent).toMatch(/15 gold/);
    expect(region.textContent).toMatch(/Korvin offers to sell/);
    expect(screen.getByRole("listitem").textContent).toBe("Halberd");
    expect(region.textContent).not.toContain("0ffe7"); // the opaque ref is never displayed
    await userEvent.click(screen.getByRole("button", { name: "Accept offer: Buy Halberd for 15 gold" }));
    expect(onAccept).toHaveBeenCalledWith("0ffe70000000000000000001");
  });
  it("renders SELL distinctly and a person offer with its marker and the masked label as given", () => {
    card({ offer: makeOffer({ direction: "sell", kind: "person", lines: ["Red-haired Slave"], summary: "Sell Red-haired Slave for 5 gold", price_gold: 5, affordable: null }) });
    const region = screen.getByRole("region", { name: "Sell offer" });
    expect(region.textContent).toMatch(/▲ SELL/);
    expect(region.textContent).not.toMatch(/BUY/);
    expect(region.textContent).toMatch(/♟ Person/);
    expect(region.textContent).toMatch(/Red-haired Slave/);
  });
  it("disables Accept for an unaffordable BUY and says why (from the engine's affordable flag)", () => {
    card({ offer: makeOffer({ affordable: false, gold: 10, price_gold: 900 }) });
    const accept = screen.getByRole("button", { name: /Accept offer/ });
    expect(accept).toBeDisabled();
    expect(screen.getByText("Not enough gold (you have 10).")).toBeTruthy();
    expect(accept.getAttribute("aria-describedby")).toBeTruthy();
  });
  it("while a turn runs, Accept is disabled with a visible reason attached to it", () => {
    card({ blockedReason: "Available when the narrator finishes." });
    const accept = screen.getByRole("button", { name: /Accept offer/ });
    expect(accept).toBeDisabled();
    const reason = document.getElementById(accept.getAttribute("aria-describedby")!.split(" ").at(-1)!);
    expect(reason?.textContent).toBe("Available when the narrator finishes.");
  });
  it("shows a refusal as an alert", () => {
    card({ error: "That offer is no longer standing." });
    expect(screen.getByRole("alert").textContent).toBe("That offer is no longer standing.");
  });
});
