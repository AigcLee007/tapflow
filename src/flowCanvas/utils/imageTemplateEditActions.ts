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
      'Generate a libtv-style 3x3 director multi-camera contact sheet from the source image.\n\n'
      + 'Output requirements:\n'
      + '- Final output must be one readable 3x3 grid contact sheet, not nine separate images.\n'
      + '- Keep the same primary subject, same costume, same scene, same time moment, and same action.\n'
      + '- Do not add new characters, new dialogue, new story events, or unrelated props.\n'
      + '- Each cell must preserve the source image aspect ratio and orientation.\n'
      + '- Do not crop each camera view into a different ratio.\n'
      + '- Vary only camera coverage: shot size, camera height, lens distance, and angle.\n'
      + '- Each panel must look like a usable director coverage frame from the same shot setup.\n'
      + '- Add a small white label in the upper-left corner of every cell.\n'
      + '- Use exactly these nine labels and shot types in reading order:\n'
      + '  [KF1 | 3s | ELS] extreme long shot / full environment,\n'
      + '  [KF2 | 2s | LS] long shot / full body,\n'
      + '  [KF3 | 2s | MLS] medium long shot,\n'
      + '  [KF4 | 2s | MS] medium shot,\n'
      + '  [KF5 | 2s | MCU] medium close-up,\n'
      + '  [KF6 | 2s | CU] close-up,\n'
      + '  [KF7 | 1s | ECU] extreme close-up of the key hand/object/detail,\n'
      + '  [KF8 | 2s | High-Angle] high-angle view,\n'
      + '  [KF9 | 2s | Low-Angle] low-angle view.\n'
      + '- Use thin dark grid lines between cells; no large white gutters, no decorative border.\n'
      + '- Fill the whole output canvas; do not add black bars, letterboxing, UI, or watermark.\n'
      + '- Preserve identity, costume, lighting mood, color tone, and scene continuity across all cells.',
  },
  {
    key: 'plotFourGrid',
    mode: 'story_pitch_four_grid',
    label: '剧情推演四宫格',
    description: '把当前画面展开成 2x2 连续剧情',
    titlePrefix: '剧情四宫格后的',
    aspectRatioPolicy: 'original',
    promptTemplate:
      'Generate a 2x2 story pitch board from the source image.\n\n'
      + 'Output requirements:\n'
      + '- Create four consecutive pitch frames that expand the current story moment.\n'
      + '- Keep the same characters, scene, and dramatic context.\n'
      + '- Emphasize clear story progression and emotional beats.\n'
      + '- Each cell must preserve the source image aspect ratio and orientation.\n'
      + '- Do not crop each story frame into a different ratio.\n'
      + '- Arrange the four same-ratio frames in a clean 2x2 grid with thin dividers.\n'
      + '- Fill the whole output canvas; do not add black bars, letterboxing, UI, or watermark.',
  },
  {
    key: 'faceThreeView',
    mode: 'character_face_three_view',
    label: '角色脸部三视图',
    description: '正面、四分之三、侧面的脸部参考',
    titlePrefix: '脸部三视图后的',
    aspectRatioPolicy: '3:2',
    promptTemplate:
      'Generate a clean three-view face sheet from the source image.\n\n'
      + 'Output requirements:\n'
      + '- Show front view, three-quarter view, and side view of the same face.\n'
      + '- Preserve facial identity, age, hairstyle, skin tone, and expression logic.\n'
      + '- Use a clean reference-sheet style.\n'
      + '- Final output must be a compact three-view face layout.',
  },
  {
    key: 'productThreeView',
    mode: 'product_three_view',
    label: '产品三视图',
    description: '正面、侧面、背面或替代角度',
    titlePrefix: '产品三视图后的',
    aspectRatioPolicy: '3:2',
    promptTemplate:
      'Generate a clean three-view product reference sheet from the source image.\n\n'
      + 'Output requirements:\n'
      + '- Show front, side, and back/alternate view of the same product.\n'
      + '- Preserve materials, silhouette, proportions, and key details.\n'
      + '- Use a clean product reference layout with neutral presentation.\n'
      + '- Final output must be a three-view sheet.',
  },
  {
    key: 'serialStoryboard25',
    mode: 'storyboard_25_grid',
    label: '25宫格连贯分镜',
    description: '围绕当前事件生成 5x5 连贯电影分镜',
    titlePrefix: '25宫格分镜后的',
    aspectRatioPolicy: 'original',
    promptTemplate:
      'Generate a libtv-style 5x5 cinematic storyboard shot sequence from the source image.\n\n'
      + 'Output requirements:\n'
      + '- Final output must be one readable 5x5 storyboard contact sheet, not 25 separate images.\n'
      + '- Build a coherent shot progression around the same core event in the source image.\n'
      + '- Do not create random variants, unrelated future scenes, or a new ending.\n'
      + '- Preserve the visible subjects, identities, costumes/materials, environment, lighting mood, and key objects from the source image.\n'
      + '- Adapt the sequence to the actual source content. Do not invent dialogue, extra characters, paper, weapons, vehicles, or props that are not visible or strongly implied.\n'
      + '- Organize the 25 cells like an editable film sequence:\n'
      + '  1-3 establishing coverage of the location, subject placement, and spatial relationship,\n'
      + '  4-6 primary subject close-ups, detail views, or reaction shots when characters exist,\n'
      + '  7-10 alternate angles, over-the-shoulder or eye-line coverage only when applicable,\n'
      + '  11-15 step-by-step progression of the visible key action or the most plausible next micro-action,\n'
      + '  16-19 inserts and extreme close-ups of visible key details: hands, face, eyes, object, texture, signage, machinery, landscape feature, or environment clue,\n'
      + '  20-22 pause, reaction, consequence, or atmospheric detail beats,\n'
      + '  23-25 restrained resolution frames that stay in the same scene and subject context.\n'
      + '- Mix shot types deliberately: wide, medium, close-up, extreme close-up, insert, reaction/detail. Use OTS only when the source contains a valid over-shoulder relationship.\n'
      + '- Avoid repeating the same two-shot or portrait composition across many cells.\n'
      + '- Number each cell unobtrusively in the upper-left corner from 1 to 25.\n'
      + '- Each cell must preserve the source image aspect ratio and orientation.\n'
      + '- Do not crop each storyboard frame into a different ratio.\n'
      + '- Arrange the twenty-five same-ratio frames in a clean 5x5 grid with thin dividers.\n'
      + '- Fill the whole output canvas; do not add black bars, letterboxing, UI, or watermark.',
  },
  {
    key: 'cinematicLightCorrection',
    mode: 'cinematic_light_correction',
    label: '电影级光影校正',
    description: '保留构图，提升光比、阴影、曝光和氛围',
    titlePrefix: '光影校正后的',
    aspectRatioPolicy: 'original',
    promptTemplate:
      'Cinematically refine the source image lighting.\n\n'
      + 'Output requirements:\n'
      + '- Improve light hierarchy, shadow structure, exposure balance, and atmosphere.\n'
      + '- Preserve the source image aspect ratio, canvas dimensions, and orientation exactly.\n'
      + '- Keep the same scene, same characters, and same camera framing.\n'
      + '- Do not turn the image into a different composition.\n'
      + '- Fill the whole existing canvas; do not add black bars, borders, or letterboxing.\n'
      + '- Final output must remain a single frame with no collage, UI, watermark, or text.',
  },
  {
    key: 'characterThreeView',
    mode: 'character_three_view_generation',
    label: '角色三视图生成',
    description: '全身正面、侧面、背面的角色设定图',
    titlePrefix: '角色三视图后的',
    aspectRatioPolicy: '16:9',
    promptTemplate:
      'Generate a clean character three-view sheet from the source image.\n\n'
      + 'Output requirements:\n'
      + '- Show front, side, and back/full-figure view of the same character.\n'
      + '- Preserve face identity, body proportions, costume details, and style.\n'
      + '- Keep the presentation clean and reference-friendly.\n'
      + '- Final output must be a three-view character sheet.',
  },
  {
    key: 'frameProjection3sLater',
    mode: 'image_projection_after_3s',
    label: '画面推演 - 3秒后',
    description: '生成同一镜头 3 秒后的邻近关键帧',
    titlePrefix: '3秒后推演后的',
    aspectRatioPolicy: 'original',
    promptTemplate:
      'Create a future keyframe from the source image, as if this is a libtv-style frame projection 3 seconds later in a video.\n\n'
      + 'Output requirements:\n'
      + '- Preserve character identity, costume, environment, art style, and story continuity.\n'
      + '- Preserve the source image aspect ratio, canvas dimensions, and orientation exactly.\n'
      + '- Fill the whole existing canvas; do not add black bars, borders, or letterboxing.\n'
      + '- Do not make a near-duplicate or simple retouch of the source image.\n'
      + '- Create a clear time jump: the subject must be in a different action phase, body pose, walking position, hand position, gaze, and object placement.\n'
      + '- Within the same frame size, use plausible camera pan, tilt, push, pull, or subject relocation to make the temporal change obvious.\n'
      + '- Allow doors, props, cloth, hair, shadows, and nearby environment details to change according to the action, while keeping spatial continuity coherent.\n'
      + '- The projected moment should feel like a real adjacent video frame, not a retouched still.\n'
      + '- Final output must be one single frame with no collage, UI, watermark, or text.',
  },
  {
    key: 'frameProjection5sEarlier',
    mode: 'image_projection_before_5s',
    label: '画面推演 - 5秒前',
    description: '生成同一镜头 5 秒前的邻近关键帧',
    titlePrefix: '5秒前推演后的',
    aspectRatioPolicy: 'original',
    promptTemplate:
      'Create a past keyframe from the source image, as if this is a libtv-style frame projection 5 seconds before in a video.\n\n'
      + 'Output requirements:\n'
      + '- Preserve character identity, costume, environment, art style, and story continuity.\n'
      + '- Preserve the source image aspect ratio, canvas dimensions, and orientation exactly.\n'
      + '- Fill the whole existing canvas; do not add black bars, borders, or letterboxing.\n'
      + '- Do not make a near-duplicate or simple retouch of the source image.\n'
      + '- Create a clear earlier setup: the subject must be in a different action phase, body pose, walking position, hand position, gaze, and object placement.\n'
      + '- Within the same frame size, use plausible camera pan, tilt, push, pull, or subject relocation to make the earlier moment obvious.\n'
      + '- Allow doors, props, cloth, hair, shadows, and nearby environment details to change according to the preceding action, while keeping spatial continuity coherent.\n'
      + '- The projected moment should feel like a real adjacent video frame, not a retouched still.\n'
      + '- Final output must be one single frame with no collage, UI, watermark, or text.',
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
  return `${action.promptTemplate}\n\nUser prompt:\n${normalizedUserPrompt}`;
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
