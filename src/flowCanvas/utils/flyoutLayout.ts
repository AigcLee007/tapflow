export type FlyoutPosition = {
  left: number;
  top: number;
  maxHeight: number;
};

export type AnchorRect = {
  top: number;
  right: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

export const getAnchoredFlyoutPosition = ({
  anchorRect,
  viewportWidth,
  viewportHeight,
  panelWidth,
  panelMaxHeight,
  offsetLeft = 8,
  offsetTop = -10,
  margin = 16,
}: {
  anchorRect: AnchorRect;
  viewportWidth: number;
  viewportHeight: number;
  panelWidth: number;
  panelMaxHeight: number;
  offsetLeft?: number;
  offsetTop?: number;
  margin?: number;
}): FlyoutPosition => {
  const maxHeight = Math.max(300, Math.min(panelMaxHeight, viewportHeight - margin * 2));
  const left = clamp(anchorRect.right + offsetLeft, margin, viewportWidth - panelWidth - margin);
  const top = clamp(anchorRect.top + offsetTop, margin, viewportHeight - maxHeight - margin);

  return { left, top, maxHeight };
};
