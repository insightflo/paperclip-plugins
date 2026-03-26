#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(scriptDir, "..");

const candidates = [
  path.resolve(pluginRoot, "../../scripts/ensure-plugin-build-deps.mjs"),
  path.resolve(pluginRoot, "../../../scripts/ensure-plugin-build-deps.mjs"),
];

const ensureDepsScript = candidates.find((candidate) => fs.existsSync(candidate));

if (!ensureDepsScript) {
  console.log("[system-garden] prebuild: ensure-plugin-build-deps.mjs not found, skipping.");
  process.exit(0);
}

const result = spawnSync(process.execPath, [ensureDepsScript], {
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 0);
