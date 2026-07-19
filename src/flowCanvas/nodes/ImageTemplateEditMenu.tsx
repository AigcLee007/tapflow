import React from 'react';
import {
  Camera,
  FastForward,
  Film,
  LayoutGrid,
  Package,
  Rewind,
  SunMedium,
  User,
} from 'lucide-react';

import { MenuSurface } from '../../components/menu/MenuSurface';
import {
  MENU_ITEM_CLASS,
  MENU_ITEM_PRIMARY_CLASS,
  MENU_ITEM_SECONDARY_CLASS,
} from '../../components/menu/menuStyles';
import {
  FLOW_IMAGE_TEMPLATE_EDIT_ACTIONS,
  type FlowImageTemplateEditActionKey,
} from '../utils/imageTemplateEditActions';
import { IMAGE_MENU_SURFACE_Z_INDEX, IMAGE_MODEL_MENU_WIDTH } from './imageMenuStyles';

interface ImageTemplateEditMenuProps {
  menuRef?: React.RefObject<HTMLDivElement | null>;
  fixedPosition: { left: number; top: number };
  onSelect: (templateActionKey: FlowImageTemplateEditActionKey) => void;
}

const TEMPLATE_ACTION_ICONS: Record<FlowImageTemplateEditActionKey, React.ReactNode> = {
  multiCameraGrid: <Camera size={20} />,
  plotFourGrid: <Film size={20} />,
  faceThreeView: <User size={20} />,
  productThreeView: <Package size={20} />,
  serialStoryboard25: <LayoutGrid size={20} />,
  cinematicLightCorrection: <SunMedium size={20} />,
  characterThreeView: <User size={20} />,
  frameProjection3sLater: <FastForward size={20} />,
  frameProjection5sEarlier: <Rewind size={20} />,
};

export const ImageTemplateEditMenu: React.FC<ImageTemplateEditMenuProps> = ({
  fixedPosition,
  menuRef,
  onSelect,
}) => (
  <MenuSurface
    ref={menuRef as React.RefObject<HTMLDivElement>}
    className="nodrag nopan nowheel fixed -translate-x-1/2 p-2"
    role="menu"
    style={{
      left: fixedPosition.left,
      top: fixedPosition.top,
      width: IMAGE_MODEL_MENU_WIDTH,
      zIndex: IMAGE_MENU_SURFACE_Z_INDEX,
    }}
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

    <div className="grid max-h-[70vh] gap-1 overflow-y-auto pr-1">
      {FLOW_IMAGE_TEMPLATE_EDIT_ACTIONS.map((action) => (
        <button
          key={action.key}
          type="button"
          onClick={() => onSelect(action.key)}
          className={`${MENU_ITEM_CLASS} min-h-[38px]`}
        >
          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-white/[0.08] text-white/90">
            {TEMPLATE_ACTION_ICONS[action.key]}
          </span>
          <span className="min-w-0 flex-1">
            <span className={`${MENU_ITEM_PRIMARY_CLASS} block`}>{action.label}</span>
            <span className={`${MENU_ITEM_SECONDARY_CLASS} mt-1 block`}>{action.description}</span>
          </span>
        </button>
      ))}
    </div>
  </MenuSurface>
);
