import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { getLegalDocument } from "./legalApi";
import { LegalDocumentPage } from "./LegalDocumentPage";

vi.mock("./legalApi", () => ({
  getLegalDocument: vi.fn(),
}));

const document = {
  contactUrl: "https://aittco.com/contact",
  effectiveAt: "2026-08-12",
  lastUpdatedAt: "2026-08-12",
  operatorName: "Aittco",
  sections: [
    {
      id: "service",
      items: ["请妥善保管账号。"],
      paragraphs: ["Aittco 通过 TapFlow 提供创作服务。"],
      title: "服务说明",
    },
  ],
  title: "Aittco 用户协议",
  type: "terms" as const,
  version: "2026-08-12",
};

describe("LegalDocumentPage", () => {
  afterEach(() => vi.clearAllMocks());

  test("renders an anonymously fetched Aittco terms document", async () => {
    vi.mocked(getLegalDocument).mockResolvedValue(document);

    render(<LegalDocumentPage type="terms" />);

    expect(screen.getByText("正在加载协议…")).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Aittco 用户协议" })).toBeTruthy();
    expect(screen.getByText("运营主体：Aittco")).toBeTruthy();
    expect(screen.getByRole("link", { name: "返回登录" }).getAttribute("href")).toBe("/login");
    expect(screen.getByRole("navigation", { name: "协议目录" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "TapFlow 用户协议" })).toBeNull();
    expect(getLegalDocument).toHaveBeenCalledWith("terms");
  });

  test("offers a retry when the public document cannot load", async () => {
    vi.mocked(getLegalDocument).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(document);

    render(<LegalDocumentPage type="privacy" />);

    expect(await screen.findByText("协议暂时无法加载，请稍后重试。")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Aittco 用户协议" })).toBeTruthy());
    expect(getLegalDocument).toHaveBeenCalledTimes(2);
  });
});
