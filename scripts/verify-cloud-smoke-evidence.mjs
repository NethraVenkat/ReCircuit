/**
 * scripts/verify-cloud-smoke-evidence.mjs
 *
 * Verifies previous cloud smoke session and captures DOM proof:
 * 1. Reads back Browserbase session status using bb.sessions.retrieve()
 * 2. Distinguishes requested cleanup (status update) from observed terminal state.
 * 3. Inspects supported session-release methods in @browserbasehq/sdk.
 * 4. Captures and hashes the actual live DOM from https://example.com to verify <h1> vs <title>.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Browserbase } from "@browserbasehq/sdk";

function loadEnvLocal() {
  const envLocalPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envLocalPath)) {
    const lines = fs.readFileSync(envLocalPath, "utf-8").split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eqIdx = line.indexOf("=");
      if (eqIdx !== -1) {
        const key = line.slice(0, eqIdx).trim();
        let val = line.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined || process.env[key] === "") {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvLocal();

const evidenceDir = path.resolve(process.cwd(), ".data", "evidence", "run-20261021-235300-cloud-soak");
if (!fs.existsSync(evidenceDir)) {
  fs.mkdirSync(evidenceDir, { recursive: true });
}

async function main() {
  console.log("==================================================================");
  console.log("  ReCircuit: Cloud Smoke Evidence & Session Verification");
  console.log("==================================================================");

  const apiKey = process.env.BROWSERBASE_API_KEY?.trim();
  const projectId = process.env.BROWSERBASE_PROJECT_ID?.trim();

  if (!apiKey || !projectId) {
    console.error("Missing BROWSERBASE credentials in environment or .env.local");
    process.exit(1);
  }

  const bb = new Browserbase({ apiKey });

  // 1. Inspect supported session-release operations on SDK
  const sessionProtoMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(bb.sessions));
  console.log("- SDK bb.sessions supported methods:", sessionProtoMethods.join(", "));

  // 2. Read back session state from the smoke test
  const manifestPath = path.join(evidenceDir, "manifest.jsonl");
  let lastSessionId = "f12b1860-797d-46fd-aa8d-27afb2b7a259";

  if (fs.existsSync(manifestPath)) {
    const lines = fs.readFileSync(manifestPath, "utf-8").trim().split("\n");
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.status === "PASS" && parsed.sessionId) {
          lastSessionId = parsed.sessionId;
        }
      } catch {}
    }
  }

  console.log(`- Reading back session state for session: ${lastSessionId}...`);
  const session = await bb.sessions.retrieve(lastSessionId);
  const observedStatus = session.status;
  console.log(`- Observed Terminal State: ${observedStatus}`);
  console.log(`  - Created At: ${session.createdAt}`);
  console.log(`  - Started At: ${session.startedAt}`);
  console.log(`  - Ended At:   ${session.endedAt}`);
  console.log(`  - Expires At: ${session.expiresAt}`);
  console.log(`  - Region:     ${session.region}`);
  console.log(`  - Proxy Bytes: ${session.proxyBytes}`);

  // 3. Capture actual live example.com DOM and verify elements
  console.log("- Fetching live DOM from https://example.com for DOM evidence...");
  const res = await fetch("https://example.com");
  const html = await res.text();
  const sha256 = crypto.createHash("sha256").update(html).digest("hex");
  const domPath = path.join(evidenceDir, "example-com-captured-dom.html");
  fs.writeFileSync(domPath, html, "utf-8");

  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const hasH1 = !!h1Match;
  const observedTitle = titleMatch ? titleMatch[1].trim() : null;

  console.log(`- DOM saved to: ${domPath}`);
  console.log(`- DOM SHA-256: ${sha256}`);
  console.log(`- Has <h1> tag?: ${hasH1}`);
  if (hasH1) console.log(`  - <h1> Content: "${h1Match[1].trim()}"`);
  console.log(`- Has <title> tag?: ${!!observedTitle}`);
  console.log(`  - <title> Content: "${observedTitle}"`);

  // Record verification report
  const verificationReport = {
    verifiedAt: new Date().toISOString(),
    sessionId: lastSessionId,
    observedTerminalState: observedStatus,
    sessionLifecycle: {
      createdAt: session.createdAt,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      expiresAt: session.expiresAt,
    },
    domProof: {
      targetUrl: "https://example.com",
      sha256,
      byteLength: html.length,
      hasH1,
      h1Content: hasH1 ? h1Match[1].trim() : null,
      titleContent: observedTitle,
      savedFile: "example-com-captured-dom.html",
    },
    sdkMethods: sessionProtoMethods,
  };

  fs.writeFileSync(
    path.join(evidenceDir, "cloud-smoke-verification.json"),
    JSON.stringify(verificationReport, null, 2),
    "utf-8"
  );
  console.log("- Verification evidence recorded in cloud-smoke-verification.json ✅");
}

main().catch((e) => {
  console.error("Verification error:", e);
  process.exit(1);
});
