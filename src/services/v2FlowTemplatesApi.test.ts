import { beforeEach, describe, expect, test, vi } from "vitest";

import { getAdminFlowTemplate, publishAdminFlowTemplate, saveAdminFlowTemplateDraft } from "./v2FlowTemplatesApi";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  window.localStorage.setItem("v2-access-token", "token");
  vi.stubGlobal("fetch", fetchMock);
});

describe("v2FlowTemplatesApi admin client", () => {
  test("uses protected template administration endpoints", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "template-1", graph: { nodes: [], edges: [] } }) });

    await getAdminFlowTemplate("template-1");
    await saveAdminFlowTemplateDraft("template-1", {
      title: "Product video",
      description: "",
      category: "video",
      graph: { nodes: [], edges: [] },
      inputSchema: [],
    });
    await publishAdminFlowTemplate("template-1");

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/api/v2/admin/flow-templates/template-1",
      "/api/v2/admin/flow-templates/template-1",
      "/api/v2/admin/flow-templates/template-1/publish",
    ]);
    expect(fetchMock.mock.calls[1][1].method).toBe("PUT");
    expect(fetchMock.mock.calls[2][1].method).toBe("POST");
  });
});
