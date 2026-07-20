# Nine-grid Chinese Prompts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all English natural-language instructions in the nine image-template prompts with faithful Chinese instructions while preserving stable grid, timing, keyframe, and shot tokens.

**Architecture:** Keep `FLOW_IMAGE_TEMPLATE_EDIT_ACTIONS` as the single prompt source of truth and translate only its `promptTemplate` strings. Keep prompt assembly synchronous and deterministic, changing only the appended user-text heading. No runtime translation, bilingual prompt, provider branch, model setting, graph behavior, or API contract is added.

**Tech Stack:** TypeScript, Vitest, Vite.

---

### Task 1: Lock the Chinese prompt contract and translate all templates

**Files:**
- Modify: `src/flowCanvas/utils/imageTemplateEditActions.test.ts`
- Modify: `src/flowCanvas/utils/imageTemplateEditActions.ts`

- [ ] **Step 1: Write failing Chinese prompt tests**

Extend the utility test with an explicit required-fragment map so every template is checked independently:

```ts
const EXPECTED_CHINESE_PROMPT_FRAGMENTS = {
  multiCameraGrid: ['从源图生成', '输出要求：', '同一主体', '九个标签和镜头类型'],
  plotFourGrid: ['从源图生成', '2x2 剧情提案分镜板', '连续剧情画面', '清晰的剧情推进'],
  faceThreeView: ['从源图生成', '脸部三视图参考图', '正面、四分之三侧面和侧面'],
  productThreeView: ['从源图生成', '产品三视图参考图', '正面、侧面和背面'],
  serialStoryboard25: ['从源图生成', '5x5 连贯电影分镜序列', '围绕源图中的同一核心事件'],
  cinematicLightCorrection: ['对源图进行电影级光影优化', '改善光线层次', '保持同一场景'],
  characterThreeView: ['从源图生成', '角色三视图设定图', '全身正面、侧面和背面'],
  frameProjection3sLater: ['基于源图创建未来关键帧', '3 秒后', '明确的时间推进'],
  frameProjection5sEarlier: ['基于源图创建过去关键帧', '5 秒前', '明确的前置状态'],
} as const;

test('uses Chinese natural-language instructions for all nine templates', () => {
  FLOW_IMAGE_TEMPLATE_EDIT_ACTIONS.forEach((action) => {
    EXPECTED_CHINESE_PROMPT_FRAGMENTS[action.key].forEach((fragment) => {
      expect(action.promptTemplate).toContain(fragment);
    });
    expect(action.promptTemplate).not.toContain('Output requirements:');
  });
});

test('keeps stable production tokens and uses a Chinese user requirement heading', () => {
  const multiCameraPrompt = buildImageTemplateEditPrompt('multiCameraGrid', '补充低机位细节');
  const storyboardPrompt = buildImageTemplateEditPrompt('serialStoryboard25');

  expect(multiCameraPrompt).toContain('3x3');
  expect(multiCameraPrompt).toContain('[KF1 | 3s | ELS]');
  expect(multiCameraPrompt).toContain('[KF9 | 2s | Low-Angle]');
  expect(multiCameraPrompt).toContain('用户补充要求：\n补充低机位细节');
  expect(multiCameraPrompt).not.toContain('User prompt:');
  expect(storyboardPrompt).toContain('5x5');
  expect(storyboardPrompt).toContain('OTS');
});
```

Update the existing prompt assembly test so it asserts Chinese text instead of `3x3 director multi-camera contact sheet` and `User prompt:`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest --run --exclude ".worktrees/**" src/flowCanvas/utils/imageTemplateEditActions.test.ts
```

Expected: FAIL because the templates and appended heading are still English.

- [ ] **Step 3: Translate the nine prompt templates**

In `FLOW_IMAGE_TEMPLATE_EDIT_ACTIONS`, translate every natural-language sentence using these exact semantic requirements:

```ts
multiCameraGrid: {
  opening: '从源图生成一张 libtv 风格的 3x3 导演多机位联络表。',
  constraints: '单张可读网格；主体、服装、场景、时间点、动作和连续性不变；仅改变景别、机位高度、镜头距离和角度；保留九个 KF/时长/景别标签；禁止黑边、UI 和水印。',
},
plotFourGrid: {
  opening: '从源图生成一张 2x2 剧情提案分镜板。',
  constraints: '四个连续剧情画面；角色、场景和戏剧语境不变；比例和方向不变；细分隔线；禁止黑边、UI 和水印。',
},
faceThreeView: {
  opening: '从源图生成一张干净的脸部三视图参考图。',
  constraints: '同一张脸的正面、四分之三侧面和侧面；身份、年龄、发型、肤色和表情逻辑不变。',
},
productThreeView: {
  opening: '从源图生成一张干净的产品三视图参考图。',
  constraints: '同一产品的正面、侧面和背面或替代角度；材质、轮廓、比例和关键细节不变。',
},
serialStoryboard25: {
  opening: '从源图生成一张 libtv 风格的 5x5 连贯电影分镜序列。',
  constraints: '单张 25 格联络表；围绕同一核心事件按 1-25 组织建立、特写、替代角度、动作推进、插入镜头、反应和克制收束；保留身份、服装、环境、光影和关键物体；保留 OTS 技术标记；禁止无关剧情、角色、道具、黑边、UI 和水印。',
},
cinematicLightCorrection: {
  opening: '对源图进行电影级光影优化。',
  constraints: '改善光线层次、阴影结构、曝光平衡和氛围；场景、角色、机位、画幅和方向不变；保持单帧；禁止拼贴、黑边、UI、水印和文字。',
},
characterThreeView: {
  opening: '从源图生成一张干净的角色三视图设定图。',
  constraints: '同一角色的全身正面、侧面和背面；脸部身份、身体比例、服装细节和风格不变。',
},
frameProjection3sLater: {
  opening: '基于源图创建一个未来关键帧，模拟同一视频镜头 3 秒后的 libtv 风格画面推演。',
  constraints: '身份、服装、环境、风格和连续性不变；动作阶段、姿势、位置、手部、视线和物体位置必须形成明确的时间推进；允许合理运镜和环境联动；保持单帧；禁止黑边、UI、水印和文字。',
},
frameProjection5sEarlier: {
  opening: '基于源图创建一个过去关键帧，模拟同一视频镜头 5 秒前的 libtv 风格画面推演。',
  constraints: '身份、服装、环境、风格和连续性不变；动作阶段、姿势、位置、手部、视线和物体位置必须形成明确的前置状态；允许合理运镜和环境联动；保持单帧；禁止黑边、UI、水印和文字。',
},
```

Retain the existing line-by-line prompt structure and every original requirement. Translate the multi-camera labels as:

```text
[KF1 | 3s | ELS] 大远景 / 完整环境
[KF2 | 2s | LS] 远景 / 全身
[KF3 | 2s | MLS] 中远景
[KF4 | 2s | MS] 中景
[KF5 | 2s | MCU] 中近景
[KF6 | 2s | CU] 近景
[KF7 | 1s | ECU] 关键手部、物体或细节的大特写
[KF8 | 2s | High-Angle] 高机位俯拍
[KF9 | 2s | Low-Angle] 低机位仰拍
```

Change prompt composition to:

```ts
return `${action.promptTemplate}\n\n用户补充要求：\n${normalizedUserPrompt}`;
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npx vitest --run --exclude ".worktrees/**" src/flowCanvas/utils/imageTemplateEditActions.test.ts src/flowCanvas/runtime/graphExecutor.test.ts
```

Expected: both files PASS, proving the Chinese prompt contract and unchanged graph preparation behavior.

- [ ] **Step 5: Commit the prompt translation**

```bash
git add src/flowCanvas/utils/imageTemplateEditActions.ts src/flowCanvas/utils/imageTemplateEditActions.test.ts
git commit -m "feat: localize nine-grid prompts in Chinese"
```

### Task 2: Record, verify, and publish the localization

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Add the project record entry**

Add this dated entry near the top of `PROJECT_RECORD.md`:

```markdown
## 2026-07-20 - Chinese Nine-grid Template Prompts

- translated the natural-language instructions for all nine image-template tools into production-oriented Chinese while preserving grid notation, keyframe labels, timing, shot abbreviations, template identities, and aspect-ratio behavior.
- changed the appended prompt heading to `用户补充要求：` so the prepared confirmation node is fully readable and editable in Chinese.
- kept model selection, route selection, parameter inheritance, idle node preparation, workflow submission, billing, and backend contracts unchanged.
- validation:
  - focused template and graph preparation regression passed.
  - `npm run build` passed with any existing repository warnings recorded verbatim.
```

- [ ] **Step 2: Run final focused verification**

Run:

```bash
npx vitest --run --exclude ".worktrees/**" src/flowCanvas/utils/imageTemplateEditActions.test.ts src/flowCanvas/runtime/graphExecutor.test.ts src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx
```

Expected: all files PASS with zero failures.

- [ ] **Step 3: Run the production build**

Run:

```bash
npm run build
```

Expected: Vite and the build-version writer exit with code 0; existing non-blocking warnings may remain.

- [ ] **Step 4: Final diff audit and record commit**

Run:

```bash
git diff --check
git status --short
git add PROJECT_RECORD.md
git commit -m "docs: record Chinese nine-grid prompts"
```

Confirm that unrelated dirty files remain unstaged and unchanged.

- [ ] **Step 5: Push verified main**

Run:

```bash
git fetch origin --prune
git rev-list --left-right --count origin/main...HEAD
git push origin main
git rev-parse HEAD
git rev-parse origin/main
```

Expected: the current branch is `main`, `origin/main` has no commits missing locally before push, and both hashes match after push.
