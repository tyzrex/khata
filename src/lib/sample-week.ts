import { readFileSync } from "node:fs";
import path from "node:path";

export function readSampleWeek() {
  const file = path.join(process.cwd(), "seed", "week-of-2026-10-05.json");
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}
