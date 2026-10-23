#!/usr/bin/env node
import "./local-cli-only.mjs";

/**
 * scripts/intake-cli.mjs
 * Runner for npm run intake -- "<text>"
 */

import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distCli = path.resolve(__dirname, "../packages/core/dist/intake/cli.js");

if (!fs.existsSync(distCli)) {
  console.log("Building packages first...");
  const { execSync } = await import("child_process");
  execSync("npm run build", { stdio: "inherit" });
}

await import(pathToFileURL(distCli).href);


