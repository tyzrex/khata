import { serwist } from "@serwist/next/config";

export default serwist({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  additionalPrecacheEntries: [{ url: "/offline", revision: "khata-offline-1" }],
});
