import React from 'react';
import {
  BadgeCheck,
  Eraser,
  Globe2,
  Grid3X3,
  ImageOff,
  Maximize2,
  PencilLine,
  Scaling,
  Sparkles,
} from 'lucide-react';

import { MenuSurface } from '../../components/menu/MenuSurface';
import {
  MENU_DIVIDER_CLASS,
  MENU_ITEM_CLASS,
  MENU_ITEM_PRIMARY_CLASS,
  MENU_ITEM_SECONDARY_CLASS,
} from '../../components/menu/menuStyles';
import { IMAGE_MENU_SURFACE_Z_INDEX, IMAGE_MODEL_MENU_WIDTH } from './imageMenuStyles';

export type ImageMoreMenuAction =
  | 'outpaint'
  | 'erase'
  | 'annotate'
  | 'removeBackground'
  | 'split'
  | 'enhance'
  | 'resize'
  | 'panoramaViewer'
  | 'compliance';

interface ImageMoreMenuProps {
  menuRef?: React.RefObject<HTMLDivElement | null>;
  fixedPosition?: { left: number; top: number };
  onSelect: (action: ImageMoreMenuAction, payload?: { gridSize?: number }) => void;
  showPanoramaViewer?: boolean;
}

const BASE_MENU_ROWS: Array<{
  id: Exclude<ImageMoreMenuAction, 'split' | 'panoramaViewer' | 'compliance'>;
  label: string;
  description: string;
  icon: React.ReactNode;
  disabled?: boolean;
}> = [
  { id: 'outpaint', label: '扩图', description: '延展画面边缘', icon: <Maximize2 size={20} /> },
  { id: 'erase', label: '擦除', description: '移除局部元素', icon: <Eraser size={20} /> },
  { id: 'annotate', label: '标注', description: '指定修改区域', icon: <PencilLine size={20} /> },
  { id: 'enhance', label: '增强', description: '提升细节质感', icon: <Sparkles size={20} /> },
  { id: 'resize', label: '调整像素', description: '切换输出分辨率', icon: <Scaling size={20} /> },
  { id: 'removeBackground', label: '抠图', description: '分离主体背景', icon: <ImageOff size={20} /> },
];

export const ImageMoreMenu: React.FC<ImageMoreMenuProps> = ({
  fixedPosition,
  menuRef,
  onSelect,
  showPanoramaViewer = false,
}) => {
  return (
    <MenuSurface
      ref={menuRef as React.RefObject<HTMLDivElement>}
      className={`nodrag nopan nowheel p-2 ${
        fixedPosition ? 'fixed -translate-x-1/2' : 'absolute left-1/2 top-[calc(100%+14px)] -translate-x-1/2'
      }`}
      role="menu"
      style={
        fixedPosition
          ? { left: fixedPosition.left, top: fixedPosition.top, width: IMAGE_MODEL_MENU_WIDTH, zIndex: IMAGE_MENU_SURFACE_Z_INDEX }
          : { width: IMAGE_MODEL_MENU_WIDTH, zIndex: IMAGE_MENU_SURFACE_Z_INDEX }
      }
      onClick={(event) => event.stopPropagation()}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          border: '9px solid transparent',
          borderBottomColor: 'rgba(28,28,32,0.95)',
        }}
      />

      <div className="grid gap-1">
        {BASE_MENU_ROWS.map((row) => (
          <button
            key={row.id}
            type="button"
            disabled={row.disabled}
            onClick={() => onSelect(row.id)}
            className={`${MENU_ITEM_CLASS} min-h-[38px] ${
              row.disabled ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-white/[0.08] text-white/90">
              {row.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`${MENU_ITEM_PRIMARY_CLASS} block`}>{row.label}</span>
              <span className={`${MENU_ITEM_SECONDARY_CLASS} mt-1 block`}>{row.description}</span>
            </span>
            {row.disabled ? <span className={MENU_ITEM_SECONDARY_CLASS}>待接入</span> : null}
          </button>
        ))}

        {showPanoramaViewer ? (
          <button
            type="button"
            onClick={() => onSelect('panoramaViewer')}
            className={`${MENU_ITEM_CLASS} min-h-[38px]`}
          >
            <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-white/[0.08] text-white/90">
              <Globe2 size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className={`${MENU_ITEM_PRIMARY_CLASS} block`}>360 全景查看</span>
              <span className={`${MENU_ITEM_SECONDARY_CLASS} mt-1 block`}>创建或打开全景查看器</span>
            </span>
          </button>
        ) : null}

        <div className={MENU_DIVIDER_CLASS} />

        <div className="flex min-h-[38px] items-center justify-between gap-[7px] rounded-[10px] px-1.5 text-white">
          <div className="flex min-w-0 items-center gap-[7px]">
            <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-white/[0.08] text-white/90">
              <Grid3X3 size={20} />
            </span>
            <span>
              <span className={`${MENU_ITEM_PRIMARY_CLASS} block`}>快速切分</span>
              <span className={`${MENU_ITEM_SECONDARY_CLASS} mt-1 block`}>按网格拆分画面</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            {[2, 3, 4].map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => onSelect('split', { gridSize: size })}
                className="h-[30px] min-w-[30px] rounded-[9px] border border-white/10 bg-white/[0.04] px-2 text-xs font-bold text-white transition hover:bg-white/[0.09]"
              >
                {size}x{size}
              </button>
            ))}
          </div>
        </div>

        <div className={MENU_DIVIDER_CLASS} />

        <button
          type="button"
          disabled
          className={`${MENU_ITEM_CLASS} min-h-[38px] cursor-not-allowed opacity-50`}
        >
          <span className="relative flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-white/[0.08] text-white/90">
            <BadgeCheck size={20} />
            <span
              style={{
                position: 'absolute',
                top: -3,
                right: -3,
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: '#0ea5e9',
              }}
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className={`${MENU_ITEM_PRIMARY_CLASS} block`}>Seedance 2.0 合规验证</span>
            <span className={`${MENU_ITEM_SECONDARY_CLASS} mt-1 block`}>即将接入的安全检查</span>
          </span>
        </button>
      </div>
    </MenuSurface>
  );
};
