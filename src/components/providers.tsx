"use client";

import { SerwistProvider } from "@serwist/next/react";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { QueryProvider } from "@/components/query-provider";
import { ThemeColor } from "@/components/theme-color";
import { Toaster } from "@/components/toaster";
import { UpdatePrompt } from "@/components/update-prompt";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      <QueryProvider>
        <SerwistProvider swUrl="/sw.js" disable={process.env.NODE_ENV === "development"} cacheOnNavigation={false}>
          {children}
          <ThemeColor />
          <Toaster />
          <UpdatePrompt />
        </SerwistProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
