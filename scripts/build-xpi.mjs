// Packages the add-on into dist/isemailspam.xpi from an explicit file list.
// Usage: node scripts/build-xpi.mjs [output-path]

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createZip } from "./zip.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Runtime files only; tests, scripts and dev files are never packaged.
export const RUNTIME_FILES = [
  "manifest.json",
  "background.js",
  "common.css",
  "LICENSE",
  "icons/icon.svg",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "icons/icon-64.png",
  "icons/icon-96.png",
  "icons/icon-128.png",
  "lib/api.js",
  "lib/controller.js",
  "lib/describe.js",
  "lib/sender.js",
  "lib/settings.js",
  "popup/popup.html",
  "popup/popup.css",
  "popup/popup.js",
  "options/options.html",
  "options/options.css",
  "options/options.js",
];

export function buildXpi(outPath = join(root, "dist", "isemailspam.xpi")) {
  const entries = RUNTIME_FILES.map((name) => ({
    name,
    data: readFileSync(join(root, name)),
  }));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, createZip(entries));
  return outPath;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = buildXpi(process.argv[2] ? resolve(process.argv[2]) : undefined);
  console.log(`Wrote ${out}`);
}
