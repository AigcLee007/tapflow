export type FlowImageTemplateEditActionKey =
  | 'multiCameraGrid'
  | 'plotFourGrid'
  | 'faceThreeView'
  | 'productThreeView'
  | 'serialStoryboard25'
  | 'cinematicLightCorrection'
  | 'characterThreeView'
  | 'frameProjection3sLater'
  | 'frameProjection5sEarlier';

export type FlowImageTemplateEditMode =
  | 'multi_camera_nine_grid'
  | 'story_pitch_four_grid'
  | 'character_face_three_view'
  | 'product_three_view'
  | 'storyboard_25_grid'
  | 'cinematic_light_correction'
  | 'character_three_view_generation'
  | 'image_projection_after_3s'
  | 'image_projection_before_5s';

type TemplateAspectRatioPolicy = 'original' | '3:2' | '16:9';

export type FlowImageTemplateEditAction = {
  key: FlowImageTemplateEditActionKey;
  mode: FlowImageTemplateEditMode;
  label: string;
  description: string;
  titlePrefix: string;
  aspectRatioPolicy: TemplateAspectRatioPolicy;
  promptTemplate: string;
};

export const FLOW_IMAGE_TEMPLATE_EDIT_ACTIONS: FlowImageTemplateEditAction[] = [
  {
    key: 'multiCameraGrid',
    mode: 'multi_camera_nine_grid',
    label: '多机位九宫格',
    description: '同一时刻的 3x3 导演机位覆盖',
    titlePrefix: '九宫格后的',
    aspectRatioPolicy: 'original',
    promptTemplate:
      '从源图生成一张 libtv 风格的 3x3 导演多机位联络表。\n\n'
      + '输出要求：\n'
      + '- 最终输出必须是一张清晰可读的 3x3 网格联络表，而不是九张独立图片。\n'
      + '- 保持同一主体、同一服装、同一场景、同一时间点和同一动作。\n'
      + '- 不要添加新角色、新对白、新剧情事件或无关道具。\n'
      + '- 每个格子必须保持源图的宽高比和方向。\n'
      + '- 不要把不同机位裁切成不同的宽高比。\n'
      + '- 只改变机位覆盖方式：景别、机位高度、镜头距离和角度。\n'
      + '- 每个格子都必须像同一镜头设置下可供导演使用的覆盖画面。\n'
      + '- 在每个格子的左上角添加小号白色标签。\n'
      + '- 按阅读顺序严格使用以下九个标签和镜头类型：\n'
      + '  [KF1 | 3s | ELS] 大远景 / 完整环境，\n'
      + '  [KF2 | 2s | LS] 远景 / 全身，\n'
      + '  [KF3 | 2s | MLS] 中远景，\n'
      + '  [KF4 | 2s | MS] 中景，\n'
      + '  [KF5 | 2s | MCU] 中近景，\n'
      + '  [KF6 | 2s | CU] 近景，\n'
      + '  [KF7 | 1s | ECU] 关键手部、物体或细节的大特写，\n'
      + '  [KF8 | 2s | High-Angle] 高机位俯拍，\n'
      + '  [KF9 | 2s | Low-Angle] 低机位仰拍。\n'
      + '- 格子之间使用细深色分隔线，不要留大块白色间隙，也不要添加装饰边框。\n'
      + '- 铺满整个输出画布，不要添加黑边、信箱式留边、UI 或水印。\n'
      + '- 所有格子必须保持人物身份、服装、光影氛围、色调和场景连续性。',
  },
  {
    key: 'plotFourGrid',
    mode: 'story_pitch_four_grid',
    label: '剧情推演四宫格',
    description: '把当前画面展开成 2x2 连续剧情',
    titlePrefix: '剧情四宫格后的',
    aspectRatioPolicy: 'original',
    promptTemplate:
      '从源图生成一张 2x2 剧情提案分镜板。\n\n'
      + '输出要求：\n'
      + '- 创建四个连续剧情画面，延展当前剧情时刻。\n'
      + '- 保持同一角色、同一场景和同一戏剧语境。\n'
      + '- 强调清晰的剧情推进和情绪节拍。\n'
      + '- 每个格子必须保持源图的宽高比和方向。\n'
      + '- 不要把不同剧情画面裁切成不同的宽高比。\n'
      + '- 将四个相同比例的画面排列在整洁的 2x2 网格中，并使用细分隔线。\n'
      + '- 铺满整个输出画布，不要添加黑边、信箱式留边、UI 或水印。',
  },
  {
    key: 'faceThreeView',
    mode: 'character_face_three_view',
    label: '角色脸部三视图',
    description: '正面、四分之三、侧面的脸部参考',
    titlePrefix: '脸部三视图后的',
    aspectRatioPolicy: '3:2',
    promptTemplate:
      '从源图生成一张干净的脸部三视图参考图。\n\n'
      + '输出要求：\n'
      + '- 展示同一张脸的正面、四分之三侧面和侧面。\n'
      + '- 保持脸部身份、年龄、发型、肤色和表情逻辑。\n'
      + '- 使用干净的参考图版式。\n'
      + '- 最终输出必须是紧凑的脸部三视图布局。',
  },
  {
    key: 'productThreeView',
    mode: 'product_three_view',
    label: '产品三视图',
    description: '正面、侧面、背面或替代角度',
    titlePrefix: '产品三视图后的',
    aspectRatioPolicy: '3:2',
    promptTemplate:
      '从源图生成一张干净的产品三视图参考图。\n\n'
      + '输出要求：\n'
      + '- 展示同一产品的正面、侧面和背面或替代角度。\n'
      + '- 保持材质、轮廓、比例和关键细节。\n'
      + '- 使用干净、中性的产品参考图布局。\n'
      + '- 最终输出必须是一张三视图图版。',
  },
  {
    key: 'serialStoryboard25',
    mode: 'storyboard_25_grid',
    label: '25宫格连贯分镜',
    description: '围绕当前事件生成 5x5 连贯电影分镜',
    titlePrefix: '25宫格分镜后的',
    aspectRatioPolicy: 'original',
    promptTemplate:
      '从源图生成一张 libtv 风格的 5x5 连贯电影分镜序列。\n\n'
      + '输出要求：\n'
      + '- 最终输出必须是一张清晰可读的 5x5 分镜联络表，而不是 25 张独立图片。\n'
      + '- 围绕源图中的同一核心事件构建连贯的镜头推进。\n'
      + '- 不要创建随机变体、无关的未来场景或新的结局。\n'
      + '- 保持源图中可见的主体、身份、服装或材质、环境、光影氛围和关键物体。\n'
      + '- 根据源图的实际内容调整序列，不要虚构画面中不可见或没有明确暗示的对白、额外角色、纸张、武器、车辆或道具。\n'
      + '- 按照可编辑的电影序列组织 25 个格子：\n'
      + '  1-3：建立场地、主体位置和空间关系，\n'
      + '  4-6：主体特写、细节画面，存在角色时可使用反应镜头，\n'
      + '  7-10：替代角度，仅在适用时使用过肩镜头或视线关系覆盖，\n'
      + '  11-15：逐步推进可见的关键动作，或最合理的下一步微动作，\n'
      + '  16-19：对可见关键细节进行插入镜头和大特写，包括手、脸、眼睛、物体、纹理、标识、机械、景观特征或环境线索，\n'
      + '  20-22：停顿、反应、结果或氛围细节节拍，\n'
      + '  23-25：保持在同一场景和主体语境中的克制收束画面。\n'
      + '- 有意识地混合镜头类型：远景、中景、近景、大特写、插入镜头、反应或细节镜头。仅当源图存在有效的过肩关系时使用 OTS。\n'
      + '- 避免在多个格子中重复相同的双人构图或肖像构图。\n'
      + '- 在每个格子的左上角低调标注 1 到 25 的序号。\n'
      + '- 每个格子必须保持源图的宽高比和方向。\n'
      + '- 不要把不同分镜画面裁切成不同的宽高比。\n'
      + '- 将 25 个相同比例的画面排列在整洁的 5x5 网格中，并使用细分隔线。\n'
      + '- 铺满整个输出画布，不要添加黑边、信箱式留边、UI 或水印。',
  },
  {
    key: 'cinematicLightCorrection',
    mode: 'cinematic_light_correction',
    label: '电影级光影校正',
    description: '保留构图，提升光比、阴影、曝光和氛围',
    titlePrefix: '光影校正后的',
    aspectRatioPolicy: 'original',
    promptTemplate:
      '对源图进行电影级光影优化。\n\n'
      + '输出要求：\n'
      + '- 改善光线层次、阴影结构、曝光平衡和氛围。\n'
      + '- 严格保持源图的宽高比、画布尺寸和方向。\n'
      + '- 保持同一场景、同一角色和同一机位构图。\n'
      + '- 不要把画面变成不同的构图。\n'
      + '- 铺满整个现有画布，不要添加黑边、边框或信箱式留边。\n'
      + '- 最终输出必须保持为单帧，不要添加拼贴、UI、水印或文字。',
  },
  {
    key: 'characterThreeView',
    mode: 'character_three_view_generation',
    label: '角色三视图生成',
    description: '全身正面、侧面、背面的角色设定图',
    titlePrefix: '角色三视图后的',
    aspectRatioPolicy: '16:9',
    promptTemplate:
      '从源图生成一张干净的角色三视图设定图。\n\n'
      + '输出要求：\n'
      + '- 展示同一角色的全身正面、侧面和背面。\n'
      + '- 保持脸部身份、身体比例、服装细节和风格。\n'
      + '- 保持画面干净并便于作为设定参考。\n'
      + '- 最终输出必须是一张角色三视图图版。',
  },
  {
    key: 'frameProjection3sLater',
    mode: 'image_projection_after_3s',
    label: '画面推演 - 3秒后',
    description: '生成同一镜头 3 秒后的邻近关键帧',
    titlePrefix: '3秒后推演后的',
    aspectRatioPolicy: 'original',
    promptTemplate:
      '基于源图创建未来关键帧，模拟同一视频镜头 3 秒后的 libtv 风格画面推演。\n\n'
      + '输出要求：\n'
      + '- 保持角色身份、服装、环境、美术风格和剧情连续性。\n'
      + '- 严格保持源图的宽高比、画布尺寸和方向。\n'
      + '- 铺满整个现有画布，不要添加黑边、边框或信箱式留边。\n'
      + '- 不要生成源图的近似复制品或只做简单修饰。\n'
      + '- 形成明确的时间推进：主体必须处于不同的动作阶段、身体姿势、行走位置、手部位置、视线和物体摆放状态。\n'
      + '- 在相同画幅内使用合理的摇镜、俯仰、推进、拉远或主体位移，让时间变化清晰可见。\n'
      + '- 允许门、道具、布料、头发、阴影和邻近环境细节随动作变化，同时保持空间连续性合理。\n'
      + '- 推演时刻应当像真实的相邻视频帧，而不是经过修饰的静帧。\n'
      + '- 最终输出必须是单帧，不要添加拼贴、UI、水印或文字。',
  },
  {
    key: 'frameProjection5sEarlier',
    mode: 'image_projection_before_5s',
    label: '画面推演 - 5秒前',
    description: '生成同一镜头 5 秒前的邻近关键帧',
    titlePrefix: '5秒前推演后的',
    aspectRatioPolicy: 'original',
    promptTemplate:
      '基于源图创建过去关键帧，模拟同一视频镜头 5 秒前的 libtv 风格画面推演。\n\n'
      + '输出要求：\n'
      + '- 保持角色身份、服装、环境、美术风格和剧情连续性。\n'
      + '- 严格保持源图的宽高比、画布尺寸和方向。\n'
      + '- 铺满整个现有画布，不要添加黑边、边框或信箱式留边。\n'
      + '- 不要生成源图的近似复制品或只做简单修饰。\n'
      + '- 形成明确的前置状态：主体必须处于不同的动作阶段、身体姿势、行走位置、手部位置、视线和物体摆放状态。\n'
      + '- 在相同画幅内使用合理的摇镜、俯仰、推进、拉远或主体位移，让更早的时刻清晰可见。\n'
      + '- 允许门、道具、布料、头发、阴影和邻近环境细节随前置动作变化，同时保持空间连续性合理。\n'
      + '- 推演时刻应当像真实的相邻视频帧，而不是经过修饰的静帧。\n'
      + '- 最终输出必须是单帧，不要添加拼贴、UI、水印或文字。',
  },
];

const ACTIONS_BY_KEY = new Map(FLOW_IMAGE_TEMPLATE_EDIT_ACTIONS.map((action) => [action.key, action]));
const COMMON_RATIO_STRINGS = ['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16', '21:9'];

function gcd(left: number, right: number): number {
  let a = Math.abs(Math.round(left));
  let b = Math.abs(Math.round(right));
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a || 1;
}

function normalizeRatioString(value: unknown): string | null {
  const match = String(value || '').trim().replace('-', ':').match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  const divisor = gcd(width, height);
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

function buildRatioFromDimensions(width: unknown, height: unknown): string | null {
  const numericWidth = Number(width);
  const numericHeight = Number(height);
  if (!Number.isFinite(numericWidth) || !Number.isFinite(numericHeight) || numericWidth <= 0 || numericHeight <= 0) {
    return null;
  }
  const divisor = gcd(numericWidth, numericHeight);
  return `${Math.round(numericWidth / divisor)}:${Math.round(numericHeight / divisor)}`;
}

function buildRatioFromAspectValue(aspectRatio: unknown): string | null {
  const numeric = Number(aspectRatio);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  const matchedCommon = COMMON_RATIO_STRINGS.find((candidate) => {
    const normalized = normalizeRatioString(candidate);
    if (!normalized) return false;
    const [widthText, heightText] = normalized.split(':');
    return Math.abs(numeric - (Number(widthText) / Number(heightText))) < 0.015;
  });
  if (matchedCommon) {
    return matchedCommon;
  }

  let bestNumerator = 1;
  let bestDenominator = 1;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (let denominator = 1; denominator <= 32; denominator += 1) {
    const numerator = Math.max(1, Math.round(numeric * denominator));
    const diff = Math.abs(numeric - (numerator / denominator));
    if (diff < bestDiff) {
      bestDiff = diff;
      bestNumerator = numerator;
      bestDenominator = denominator;
    }
  }

  const divisor = gcd(bestNumerator, bestDenominator);
  return `${Math.round(bestNumerator / divisor)}:${Math.round(bestDenominator / divisor)}`;
}

export function getImageTemplateEditAction(
  key: FlowImageTemplateEditActionKey,
): FlowImageTemplateEditAction {
  const action = ACTIONS_BY_KEY.get(key);
  if (!action) {
    throw new Error(`Unknown template edit action: ${key}`);
  }
  return action;
}

export function resolveImageTemplateEditMode(key: FlowImageTemplateEditActionKey): FlowImageTemplateEditMode {
  return getImageTemplateEditAction(key).mode;
}

export function buildImageTemplateEditPrompt(
  key: FlowImageTemplateEditActionKey,
  userPrompt = '',
): string {
  const action = getImageTemplateEditAction(key);
  const normalizedUserPrompt = String(userPrompt || '').trim();
  if (!normalizedUserPrompt) {
    return action.promptTemplate;
  }
  return `${action.promptTemplate}\n\n用户补充要求：\n${normalizedUserPrompt}`;
}

export function resolveImageTemplateEditAspectRatio(
  key: FlowImageTemplateEditActionKey,
  source: Record<string, unknown>,
): string {
  const action = getImageTemplateEditAction(key);
  if (action.aspectRatioPolicy !== 'original') {
    return action.aspectRatioPolicy;
  }

  const params = source.params && typeof source.params === 'object'
    ? source.params as Record<string, unknown>
    : {};
  return normalizeRatioString(params.aspectRatio)
    ?? normalizeRatioString(params.aspect_ratio)
    ?? buildRatioFromDimensions(source.naturalWidth, source.naturalHeight)
    ?? buildRatioFromDimensions(source.width, source.height)
    ?? buildRatioFromAspectValue(source.aspectRatio)
    ?? '1:1';
}
