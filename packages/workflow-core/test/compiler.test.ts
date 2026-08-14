import { describe, expect, test } from "vitest";

import {
  checksumGraph,
  compileGraph,
  topologicalSort,
  validateGraph,
  WorkflowGraphValidationError,
  type FlowGraph,
} from "../src/index.js";

function createValidGraph(): FlowGraph {
  return {
    edges: [
      { source: "input", target: "generate" },
      { source: "generate", target: "output" },
    ],
    nodes: [
      { id: "input", type: "input", data: { prompt: "hello" } },
      { id: "generate", type: "text.generate", data: { model: "demo" } },
      { id: "output", type: "output" },
    ],
    viewport: { x: 10, y: 20, zoom: 1.2 },
  };
}

describe("@aigc-flow/workflow-core", () => {
  test("valid graph compile succeeds", () => {
    const compiled = compileGraph(createValidGraph());
    expect(compiled.schemaVersion).toBe("v2");
    expect(compiled.entryNodeIds).toEqual(["input"]);
    expect(compiled.outputNodeIds).toEqual(["output"]);
    expect(compiled.nodes).toEqual([
      {
        config: { prompt: "hello" },
        dependencies: [],
        dependents: ["generate"],
        id: "input",
        type: "input",
      },
      {
        config: { model: "demo" },
        dependencies: ["input"],
        dependents: ["output"],
        id: "generate",
        type: "text.generate",
      },
      {
        config: {},
        dependencies: ["generate"],
        dependents: [],
        id: "output",
        type: "output",
      },
    ]);
  });

  test("preserves grouping in the compiled graph and its checksum", () => {
    const grouped = createValidGraph();
    grouped.nodes[1] = { ...grouped.nodes[1], parentId: "group-1" };
    const ungrouped = createValidGraph();

    expect(compileGraph(grouped).nodes.find((node) => node.id === "generate")).toMatchObject({
      parentId: "group-1",
    });
    expect(checksumGraph(grouped)).not.toBe(checksumGraph(ungrouped));
  });

  test("preserves edge data in compiled graphs and checksums", () => {
    const imageEdge = createValidGraph();
    imageEdge.edges[0] = { ...imageEdge.edges[0], data: { dataType: "image" } };
    const textEdge = createValidGraph();
    textEdge.edges[0] = { ...textEdge.edges[0], data: { dataType: "text" } };

    expect(compileGraph(imageEdge).edges[0]).toMatchObject({ data: { dataType: "image" } });
    expect(checksumGraph(imageEdge)).not.toBe(checksumGraph(textEdge));
  });

  test("duplicate node id fails", () => {
    const graph = createValidGraph();
    graph.nodes.push({ id: "input", type: "duplicate" });
    expect(() => validateGraph(graph)).toThrowError(WorkflowGraphValidationError);
  });

  test("edge referencing missing node fails", () => {
    const graph = createValidGraph();
    graph.edges.push({ source: "missing", target: "output" });
    expect(() => validateGraph(graph)).toThrow("Edge source does not exist: missing");
  });

  test("self-loop fails", () => {
    const graph = createValidGraph();
    graph.edges.push({ source: "generate", target: "generate" });
    expect(() => validateGraph(graph)).toThrow("Self-loop is not allowed");
  });

  test("cycle fails", () => {
    const graph = createValidGraph();
    graph.edges.push({ source: "output", target: "input" });
    expect(() => topologicalSort(graph)).toThrow("Graph must not contain a cycle");
  });

  test("topological sort is correct", () => {
    expect(topologicalSort(createValidGraph())).toEqual(["input", "generate", "output"]);
  });

  test("checksum is stable for equivalent graph objects", () => {
    const first: FlowGraph = {
      edges: [
        {
          id: "edge-a",
          source: "a",
          sourceHandle: "out",
          target: "b",
          targetHandle: "in",
        },
      ],
      nodes: [
        {
          data: {
            alpha: 1,
            nested: {
              x: true,
              y: "z",
            },
          },
          id: "a",
          type: "input",
        },
        {
          data: {
            beta: 2,
          },
          id: "b",
          type: "output",
        },
      ],
      viewport: {
        x: 1,
        y: 2,
        zoom: 1,
      },
    };

    const second: FlowGraph = {
      edges: [
        {
          id: "edge-a",
          source: "a",
          sourceHandle: "out",
          target: "b",
          targetHandle: "in",
        },
      ],
      nodes: [
        {
          data: {
            nested: {
              y: "z",
              x: true,
            },
            alpha: 1,
          },
          id: "a",
          type: "input",
        },
        {
          data: {
            beta: 2,
          },
          id: "b",
          type: "output",
        },
      ],
      viewport: {
        zoom: 1,
        y: 2,
        x: 1,
      },
    };

    expect(checksumGraph(first)).toBe(checksumGraph(second));
  });

  test("normalizes frontend simplified node types to runtime generation types", () => {
    const graph: FlowGraph = {
      edges: [
        { source: "input", target: "imageNode" },
        { source: "imageNode", target: "output" },
      ],
      nodes: [
        { id: "input", type: "input", data: { inputKey: "prompt" } },
        { id: "imageNode", type: "image", data: {} },
        { id: "output", type: "output" },
      ],
    };

    const compiled = compileGraph(graph);
    const imageNode = compiled.nodes.find((node) => node.id === "imageNode");
    expect(imageNode?.type).toBe("image.generate");
  });

  test("normalizes uploaded reference image nodes to static image assets", () => {
    const graph: FlowGraph = {
      edges: [
        { source: "reference", target: "imageNode" },
      ],
      nodes: [
        {
          id: "reference",
          type: "image",
          data: {
            kind: "image",
            mimeType: "image/png",
            referenceUploadId: "00000000-0000-4000-8000-000000000031",
            source: "canvas-upload",
          },
        },
        { id: "imageNode", type: "image", data: { generationPrompt: "use the reference" } },
      ],
    };

    const compiled = compileGraph(graph);
    const referenceNode = compiled.nodes.find((node) => node.id === "reference");
    const imageNode = compiled.nodes.find((node) => node.id === "imageNode");
    expect(referenceNode?.type).toBe("image.asset");
    expect(imageNode?.type).toBe("image.generate");
  });
});
