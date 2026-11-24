"use client";

import { useRef } from "react";
import { SidebarRail, useSidebar } from "@startup/web-ui/components/ui/sidebar";
import { sidebarWidthLimits } from "./utils/sidebarConstants";

export function SidebarResizeRail({
  width,
  onWidthChange,
}: {
  width: number;
  onWidthChange: (width: number) => void;
}) {
  const { state, setOpen, toggleSidebar } = useSidebar();
  const drag = useRef<{
    pointerId: number;
    x: number;
    width: number;
    moved: boolean;
  } | null>(null);
  const ignoreClick = useRef(false);
  const resize = (next: number) =>
    onWidthChange(
      Math.round(
        Math.max(sidebarWidthLimits.min, Math.min(sidebarWidthLimits.max, next))
      )
    );
  return (
    <SidebarRail
      role="separator"
      aria-label="Resize sidebar"
      aria-orientation="vertical"
      aria-valuemin={sidebarWidthLimits.min}
      aria-valuemax={sidebarWidthLimits.max}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize sidebar; use arrow keys to adjust"
      className="focus-visible:outline-ring cursor-col-resize touch-none select-none focus-visible:outline-2"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        ignoreClick.current = false;
        drag.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          width,
          moved: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (!start || start.pointerId !== event.pointerId) return;
        const delta = event.clientX - start.x;
        if (!start.moved && Math.abs(delta) < 4) return;
        start.moved = true;
        ignoreClick.current = true;
        if (state === "collapsed") setOpen(true);
        resize(start.width + delta);
      }}
      onPointerUp={(event) => {
        if (drag.current?.pointerId !== event.pointerId) return;
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = null;
        ignoreClick.current = true;
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onClick={(event) => {
        if (ignoreClick.current) {
          event.preventDefault();
          ignoreClick.current = false;
          return;
        }
        toggleSidebar();
      }}
      onKeyDown={(event) => {
        const next =
          event.key === "ArrowLeft"
            ? width - sidebarWidthLimits.step
            : event.key === "ArrowRight"
              ? width + sidebarWidthLimits.step
              : event.key === "Home"
                ? sidebarWidthLimits.min
                : event.key === "End"
                  ? sidebarWidthLimits.max
                  : null;
        if (next === null) return;
        event.preventDefault();
        setOpen(true);
        resize(next);
      }}
    />
  );
}
