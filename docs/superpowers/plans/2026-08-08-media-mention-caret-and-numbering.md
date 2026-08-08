# Media Mention Caret And Numbering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 让图片和视频节点在输入 @ 的同一事件循环内打开引用菜单，并让输入缩略图、候选项、引用胶囊始终使用同一个按媒体类型计算的编号和缩略图。

**Architecture:** 由 canvasInputProjection 生成统一的 inputKey、kind、kindIndex、mentionLabel 和运行时预览映射。Lexical 通过 INSERT_TEXT_COMMAND 和 selection 规范化即时计算 query；候选激活先完成连接或 inputOrder 更新，再从最新投影读取 label。持久化只保存 inputKey、kind、边和顺序，不保存 URL。

**Tech Stack:** Vite + React + TypeScript, @xyflow/react, Lexical, Zustand, Vitest, Playwright smoke script.

---

## 范围与不变量

本计划只修复图片/视频节点的媒体 @ 交互和显示身份，不把文本节点加入媒体 @ 候选。文本输入仍显示在 NodeInputTray 第一组，但不会生成媒体胶囊。

必须保持以下一一对应关系：

~~~text
图片卡片 1 <-> inputKey <-> @图片1 <-> 16x16 图片缩略图
图片卡片 2 <-> inputKey <-> @图片2 <-> 16x16 图片缩略图
视频卡片 1 <-> inputKey <-> @视频1 <-> 16x16 视频 poster
~~~

kindIndex 只在同一种媒体内编号；胶囊删除只修改 prompt；输入托盘删除才删除边或 inputOrder 项。所有 thumbnailUrl、previewUrl、hoverPreviewUrl、signed URL、blob URL 都只能是运行时数据。

## 文件责任地图

- Create: src/flowCanvas/mentions/mediaReferenceIdentity.ts
- Modify: src/flowCanvas/inputs/canvasInputProjection.ts
- Modify: src/flowCanvas/utils/referenceSourceResolver.ts
- Modify: src/flowCanvas/mentions/mediaMentions.ts
- Modify: src/flowCanvas/mentions/mediaMentionCandidates.ts
- Modify: src/flowCanvas/mentions/mentionCaret.ts
- Modify: src/flowCanvas/mentions/MediaMentionPromptEditor.tsx
- Modify: src/flowCanvas/mentions/MediaMentionCandidateMenu.tsx
- Modify: src/flowCanvas/nodes/FlowNodes.tsx
- Modify: src/flowCanvas/video/VideoNodeComposer.tsx
- Test: src/flowCanvas/mentions/mediaReferenceIdentity.test.ts
- Test: src/flowCanvas/inputs/canvasInputProjection.test.ts
- Test: src/flowCanvas/utils/referenceSourceResolver.test.ts
- Test: src/flowCanvas/mentions/mediaMentions.test.ts
- Test: src/flowCanvas/mentions/mentionCaret.test.ts
- Test: src/flowCanvas/mentions/MediaMentionPromptEditor.test.tsx
- Test: src/flowCanvas/mentions/MediaMentionCandidateMenu.test.tsx
- Test: src/flowCanvas/nodes/FlowNodes.image-inputs.test.tsx
- Test: src/flowCanvas/video/VideoNodeComposer.test.tsx
- Modify: scripts/smoke-node-input-tray.ts
- Test: scripts/smoke-node-input-tray.test.ts
- Modify: PROJECT_RECORD.md

---

### Task 1: 建立统一媒体身份模型

**Files:** Create mediaReferenceIdentity.ts and its test; modify canvasInputProjection.ts and its test.

- [ ] Step 1: 写失败测试。

~~~ts
describe("media reference identity", () => {
  it("uses an independent index for each media kind", () => {
    expect(getMediaMentionLabel("image", 1)).toBe("图片1");
    expect(getMediaMentionLabel("image", 2)).toBe("图片2");
    expect(getMediaMentionLabel("video", 1)).toBe("视频1");
    expect(getMediaMentionLabel("audio", 1)).toBe("音频1");
  });

  it("preserves inputKey while filtering text", () => {
    const result = indexMediaReferenceIdentities([
      { inputKey: "upstream:text", source: "upstream", kind: "text", title: "Script", previewState: "unavailable" },
      { inputKey: "upstream:image-a", source: "upstream", kind: "image", title: "A", thumbnailUrl: "/a.webp", previewState: "ready" },
      { inputKey: "upstream:image-b", source: "upstream", kind: "image", title: "B", thumbnailUrl: "/b.webp", previewState: "ready" },
      { inputKey: "upstream:video-a", source: "upstream", kind: "video", title: "V", thumbnailUrl: "/v.webp", previewState: "ready" },
    ]);
    expect(result.map((item) => [item.inputKey, item.label])).toEqual([
      ["upstream:image-a", "图片1"],
      ["upstream:image-b", "图片2"],
      ["upstream:video-a", "视频1"],
    ]);
  });
});
~~~

- [ ] Step 2: 运行
~~~bash
npx vitest run src/flowCanvas/mentions/mediaReferenceIdentity.test.ts
~~~
预期：FAIL，模块或导出函数不存在。

- [ ] Step 3: 创建 API。实现 getMediaMentionLabel(kind, kindIndex) 和 indexMediaReferenceIdentities(seeds)。前者返回 图片N、视频N、音频N；后者过滤 text、按输入顺序处理、每种 kind 使用独立 counter，并保留 assetId、sourceNodeId、thumbnailUrl 等运行时字段。

- [ ] Step 4: 修改 CanvasInputItem，增加 mentionLabel:string。projection 每个分组使用自己的 kindIndex；text 的 mentionLabel 为空字符串，媒体使用统一函数。禁止改变 inputOrder 的持久化语义。

- [ ] Step 5: 在 projection 测试中断言两张图片是 图片1/图片2、两个视频是 视频1/视频2、音频是 音频1，并断言 group 顺序仍为 text、image、video、audio。
~~~bash
npx vitest run src/flowCanvas/mentions/mediaReferenceIdentity.test.ts src/flowCanvas/inputs/canvasInputProjection.test.ts
~~~
预期：PASS。

- [ ] Step 6: 提交。
~~~bash
git add src/flowCanvas/mentions/mediaReferenceIdentity.ts src/flowCanvas/mentions/mediaReferenceIdentity.test.ts src/flowCanvas/inputs/canvasInputProjection.ts src/flowCanvas/inputs/canvasInputProjection.test.ts
git commit -m "feat: add unified media reference identities"
~~~

---

### Task 2: 图片 reference chip 复用投影编号

**Files:** modify referenceSourceResolver.ts, referenceSourceResolver.test.ts, and FlowNodes.tsx.

- [ ] Step 1: 在 resolver 测试加入两张 upstream 图片和一张 asset 图片，断言：
~~~ts
expect(chips.map((chip) => chip.mentionLabel)).toEqual([
  "图片1",
  "图片2",
  "图片3",
]);
~~~

- [ ] Step 2: 运行
~~~bash
npx vitest run src/flowCanvas/utils/referenceSourceResolver.test.ts
~~~
预期：FAIL，因为当前 resolver 使用 Image + index + 1。

- [ ] Step 3: resolver 排序和去重完成后，使用 image-only counter 和 getMediaMentionLabel("image", imageIndex)。不得重新读取 binding 数量，不得改变 key 或 referenceOrder。

- [ ] Step 4: FlowNodes 构建 connected candidates 时传递 chip 的 mentionLabel 和运行时缩略图；删除所有 Image N 或图片 N 的第二套拼接逻辑。候选 title 只作为辅助文字，不作为编号来源。

- [ ] Step 5: 运行
~~~bash
npx vitest run src/flowCanvas/utils/referenceSourceResolver.test.ts src/flowCanvas/nodes/FlowNodes.image-inputs.test.tsx
~~~
预期：PASS，第一、第二张图的候选和 chip 分别为 图片1、图片2。

- [ ] Step 6: 提交。
~~~bash
git add src/flowCanvas/utils/referenceSourceResolver.ts src/flowCanvas/utils/referenceSourceResolver.test.ts src/flowCanvas/nodes/FlowNodes.tsx
git commit -m "fix: align image mention labels with input chips"
~~~

---

### Task 3: binding 使用显式投影 label

**Files:** modify mediaMentions.ts, mediaMentions.test.ts, MediaMentionPromptEditor.tsx, VideoNodeComposer.tsx, VideoNodeComposer.test.tsx.

- [ ] Step 1: 添加 allocator 测试：传入旧 binding 图片1，再激活新的 inputKey，显式 label 图片1，结果必须仍为图片1；同 inputKey 从图片2 重排到图片1时，binding 数量保持 1 且 label 更新为图片1。

- [ ] Step 2: 运行
~~~bash
npx vitest run src/flowCanvas/mentions/mediaMentions.test.ts
~~~
预期：FAIL，当前 allocator 没有 label 参数。

- [ ] Step 3: 将 allocateMediaMentionBinding 参数改为 bindings、input、label?。label 存在时直接使用；只有兼容旧调用且 label 缺失时才 fallback 到旧计数。相同 inputKey 必须更新现有 binding，禁止创建第二个 binding。

- [ ] Step 4: 将 ActivatedMediaMention 扩展为 inputKey、kind、label?。编辑器优先使用 activated.label，其次从 identityByInputKey 读取，正式图片/视频调用方不得依赖 fallback。

- [ ] Step 5: VideoNodeComposer 只透传 activation callback 类型，不在 composer 中生成 label。更新所有 candidate fixture 添加 label。

- [ ] Step 6: 运行
~~~bash
npx vitest run src/flowCanvas/mentions/mediaMentions.test.ts src/flowCanvas/mentions/MediaMentionPromptEditor.test.tsx src/flowCanvas/video/VideoNodeComposer.test.tsx
~~~
预期：第一张图片写入 @图片1，第二张图片写入 @图片2。

- [ ] Step 7: 提交。
~~~bash
git add src/flowCanvas/mentions/mediaMentions.ts src/flowCanvas/mentions/mediaMentions.test.ts src/flowCanvas/mentions/MediaMentionPromptEditor.tsx src/flowCanvas/video/VideoNodeComposer.tsx src/flowCanvas/video/VideoNodeComposer.test.tsx
git commit -m "fix: bind media mentions to projected labels"
~~~

---

### Task 4: Lexical 首次输入 @ 与 caret 同步

**Files:** modify mentionCaret.ts, mentionCaret.test.ts, MediaMentionPromptEditor.tsx, MediaMentionPromptEditor.test.tsx.

- [ ] Step 1: 添加真实 Lexical 测试。聚焦空编辑器，触发 beforeInput/input data=@，立即断言 listbox 可见，不调用鼠标 click。

- [ ] Step 2: 添加 selection offset 断言，验证输入 @ 后 anchor offset 为 1；同时覆盖既有文本末尾、element selection 末尾、@ 左侧、空 paragraph 和 IME composition。

- [ ] Step 3: 运行
~~~bash
npx vitest run src/flowCanvas/mentions/mentionCaret.test.ts src/flowCanvas/mentions/MediaMentionPromptEditor.test.tsx -t "immediately|offset|element"
~~~
预期：新增测试 FAIL。

- [ ] Step 4: mentionCaret.ts 导出 getMentionQueryFromSelection、normalizeMentionSelection、getMentionCaretRect。element selection 找到 paragraph 最后一个 text descendant；空 paragraph 创建 text node；query 只接受 caret 左侧连续的 @word。

- [ ] Step 5: 在 EditorBridge 注册 INSERT_TEXT_COMMAND。插入文本包含 @ 时，用 queueMicrotask 读取最新 editorState，更新 queryRef 和 menu；OnChangePlugin 保留为普通输入/删除/光标移动兜底。composition 中不得打开菜单。

~~~ts
useEffect(() => editor.registerCommand(
  INSERT_TEXT_COMMAND,
  (text) => {
    if (disabled || composingRef.current || !text.includes("@")) return false;
    queueMicrotask(() => {
      editor.getEditorState().read(() => {
        const nextQuery = getMentionQueryFromSelection($getSelection());
        queryRef.current = nextQuery
          ? { ...nextQuery, version: ++versionRef.current }
          : null;
        setMenu(nextQuery ? { query: nextQuery.query } : null);
      });
    });
    return false;
  },
  COMMAND_PRIORITY_HIGH,
), [disabled, editor, setMenu]);
~~~

- [ ] Step 6: 保存 menu 打开时的 Lexical selection；候选 onMouseDown 阻止浏览器移动焦点；激活前恢复 selection。selection 失效时抛出 MENTION_SELECTION_STALE，保留原 query。

- [ ] Step 7: query 更新后用 requestAnimationFrame 读取 caretRect；MediaMentionCandidateMenu 使用保存的 caretRect，不在 render 中临时计算整个编辑框矩形。

- [ ] Step 8: 运行
~~~bash
npx vitest run src/flowCanvas/mentions/mentionCaret.test.ts src/flowCanvas/mentions/MediaMentionPromptEditor.test.tsx
~~~
预期：首次 @ 无需再次点击即可显示菜单，Enter、Escape、IME、Backspace 既有测试全部通过。

- [ ] Step 9: 提交。
~~~bash
git add src/flowCanvas/mentions/mentionCaret.ts src/flowCanvas/mentions/mentionCaret.test.ts src/flowCanvas/mentions/MediaMentionPromptEditor.tsx src/flowCanvas/mentions/MediaMentionPromptEditor.test.tsx
git commit -m "fix: open media mention menu on first at sign"
~~~

---

### Task 5: 引用胶囊缩略图和动态 label

**Files:** modify MediaMentionPromptEditor.tsx, MediaMentionPromptEditor.test.tsx, MediaMentionCandidateMenu.tsx, MediaMentionCandidateMenu.test.tsx, FlowNodes.tsx.

- [ ] Step 1: 传入 identityByInputKey fixture，断言 @图片1 胶囊包含 alt=图片1、src=/a.webp 的 img。
- [ ] Step 2: 运行
~~~bash
npx vitest run src/flowCanvas/mentions/MediaMentionPromptEditor.test.tsx -t "thumbnail|图片1"
~~~
预期：FAIL，当前 pill 只有图标和文字。
- [ ] Step 3: MediaMentionNode 增加 runtime-only previewUrl；exportJSON 只输出 inputKey、kind、label、valid，禁止输出 previewUrl。
- [ ] Step 4: MentionPill 使用 16x16 img；图片用 thumbnail/preview，视频用 poster/thumbnail，音频保留图标 fallback。
- [ ] Step 5: identityByInputKey 或 active keys 变化时按 inputKey 更新 label、preview 和 valid；不存在的 key 只显示 invalid warning，不自动改绑。
- [ ] Step 6: candidate menu 测试断言 option 的 data-mention-label 与 img src。
- [ ] Step 7: 运行
~~~bash
npx vitest run src/flowCanvas/mentions/MediaMentionPromptEditor.test.tsx src/flowCanvas/mentions/MediaMentionCandidateMenu.test.tsx
~~~
预期：PASS。
- [ ] Step 8: 提交。
~~~bash
git add src/flowCanvas/mentions/MediaMentionPromptEditor.tsx src/flowCanvas/mentions/MediaMentionPromptEditor.test.tsx src/flowCanvas/mentions/MediaMentionCandidateMenu.tsx src/flowCanvas/mentions/MediaMentionCandidateMenu.test.tsx src/flowCanvas/nodes/FlowNodes.tsx
git commit -m "feat: render media thumbnails in mention pills"
~~~

---

### Task 6: 候选激活按最新 store 状态完成事务

**Files:** modify FlowNodes.tsx, VideoNodeComposer.tsx, mediaMentions.ts and their tests.

- [ ] Step 1: 添加 activation 测试，验证 canvas candidate 先 connect 后读取 label；source 消失抛出 SOURCE_NOT_FOUND；失败时不创建 binding。
- [ ] Step 2: 运行
~~~bash
npx vitest run src/flowCanvas/mentions/mediaMentions.test.ts -t "connects before|disappeared"
~~~
预期：FAIL。
- [ ] Step 3: 在 mediaMentions.ts 定义 MediaMentionActivationContext 和 MediaMentionActivationError。context 包含 targetNodeId、hasNode、hasAsset、connectNodes、addAssetInput、getIdentity。
- [ ] Step 4: canvas activation 顺序固定为 hasNode -> connectNodes -> 重读 identity；asset activation 固定为 hasAsset -> append inputOrder/referenceOrder -> 重读 identity。任何失败保留 @query。
- [ ] Step 5: FlowNodes 图片/视频回调接入 context；不要用 activation 前 candidate 的编号作为最终结果。
- [ ] Step 6: MentionPill 删除只改 prompt，不调用 removeNodeInput、disconnectEdge 或 removeTextNodeInputs。
- [ ] Step 7: 运行
~~~bash
npx vitest run src/flowCanvas/mentions/mediaMentions.test.ts src/flowCanvas/nodes/FlowNodes.image-inputs.test.tsx src/flowCanvas/video/VideoNodeComposer.test.tsx
~~~
预期：PASS。
- [ ] Step 8: 提交。
~~~bash
git add src/flowCanvas/nodes/FlowNodes.tsx src/flowCanvas/video/VideoNodeComposer.tsx src/flowCanvas/mentions/mediaMentions.ts src/flowCanvas/mentions/mediaMentions.test.ts src/flowCanvas/nodes/FlowNodes.image-inputs.test.tsx src/flowCanvas/video/VideoNodeComposer.test.tsx
git commit -m "fix: activate media mentions from fresh canvas state"
~~~

---

### Task 7: 重排、删除和旧 binding 回归

**Files:** modify MediaMentionPromptEditor.tsx, flowCanvasStore.ts and tests.

- [ ] Step 1: 添加重排测试：图片 inputKey 保持不变，交换顺序后 prompt label 变为 @图片2 @图片1。
- [ ] Step 2: 添加删除胶囊测试：prompt 被删除但 edge、source node 和 inputOrder 保持不变。
- [ ] Step 3: 添加失效 binding 测试：缺失 inputKey 的 pill 变成 data-invalid=true，不能匹配当前第一张图片。
- [ ] Step 4: 动态同步算法按 inputKey 找 identity，更新 label/preview/valid，保留 inputKey/kind；跨类型重排仍由 store 拒绝。
- [ ] Step 5: 运行
~~~bash
npx vitest run src/flowCanvas/store/flowCanvasStore.test.ts src/flowCanvas/mentions/MediaMentionPromptEditor.test.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx
~~~
预期：PASS。
- [ ] Step 6: 提交。
~~~bash
git add src/flowCanvas/mentions/MediaMentionPromptEditor.tsx src/flowCanvas/store/flowCanvasStore.ts src/flowCanvas/store/flowCanvasStore.test.ts src/flowCanvas/mentions/MediaMentionPromptEditor.test.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx
git commit -m "test: keep media mention labels aligned after reorder"
~~~

---

### Task 8: canonical graph 与 worker 边界验证

**Files:** verify canonicalGraph.ts and worker service; modify their focused tests.

- [ ] Step 1: 添加 canonical graph 测试，调用现有 canonicalizeGraph，序列化结果必须包含 asset:image-a 和 label，但不得包含 thumbnailUrl、hoverPreviewUrl、signed URL、blob: 或 data:。
- [ ] Step 2: 添加 worker 顺序测试，使用两张图片和一个视频断言 worker 只读取 inputOrder/referenceOrder，不读取 kindIndex/mentionLabel 作为 provider 参数。
- [ ] Step 3: 运行
~~~bash
npx vitest run src/flowCanvas/utils/canonicalGraph.test.ts
npm run test --workspace @aigc-flow/worker -- workflow-runtime-image-request.test.ts worker.test.ts
~~~
预期：PASS；既有 AI Gateway 类型漂移只记录，不修改无关模块。
- [ ] Step 4: 提交。
~~~bash
git add src/flowCanvas/utils/canonicalGraph.test.ts apps/worker/test/workflow-runtime-image-request.test.ts apps/worker/test/worker.test.ts
git commit -m "test: protect media mention persistence boundaries"
~~~

---

### Task 9: smoke contract 和三视口验收

**Files:** modify scripts/smoke-node-input-tray.ts and its test; update focused UI tests if selectors change.

- [ ] Step 1: contract 增加 mentionCaretRect、selection.offset.after-at、图片1、图片2、视频1、thumbnailUrl.runtime-only、searchbox。
- [ ] Step 2: smoke check 使用真实键盘路径：
~~~ts
const prompt = page.locator('[role="combobox"]');
await prompt.focus();
await prompt.press("@");
await page.getByRole("listbox").waitFor({ state: "visible" });
~~~
禁止只调用 window.traySmokeActivate 证明 @ 流程。
- [ ] Step 3: 选择图片1、图片2、视频1，断言胶囊 label、16x16 img、inputKey 和 edge；断言三视口无横向溢出。
- [ ] Step 4: 运行
~~~bash
npm run test:smoke-node-input-tray
npm run smoke:node-input-tray
~~~
只有三视口截图和 status:ok 都存在才标记真实 smoke 通过；超时要记录完整错误。
- [ ] Step 5: 提交。
~~~bash
git add scripts/smoke-node-input-tray.ts scripts/smoke-node-input-tray.test.ts src/flowCanvas/mentions/MediaMentionPromptEditor.test.tsx src/flowCanvas/inputs/MediaHoverPreview.test.tsx
git commit -m "test: verify immediate media mention interaction"
~~~

---

### Task 10: 全量验证、项目记录和发布

**Files:** modify PROJECT_RECORD.md; verify all files from Tasks 1-9.

- [ ] Step 1: 运行前端构建。
~~~bash
npm run build
~~~
预期：PASS；记录既有 Vite warnings。

- [ ] Step 2: 运行完整测试。
~~~bash
npm test
~~~
预期：PASS；若超过 180 秒，记录超时，不能写成全量通过。

- [ ] Step 3: 运行 worker 测试和构建。
~~~bash
npm run test --workspace @aigc-flow/worker
npm run build --workspace @aigc-flow/worker
~~~
记录通过数量和既有 AI Gateway 类型错误文件/行号。

- [ ] Step 4: 检查 diff 和持久化边界。
~~~bash
git diff --check
rg -n "thumbnailUrl|hoverPreviewUrl|signedUrl|blob:|data:" src/flowCanvas apps/worker packages
~~~
确认临时 URL 不进入 canonical graph。

- [ ] Step 5: 更新 PROJECT_RECORD.md，记录输入 @ 即时菜单、caret 在 @ 右侧、编号对齐、胶囊缩略图、重排/删除/失效 binding，以及实际通过或失败命令。
- [ ] Step 6: 提交文档。
~~~bash
git add PROJECT_RECORD.md
git commit -m "docs: record media mention caret and numbering validation"
~~~
- [ ] Step 7: 推送功能分支。
~~~bash
git push -u origin codex/media-mention-caret-numbering
~~~
- [ ] Step 8: 用独立 worktree 合并 main，禁止 reset --hard、checkout -- 或清理主工作区。
~~~bash
git fetch --all --prune
git worktree add --detach .worktrees/merge-main origin/main
git -C .worktrees/merge-main merge --ff-only codex/media-mention-caret-numbering
git -C .worktrees/merge-main push origin HEAD:main
git worktree remove .worktrees/merge-main
~~~
- [ ] Step 9: 验证远端。
~~~bash
git ls-remote --heads origin main codex/media-mention-caret-numbering
~~~
预期：origin/main 与最终功能提交 SHA 一致。

---

## 任务依赖

~~~text
Task 1 -> Task 2 -> Task 3 -> Task 4 -> Task 5 -> Task 6 -> Task 7 -> Task 8 -> Task 9 -> Task 10
~~~

Task 1 必须先完成，因为所有候选和胶囊 label 都来自统一投影。Task 4 可以单独开发，但 Task 5/6 必须等 ActivatedMediaMention.label 类型确定后执行。

## 自审清单

- [ ] 图片、视频、音频编号都来自 kindIndex，没有第二套全局 index。
- [ ] 首次输入 @ 通过 Lexical 插入命令触发，不依赖第二次鼠标点击。
- [ ] element selection 会转换为 text selection，caret offset 在 @ 后。
- [ ] 候选、输入卡片和胶囊使用同一个 inputKey 和 mentionLabel。
- [ ] 胶囊缩略图是运行时数据，不进入 canonical graph。
- [ ] 胶囊删除不删除边或输入，托盘删除才执行 store 删除。
- [ ] canvas/asset 激活失败保留原始 @query，不创建虚假 binding。
- [ ] 计划中没有 TODO、TBD 或未定义的占位步骤。
