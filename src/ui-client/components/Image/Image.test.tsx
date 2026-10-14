import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Image } from "./Image";

describe("Image", () => {
  it("loads lazily and asynchronously, shows a placeholder until the file arrives, and takes the given alt text", () => {
    const { container } = render(<Image src="/api/portrait/asset/abc" alt="Portrait of Nicco" ratio="portrait" fallback={<span>none</span>} />);
    const img = screen.getByRole("img", { name: "Portrait of Nicco" });
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");
    expect(container.querySelector("[data-state='loading']")).toBeTruthy();
    fireEvent.load(img);
    expect(container.querySelector("[data-state='loaded']")).toBeTruthy();
  });
  it("loads eagerly only when told it is a priority image", () => {
    render(<Image src="/x" alt="Large" priority fallback={null} />);
    expect(screen.getByRole("img").getAttribute("loading")).toBe("eager");
  });
  it("shows the fallback for no URL and for a file that fails, never a broken image", () => {
    const { rerender } = render(<Image src={null} alt="" fallback={<span>no picture</span>} />);
    expect(screen.getByText("no picture")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    rerender(<Image src="/missing" alt="Gone" fallback={<span>image gone</span>} />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByText("image gone")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });
  it("restarts loading when the URL changes", () => {
    const { rerender, container } = render(<Image src="/a" alt="A" fallback={null} />);
    fireEvent.load(screen.getByRole("img"));
    rerender(<Image src="/b" alt="A" fallback={null} />);
    expect(container.querySelector("[data-state='loading']")).toBeTruthy();
  });
  it("supports the avatar, full body and fill modes and contain fit", () => {
    const { container } = render(<><Image src="/a" alt="" ratio="avatar" fallback={null} /><Image src="/b" alt="" ratio="fullBody" fit="contain" fallback={null} /><Image src="/c" alt="" ratio="fill" fallback={null} /></>);
    expect(container.querySelectorAll("img").length).toBe(3);
  });
  it("opens a larger view with a real button named by openLabel, from the keyboard too", async () => {
    const onOpen = vi.fn();
    render(<Image src="/a" alt="Portrait 1 of 2" fallback={null} onOpen={onOpen} openLabel="View portrait 1 of 2" />);
    const button = screen.getByRole("button", { name: "View portrait 1 of 2" });
    expect(button.tagName).toBe("BUTTON");
    button.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});
