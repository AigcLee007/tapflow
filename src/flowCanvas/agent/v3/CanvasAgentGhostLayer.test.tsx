import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { CanvasAgentGhostLayer } from "./CanvasAgentGhostLayer";

describe("CanvasAgentGhostLayer", () => {
  it("renders preview nodes without mutating canvas state", () => {
    const { container } = render(<CanvasAgentGhostLayer operations={[{ type: "node.create", node: { id: "g", type: "text", position: { x: 10, y: 20 }, data: {} } }]} />);
    expect(container.querySelector(".canvas-agent-v3-ghost-node")?.textContent).toBe("text");
  });
  it("disappears when preview is not visible", () => { expect(render(<CanvasAgentGhostLayer visible={false} operations={[]} />).container.firstChild).toBeNull(); });
});
