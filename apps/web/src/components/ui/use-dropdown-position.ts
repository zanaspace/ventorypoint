"use client";

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

interface Options {
  /** "start" aligns the panel's left edge with the trigger, "end" aligns right edges. */
  align?: "start" | "end";
  /** Fixed panel width in px. Defaults to the trigger width (min 160px). */
  width?: number;
  /** Space the panel needs below the trigger before it flips above. */
  minSpaceBelow?: number;
}

const GAP = 4;
const EDGE = 8;

/** Positions a portalled dropdown panel next to its trigger, flipping above when space runs out. */
export function useDropdownPosition(
  triggerRef: RefObject<HTMLElement | null>,
  open: boolean,
  { align = "start", width, minSpaceBelow = 280 }: Options = {}
) {
  const [style, setStyle] = useState<CSSProperties>({ position: "fixed", visibility: "hidden" });
  const [side, setSide] = useState<"bottom" | "top">("bottom");

  useLayoutEffect(() => {
    if (!open) return;

    function update() {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const panelWidth = width ?? Math.max(rect.width, 160);
      const spaceBelow = window.innerHeight - rect.bottom;
      const placeTop = spaceBelow < minSpaceBelow && rect.top > spaceBelow;

      let left = align === "end" ? rect.right - panelWidth : rect.left;
      left = Math.min(Math.max(EDGE, left), window.innerWidth - panelWidth - EDGE);

      setSide(placeTop ? "top" : "bottom");
      setStyle({
        position: "fixed",
        left,
        width: panelWidth,
        zIndex: 9999,
        ...(placeTop
          ? { bottom: window.innerHeight - rect.top + GAP, maxHeight: rect.top - GAP - EDGE }
          : { top: rect.bottom + GAP, maxHeight: spaceBelow - GAP - EDGE }),
      });
    }

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, align, width, minSpaceBelow, triggerRef]);

  return { style, side };
}
