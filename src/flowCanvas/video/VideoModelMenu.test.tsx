import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createSafeDefaultVideoCapabilities } from "./videoGenerationCapabilities";
import { VideoModelMenu } from "./VideoModelMenu";
import type { VideoModelOption } from "./videoTypes";

const model = (overrides: Partial<VideoModelOption> = {}): VideoModelOption => ({
  blocker: null,
  capabilities: createSafeDefaultVideoCapabilities(),
  description: "Fast motion and cinematic composition for creator videos.",
  estimatedCredits: 12,
  estimatedDurationLabel: "About 1 minute",
  id: "creator-video-1",
  label: "Creator Video 1.0",
  minChargeCredits: 12,
  ...overrides,
});

describe("VideoModelMenu", () => {
  test("renders only the product model name and ETA until a row is hovered, focused, or selected", () => {
    render(<VideoModelMenu error={null} loading={false} onChange={vi.fn()} onRetry={vi.fn()} options={[model()]} value={null} />);

    const option = screen.getByRole("option", { name: /Creator Video 1\.0/ });
    expect(option.textContent).toContain("Creator Video 1.0");
    expect(option.textContent).toContain("About 1 minute");
    expect(screen.getByText(/Fast motion and cinematic composition/).className).toContain("sr-only");

    fireEvent.mouseEnter(option);
    expect(screen.getByText(/Fast motion and cinematic composition/).className).not.toContain("sr-only");

    fireEvent.mouseLeave(option);
    fireEvent.focus(option);
    expect(screen.getByText(/Fast motion and cinematic composition/).className).not.toContain("sr-only");

    fireEvent.blur(option);
    render(<VideoModelMenu error={null} loading={false} onChange={vi.fn()} onRetry={vi.fn()} options={[model()]} value="creator-video-1" />);
    expect(screen.getAllByText(/Fast motion and cinematic composition/)[1]?.className).not.toContain("sr-only");
  });

  test("does not render a search input or internal provider and route fields", () => {
    const unsafeOption = {
      ...model(),
      provider: "Private Provider",
      routeKey: "private.route",
      upstreamModel: "private-upstream",
    } as VideoModelOption;

    render(<VideoModelMenu error={null} loading={false} onChange={vi.fn()} onRetry={vi.fn()} options={[unsafeOption]} value={null} />);

    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByText("Private Provider")).toBeNull();
    expect(screen.queryByText("private.route")).toBeNull();
    expect(screen.queryByText("private-upstream")).toBeNull();
  });

  test("uses stable loading rows and exposes an error retry without injecting mock models", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <VideoModelMenu error={null} loading onChange={vi.fn()} onRetry={onRetry} options={[]} value={null} />,
    );

    const skeletons = screen.getAllByTestId("video-model-skeleton");
    expect(skeletons).toHaveLength(3);
    expect(skeletons[0]?.className).toContain("h-[38px]");

    rerender(<VideoModelMenu error="Catalog unavailable" loading={false} onChange={vi.fn()} onRetry={onRetry} options={[]} value={null} />);
    expect(screen.getByText("Catalog unavailable")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.queryByRole("option")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test("supports listbox keyboard selection and refuses disabled options with an explanation", () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    const disabled = model({ blocker: "PRICING_NOT_FOUND", id: "unpriced", label: "Unpriced Video" });
    const enabled = model({ id: "enabled", label: "Enabled Video" });
    render(
      <VideoModelMenu
        error={null}
        loading={false}
        onChange={onChange}
        onClose={onClose}
        onRetry={vi.fn()}
        options={[disabled, enabled]}
        value={null}
      />,
    );

    const listbox = screen.getByRole("listbox");
    fireEvent.keyDown(listbox, { key: "End" });
    fireEvent.keyDown(listbox, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("enabled");

    fireEvent.keyDown(listbox, { key: "Home" });
    fireEvent.keyDown(listbox, { key: "Enter" });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("option", { name: /Unpriced Video/ }).textContent).toContain("Pricing is not configured");

    fireEvent.keyDown(listbox, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("selects a focused enabled option once when Enter bubbles through the listbox", () => {
    const onChange = vi.fn();
    render(
      <VideoModelMenu
        error={null}
        loading={false}
        onChange={onChange}
        onRetry={vi.fn()}
        options={[model({ id: "enabled", label: "Enabled Video" })]}
        value={null}
      />,
    );

    const option = screen.getByRole("option", { name: /Enabled Video/ });
    fireEvent.focus(option);
    fireEvent.keyDown(option, { key: "Enter" });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("enabled");
  });

  test("closes once when Escape is pressed on a focused option", () => {
    const onClose = vi.fn();
    render(
      <VideoModelMenu
        error={null}
        loading={false}
        onChange={vi.fn()}
        onClose={onClose}
        onRetry={vi.fn()}
        options={[model()]}
        value={null}
      />,
    );

    const option = screen.getByRole("option", { name: /Creator Video 1\.0/ });
    fireEvent.focus(option);
    fireEvent.keyDown(option, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("closes when a pointer interaction occurs outside the model menu", () => {
    const onClose = vi.fn();
    render(
      <VideoModelMenu
        error={null}
        loading={false}
        onChange={vi.fn()}
        onClose={onClose}
        onRetry={vi.fn()}
        options={[model()]}
        value={null}
      />,
    );

    fireEvent.pointerDown(document.body);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("selecting an enabled option changes the model and closes exactly once", () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(
      <VideoModelMenu
        error={null}
        loading={false}
        onChange={onChange}
        onClose={onClose}
        onRetry={vi.fn()}
        options={[model({ id: "enabled", label: "Enabled Video" })]}
        value={null}
      />,
    );

    fireEvent.click(screen.getByRole("option", { name: /Enabled Video/ }));

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("enabled");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("does not close or change selection for a disabled option", () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(
      <VideoModelMenu
        error={null}
        loading={false}
        onChange={onChange}
        onClose={onClose}
        onRetry={vi.fn()}
        options={[model({ blocker: "PRICING_NOT_FOUND", id: "disabled", label: "Disabled Video" })]}
        value={null}
      />,
    );

    fireEvent.click(screen.getByRole("option", { name: /Disabled Video/ }));

    expect(onChange).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  test("keeps the error menu open for an inside retry interaction", () => {
    const onClose = vi.fn();
    const onRetry = vi.fn();
    render(
      <VideoModelMenu
        error="Catalog unavailable"
        loading={false}
        onChange={vi.fn()}
        onClose={onClose}
        onRetry={onRetry}
        options={[]}
        value={null}
      />,
    );

    const retry = screen.getByRole("button", { name: "Retry" });
    fireEvent.pointerDown(retry);
    fireEvent.click(retry);

    expect(onClose).not.toHaveBeenCalled();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
