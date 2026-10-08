"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";

const COLORS = { light: "#f1f1f3", dark: "#0a0a0d" } as const;

/** Keeps the browser and installed-app chrome colour in step with the chosen theme. */
export function ThemeColor() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    const color = resolvedTheme === "light" ? COLORS.light : COLORS.dark;
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute("content", color));
  }, [resolvedTheme]);
  return null;
}
