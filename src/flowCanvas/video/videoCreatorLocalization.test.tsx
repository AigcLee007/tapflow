import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createSafeDefaultVideoCapabilities } from "./videoGenerationCapabilities";
import { createDefaultVideoGenerationParams } from "./videoGenerationParams";
import { VideoHumanReviewControl } from "./VideoHumanReviewControl";
import { VideoModeMenu } from "./VideoModeMenu";
import { VideoModelMenu } from "./VideoModelMenu";
import { VideoReferenceStrip } from "./VideoReferenceStrip";

vi.mock("../nodes/ReferenceSourcePicker", () => ({
  ReferenceSourcePicker: () => null,
}));

describe("video creator localization", () => {
  test("renders Chinese reference roles and core controls without legacy English labels", () => {
    render(
      <>
        <VideoReferenceStrip
          currentNodeId="video-node"
          onChange={vi.fn()}
          onUploadReference={vi.fn()}
          value={{
            referenceAssetItemIds: [],
            referenceOrder: [],
            videoGeneration: { ...createDefaultVideoGenerationParams(), mode: "all_reference" },
          }}
        />
        <VideoModeMenu capabilities={createSafeDefaultVideoCapabilities()} onChange={vi.fn()} value="text_to_video" />
        <VideoHumanReviewControl value={{ status: "required" }} />
      </>,
    );

    for (const label of ["人物", "场景", "道具", "风格", "完成验证"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: "生成模式" })).toBeTruthy();
    for (const label of ["Subject", "Scene", "Prop", "Style", "Complete verification"]) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  test("uses Chinese labels for model loading and error states", () => {
    const { rerender } = render(
      <VideoModelMenu error={null} loading onChange={vi.fn()} onRetry={vi.fn()} options={[]} value={null} />,
    );
    expect(screen.getByRole("status", { name: "正在加载视频模型" })).toBeTruthy();

    rerender(<VideoModelMenu error="视频模型目录加载失败" loading={false} onChange={vi.fn()} onRetry={vi.fn()} options={[]} value={null} />);
    expect(screen.getByRole("alert", { name: "视频模型目录加载失败" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "重试" })).toBeTruthy();
  });

  test("opens a Chinese mode menu without mojibake", () => {
    render(<VideoModeMenu capabilities={createSafeDefaultVideoCapabilities()} onChange={vi.fn()} value="text_to_video" />);
    fireEvent.click(screen.getByRole("button", { name: "生成模式" }));
    expect(screen.getByRole("menuitemradio", { name: /首尾帧生视频/ })).toBeTruthy();
    expect(screen.queryByText("鏂囩敓瑙嗛")).toBeNull();
  });
});
