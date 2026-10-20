/**
 * apps/worker/src/booking/guards.test.ts
 *
 * Stage 7 Static Architectural Guards:
 * - Guarantees apps/worker NEVER makes direct HTTP/fetch calls to portal APIs (e.g. /api/bookings, /api/fee, /api/captcha).
 *   All booking interactions MUST be pure browser DOM automation.
 * - Guarantees apps/worker NEVER imports CAPTCHA test helpers or test bypasses.
 *   The booking agent is strictly isolated from test cheat codes.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

function getAllTsFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== "node_modules" && file !== "dist") {
        getAllTsFiles(fullPath, fileList);
      }
    } else if (/\.(ts|mjs|cjs)$/.test(file) && !file.endsWith(".d.ts")) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

describe("Stage 7 Static Architectural Guards for apps/worker", () => {
  const workerSrcDir = path.resolve(__dirname, "..");
  const allWorkerFiles = getAllTsFiles(workerSrcDir);
  const productionFiles = [...allWorkerFiles, ...getAllTsFiles(path.resolve(__dirname, "../../../../scripts"))]
    .filter((file) => !file.endsWith(".test.ts"));

  it("worker and scripts never read or type verification codes or import solvers", () => {
    for (const file of productionFiles) {
      const content = fs.readFileSync(file, "utf8");
      expect(content, file).not.toMatch(/humanSolveForTest|simulateHumanCaptchaSolve|getStoredCaptchaCode|lib\/captcha/);
      expect(content, file).not.toMatch(/(?:fill|inputValue|textContent|evaluate)\([^;\n]*(?:captchaInput|input-captcha-code)/);
    }
  });

  it("booking never assigns verifier-owned downstream states", () => {
    for (const file of productionFiles) {
      expect(fs.readFileSync(file, "utf8"), file)
        .not.toMatch(/(?:state\s*[:=]|transitionState\([^,]+,)\s*["'](?:REQUEST_CONFIRMED|PICKUP_SCHEDULED|PICKED_UP)["']/);
    }
  });

  it("found worker source files to inspect", () => {
    expect(allWorkerFiles.length).toBeGreaterThan(0);
  });

  it("apps/worker NEVER calls portal /api/* endpoints directly", () => {
    // Booker must ONLY interact via browser DOM, never bypass via portal JSON APIs
    const forbiddenApiPattern = /["'`]\/api\/(bookings|fee|captcha|admin|reset|health)/i;

    for (const filePath of allWorkerFiles) {
      // Exclude test files inspecting this rule
      if (filePath.endsWith("guards.test.ts")) continue;

      const content = fs.readFileSync(filePath, "utf-8");
      const match = content.match(forbiddenApiPattern);
      if (match) {
        throw new Error(
          `Architectural violation in ${filePath}: Found direct portal API call "${match[0]}". Booker must strictly use browser DOM automation.`
        );
      }
    }
  });

  it("apps/worker NEVER imports CAPTCHA test helper or test suites", () => {
    // Booker must NEVER import test simulation helpers like simulateHumanCaptchaSolve or humanSolveForTest
    const forbiddenImports = [
      "humanSolveForTest",
      "simulateHumanCaptchaSolve",
      "tests/e2e",
      "tests/helpers",
    ];

    for (const filePath of allWorkerFiles) {
      if (filePath.endsWith("guards.test.ts")) continue;

      const content = fs.readFileSync(filePath, "utf-8");
      for (const forbidden of forbiddenImports) {
        if (content.includes(forbidden)) {
          throw new Error(
            `Architectural violation in ${filePath}: Found forbidden test helper reference "${forbidden}". Worker must remain strictly isolated.`
          );
        }
      }
    }
  });

  it("apps/worker production code does not import @playwright/test test runner", () => {
    // Only unit test files (*.test.ts) can import vitest/playwright helpers; runtime worker code uses standard playwright
    const prodFiles = allWorkerFiles.filter((f) => !f.endsWith(".test.ts"));
    for (const filePath of prodFiles) {
      const content = fs.readFileSync(filePath, "utf-8");
      if (content.includes('@playwright/test"') || content.includes("@playwright/test'")) {
        throw new Error(
          `Architectural violation in ${filePath}: Production worker code must import 'playwright', not test runner '@playwright/test'.`
        );
      }
    }
  });
});

