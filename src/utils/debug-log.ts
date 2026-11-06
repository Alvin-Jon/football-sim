import { appendFileSync } from "node:fs";

export function debugLog(message: string): void {
  appendFileSync("debug.log", message + "\n");
}