import React from "react";

import { MENU_RADIUS_CLASS, MENU_SURFACE_CLASS } from "./menuStyles";

export function MenuSurface({
  children,
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`${MENU_SURFACE_CLASS} ${MENU_RADIUS_CLASS} ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}

