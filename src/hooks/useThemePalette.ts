"use client";

import { useEffect, useState } from "react";

export type ThemePalette = {
  foreground: string;
  muted: string;
  grid: string;
  tooltip: string;
  tooltipForeground: string;
};

const LIGHT_PALETTE: ThemePalette = {
  foreground: "#18231d",
  muted: "#65736b",
  grid: "#e4ebe6",
  tooltip: "#ffffff",
  tooltipForeground: "#18231d",
};

function readPalette(): ThemePalette {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    foreground: read("--foreground", LIGHT_PALETTE.foreground),
    muted: read("--chart-label", LIGHT_PALETTE.muted),
    grid: read("--chart-grid", LIGHT_PALETTE.grid),
    tooltip: read("--chart-tooltip", LIGHT_PALETTE.tooltip),
    tooltipForeground: read("--chart-tooltip-foreground", LIGHT_PALETTE.tooltipForeground),
  };
}

/** Read CSS theme tokens for canvas charts and redraw them when the theme changes. */
export function useThemePalette(): ThemePalette {
  const [palette, setPalette] = useState<ThemePalette>(LIGHT_PALETTE);

  useEffect(() => {
    const sync = () => setPalette(readPalette());
    sync();
    window.addEventListener("sorana-theme-change", sync);
    return () => window.removeEventListener("sorana-theme-change", sync);
  }, []);

  return palette;
}
