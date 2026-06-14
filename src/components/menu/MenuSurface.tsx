import React from "react";

import { MENU_RADIUS_CLASS, MENU_SURFACE_CLASS } from "./menuStyles";

export const MenuSurface = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function MenuSurface({ children, className = "", ...props }, ref) {
  return (
    <div
      ref={ref}
      className={`${MENU_SURFACE_CLASS} ${MENU_RADIUS_CLASS} ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
});
