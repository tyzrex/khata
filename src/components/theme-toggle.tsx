"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { setTheme } = useTheme();

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label="Toggle color theme"
      onClick={() => {
        const dark = document.documentElement.classList.contains("dark");
        setTheme(dark ? "light" : "dark");
      }}
    >
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  );
}
