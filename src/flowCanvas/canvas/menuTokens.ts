import type React from 'react';

export const MENU_PANEL_WIDTH = 224;
export const MENU_PANEL_RADIUS = 16;
export const MENU_PANEL_PADDING = '8px 10px 10px';
export const MENU_PANEL_BACKGROUND = 'linear-gradient(155deg, rgba(28,28,29,0.985), rgba(23,25,28,0.985))';
export const MENU_PANEL_BORDER = '1px solid rgba(255,255,255,0.12)';
export const MENU_PANEL_SHADOW = '0 18px 48px rgba(0,0,0,0.52)';
export const MENU_PANEL_BACKDROP = 'blur(18px)';

export const MENU_SECTION_LABEL_STYLE: React.CSSProperties = {
  padding: '6px 0 4px',
  color: 'rgba(255,255,255,0.34)',
  fontSize: 10,
  fontWeight: 700,
  lineHeight: 1.1,
  userSelect: 'none',
};

export const MENU_ITEM_HEIGHT = 38;
export const MENU_ITEM_RADIUS = 10;
export const MENU_ITEM_GAP = 7;
export const MENU_ITEM_PADDING = '5px 6px';
export const MENU_ITEM_LABEL_SIZE = 12;
export const MENU_ITEM_DESC_SIZE = 9;
export const MENU_ITEM_ICON_SIZE = 30;
export const MENU_ITEM_ICON_RADIUS = 9;

export const buildMenuPanelStyle = (overrides?: React.CSSProperties): React.CSSProperties => ({
  position: 'fixed',
  zIndex: 1200,
  width: MENU_PANEL_WIDTH,
  boxSizing: 'border-box',
  padding: MENU_PANEL_PADDING,
  borderRadius: MENU_PANEL_RADIUS,
  background: MENU_PANEL_BACKGROUND,
  border: MENU_PANEL_BORDER,
  boxShadow: MENU_PANEL_SHADOW,
  backdropFilter: MENU_PANEL_BACKDROP,
  overflow: 'auto',
  ...overrides,
});

export const buildMenuItemStyle = (active: boolean, disabled: boolean): React.CSSProperties => ({
  width: '100%',
  minHeight: MENU_ITEM_HEIGHT,
  border: 'none',
  borderRadius: MENU_ITEM_RADIUS,
  background: active ? 'rgba(255,255,255,0.088)' : 'transparent',
  color: disabled ? 'rgba(255,255,255,0.56)' : '#f8fafc',
  display: 'flex',
  alignItems: 'center',
  gap: MENU_ITEM_GAP,
  padding: MENU_ITEM_PADDING,
  cursor: disabled ? 'default' : 'pointer',
  textAlign: 'left',
});

export const buildMenuItemIconStyle = (active: boolean): React.CSSProperties => ({
  width: MENU_ITEM_ICON_SIZE,
  height: MENU_ITEM_ICON_SIZE,
  borderRadius: MENU_ITEM_ICON_RADIUS,
  display: 'grid',
  placeItems: 'center',
  background: active ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.055)',
  color: '#f4f4f5',
  flexShrink: 0,
});

export const MENU_ITEM_LABEL_STYLE: React.CSSProperties = {
  color: '#f8fafc',
  fontSize: MENU_ITEM_LABEL_SIZE,
  fontWeight: 700,
  lineHeight: 1.1,
};

export const MENU_ITEM_DESC_STYLE: React.CSSProperties = {
  color: 'rgba(255,255,255,0.4)',
  fontSize: MENU_ITEM_DESC_SIZE,
  fontWeight: 500,
  lineHeight: 1.25,
};

export const MENU_BETA_PILL_STYLE: React.CSSProperties = {
  padding: '1px 6px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,0.18)',
  color: 'rgba(255,255,255,0.9)',
  fontSize: 9,
  fontWeight: 760,
  lineHeight: 1,
};
