import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Composer } from "./Composer";
import { renderWithProviders } from "../../test/render";

const composer = (props: Partial<Parameters<typeof Composer>[0]> = {}) => {
  const onSubmit = props.onSubmit ?? vi.fn(async () => true);
  const view = renderWithProviders(<Composer playerName="Nicco" locked={false} busy={false} statusText="Your turn." onSubmit={onSubmit} {...props} />);
  return { onSubmit, view, input: screen.getByLabelText("What Nicco says or does") as HTMLTextAreaElement };
};

describe("Composer", () => {
  it("sends on Enter, inserts a newline on Shift+Enter, and clears only a taken draft", async () => {
    const { onSubmit, input } = composer();
    await userEvent.type(input, "Hello{Shift>}{Enter}{/Shift}there{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("Hello\nthere");
    expect(input.value).toBe("");
  });
  it("keeps the draft when the submission was refused", async () => {
    const { input } = composer({ onSubmit: vi.fn(async () => false) });
    await userEvent.type(input, "Deal.{Enter}");
    expect(input.value).toBe("Deal.");
  });
  it("accepts one submission at a time (rapid Enter does not double-send)", async () => {
    let release!: (taken: boolean) => void;
    const onSubmit = vi.fn(() => new Promise<boolean>(resolve => { release = resolve; }));
    const { input } = composer({ onSubmit });
    await userEvent.type(input, "Once{Enter}{Enter}{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    release(true);
  });
  it("does not send while locked and says why through the status line", async () => {
    const { onSubmit, input } = composer({ locked: true, statusText: "Thinking…" });
    await userEvent.type(input, "x{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(within(screen.getByRole("form", { name: "Your action" })).getByRole("status").textContent).toBe("Thinking…");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });
  it("returns focus to the input when the page unlocks after a turn it sent", async () => {
    const { input, view } = composer();
    await userEvent.type(input, "Hi{Enter}");
    view.rerender(<Composer playerName="Nicco" locked busy statusText="Thinking…" onSubmit={async () => true} />);
    input.blur();
    view.rerender(<Composer playerName="Nicco" locked={false} busy={false} statusText="Your turn." onSubmit={async () => true} />);
    expect(document.activeElement).toBe(input);
  });
});
