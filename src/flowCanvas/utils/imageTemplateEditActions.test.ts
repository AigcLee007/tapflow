import { describe, expect, test } from 'vitest';

import {
  FLOW_IMAGE_TEMPLATE_EDIT_ACTIONS,
  buildImageTemplateEditPrompt,
  resolveImageTemplateEditAspectRatio,
  resolveImageTemplateEditMode,
} from './imageTemplateEditActions';

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

describe('imageTemplateEditActions', () => {
  test('defines all nine DramaClaw template edit actions', () => {
    expect(FLOW_IMAGE_TEMPLATE_EDIT_ACTIONS.map((action) => action.key)).toEqual([
      'multiCameraGrid',
      'plotFourGrid',
      'faceThreeView',
      'productThreeView',
      'serialStoryboard25',
      'cinematicLightCorrection',
      'characterThreeView',
      'frameProjection3sLater',
      'frameProjection5sEarlier',
    ]);

    expect(resolveImageTemplateEditMode('multiCameraGrid')).toBe('multi_camera_nine_grid');
    expect(resolveImageTemplateEditMode('serialStoryboard25')).toBe('storyboard_25_grid');
  });

  test('builds the Chinese source-equivalent prompt and appends the user requirement block', () => {
    const prompt = buildImageTemplateEditPrompt('multiCameraGrid', '多机位九宫格');

    expect(prompt).toContain('3x3 导演多机位联络表');
    expect(prompt).toContain('[KF1 | 3s | ELS]');
    expect(prompt).toContain('用户补充要求：\n多机位九宫格');
    expect(prompt).not.toContain('User prompt:');
  });

  test('uses Chinese natural-language instructions for all nine templates', () => {
    FLOW_IMAGE_TEMPLATE_EDIT_ACTIONS.forEach((action) => {
      EXPECTED_CHINESE_PROMPT_FRAGMENTS[action.key].forEach((fragment) => {
        expect(action.promptTemplate).toContain(fragment);
      });
      expect(action.promptTemplate).not.toContain('Output requirements:');
    });
  });

  test('keeps stable production tokens in the Chinese prompts', () => {
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

  test('resolves original aspect ratios from source dimensions and preserves fixed template ratios', () => {
    expect(resolveImageTemplateEditAspectRatio('multiCameraGrid', {
      naturalHeight: 1600,
      naturalWidth: 900,
    })).toBe('9:16');

    expect(resolveImageTemplateEditAspectRatio('faceThreeView', {
      naturalHeight: 1600,
      naturalWidth: 900,
    })).toBe('3:2');
  });
});
