import React from 'react';
import {
  BadgeCheck,
  Eraser,
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

export type ImageMoreMenuAction =
  | 'outpaint'
  | 'erase'
  | 'annotate'
  | 'removeBackground'
  | 'split'
  | 'enhance'
  | 'resize'
  | 'compliance';

interface ImageMoreMenuProps {
  menuRef?: React.RefObject<HTMLDivElement | null>;
  onSelect: (action: ImageMoreMenuAction, payload?: { gridSize?: number }) => void;
}

const menuRows: Array<{
  id: ImageMoreMenuAction;
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

export const ImageMoreMenu: React.FC<ImageMoreMenuProps> = ({ menuRef, onSelect }) => {
  return (
    <MenuSurface
      ref={menuRef as React.RefObject<HTMLDivElement>}
      className="nodrag nopan nowheel absolute left-1/2 top-[calc(100%+14px)] z-[260] w-[338px] -translate-x-1/2 p-3"
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
        {menuRows.map((row) => (
          <button
            key={row.id}
            type="button"
            disabled={row.disabled}
            onClick={() => onSelect(row.id)}
            className={`${MENU_ITEM_CLASS} min-h-[54px] items-start gap-3 px-3 py-3 ${
              row.disabled ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-white/[0.08] text-white/90">
              {row.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`${MENU_ITEM_PRIMARY_CLASS} block`}>{row.label}</span>
              <span className={`${MENU_ITEM_SECONDARY_CLASS} mt-1 block`}>{row.description}</span>
            </span>
            {row.disabled ? <span className={MENU_ITEM_SECONDARY_CLASS}>待接入</span> : null}
          </button>
        ))}

        <div className={MENU_DIVIDER_CLASS} />

        <div className="flex items-center justify-between gap-3 px-3 py-3 text-white">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-white/[0.08] text-white/90">
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
                className="h-9 min-w-9 rounded-[14px] border border-white/10 bg-white/[0.04] px-2 text-[13px] font-semibold text-white transition hover:bg-white/[0.09]"
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
          className={`${MENU_ITEM_CLASS} min-h-[54px] items-start gap-3 px-3 py-3 cursor-not-allowed opacity-50`}
        >
          <span className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-white/[0.08] text-white/90">
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
