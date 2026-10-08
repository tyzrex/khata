import { randomUUID } from "node:crypto";
import { serwist } from "@serwist/next/config";

// A fresh revision per build so installed apps pick up a changed offline page; it is the only HTML precached.
const buildId = process.env.VERCEL_GIT_COMMIT_SHA ?? randomUUID();

export default serwist({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  additionalPrecacheEntries: [
    { url: "/offline", revision: buildId },
    { url: "/manifest.webmanifest", revision: buildId },
  ],
  // Prerendered HTML is the static shell of dynamic pages ("/" streams the signed-in ledger into it).
  // Precaching it would serve the bare shell for navigations, so only /offline is precached as HTML.
  precachePrerendered: false,
  // Launch images are fetched by iOS at install time only; keep them out of every install's precache.
  globIgnores: ["public/splash/**"],
});
