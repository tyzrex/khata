"use client";

import { SerwistProvider } from "@serwist/next/react";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SerwistProvider swUrl="/sw.js" disable={process.env.NODE_ENV === "development"}>
        {children}
        <Toaster position="top-center" />
      </SerwistProvider>
    </ThemeProvider>
  );
}
