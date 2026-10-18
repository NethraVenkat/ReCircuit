import { randomUUID } from "crypto";

// Server-side in-memory captcha store attached to globalThis so all Next.js App Router routes share it
interface CaptchaSessionData {
  code: string;
  createdAt: number;
}

const globalStore = globalThis as unknown as {
  __rerouteCaptchaSessions?: Map<string, CaptchaSessionData>;
};

if (!globalStore.__rerouteCaptchaSessions) {
  globalStore.__rerouteCaptchaSessions = new Map<string, CaptchaSessionData>();
}

const captchaSessions = globalStore.__rerouteCaptchaSessions;

// Cleanup stale captchas older than 15 minutes
function cleanupOldSessions(): void {
  const now = Date.now();
  for (const [sid, data] of captchaSessions.entries()) {
    if (now - data.createdAt > 15 * 60 * 1000) {
      captchaSessions.delete(sid);
    }
  }
}

export function getStoredCaptchaCode(sessionId: string): string | undefined {
  const session = captchaSessions.get(sessionId);
  return session ? session.code : undefined;
}


/**
 * Basic character vector paths for 0-9 and A-Z so code is drawn purely with <path d="...">
 * and contains NO <text> tags in the SVG.
 */
const GLYPH_PATHS: Record<string, string> = {
  A: "M 0 30 L 12 0 L 24 30 M 4 20 L 20 20",
  B: "M 0 0 L 14 0 C 20 0 20 14 14 14 L 0 14 M 0 14 L 16 14 C 22 14 22 30 16 30 L 0 30 Z",
  C: "M 22 6 C 18 0 6 0 2 15 C 0 24 8 30 22 26",
  D: "M 0 0 L 12 0 C 24 4 24 26 12 30 L 0 30 Z",
  E: "M 20 0 L 0 0 L 0 30 L 20 30 M 0 15 L 15 15",
  F: "M 20 0 L 0 0 L 0 30 M 0 15 L 15 15",
  G: "M 22 6 C 18 0 6 0 2 15 C 0 26 10 30 20 28 L 20 16 L 10 16",
  H: "M 0 0 L 0 30 M 20 0 L 20 30 M 0 15 L 20 15",
  J: "M 16 0 L 16 22 C 16 30 4 30 0 24",
  K: "M 0 0 L 0 30 M 18 0 L 0 16 L 18 30",
  L: "M 0 0 L 0 30 L 20 30",
  M: "M 0 30 L 0 0 L 12 18 L 24 0 L 24 30",
  N: "M 0 30 L 0 0 L 20 30 L 20 0",
  P: "M 0 30 L 0 0 L 14 0 C 22 0 22 16 14 16 L 0 16",
  R: "M 0 30 L 0 0 L 14 0 C 22 0 22 15 14 15 L 0 15 M 8 15 L 20 30",
  S: "M 20 5 C 15 -2 2 0 4 10 C 6 18 20 14 20 22 C 20 30 4 32 0 25",
  T: "M 0 0 L 24 0 M 12 0 L 12 30",
  W: "M 0 0 L 6 30 L 12 12 L 18 30 L 24 0",
  X: "M 0 0 L 22 30 M 22 0 L 0 30",
  Y: "M 0 0 L 11 15 L 11 30 M 22 0 L 11 15",
  Z: "M 0 0 L 22 0 L 0 30 L 22 30",
  "2": "M 0 6 C 4 -2 18 -2 20 8 C 20 18 4 22 0 30 L 22 30",
  "3": "M 0 4 C 6 -2 18 0 18 8 C 18 14 10 14 8 14 M 8 14 C 14 14 20 16 20 24 C 20 32 6 32 0 26",
  "4": "M 16 30 L 16 0 L 0 20 L 22 20",
  "5": "M 20 0 L 0 0 L 0 12 C 4 10 16 10 18 18 C 20 26 8 32 0 26",
  "6": "M 18 4 C 10 0 2 8 0 18 C 0 28 12 32 18 26 C 22 22 20 14 12 14 C 4 14 0 20 0 20",
  "7": "M 0 0 L 22 0 L 8 30",
  "8": "M 10 14 C 2 14 0 4 10 0 C 20 0 18 14 10 14 Z M 10 14 C 0 14 0 30 10 30 C 20 30 20 14 10 14 Z",
  "9": "M 4 26 C 12 30 20 22 22 12 C 22 2 10 -2 4 4 C 0 8 2 16 10 16 C 18 16 22 10 22 10",
};

const CHAR_SET = "ABCDEFGHJKLMNPRSTWXYZ23456789"; // No ambiguous 0, O, 1, I

/**
 * Creates a new CAPTCHA session and returns its ID.
 */
export function createCaptchaSession(): { sessionId: string; code: string } {
  cleanupOldSessions();
  const sessionId = randomUUID();
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += CHAR_SET.charAt(Math.floor(Math.random() * CHAR_SET.length));
  }
  captchaSessions.set(sessionId, { code, createdAt: Date.now() });
  return { sessionId, code };
}

/**
 * Validates the user's submitted CAPTCHA code against the session ID.
 */
export function verifyCaptchaCode(sessionId: string, code: string): boolean {
  if (!sessionId || !code) return false;
  const session = captchaSessions.get(sessionId);
  if (!session) return false;

  const isValid = session.code.toUpperCase() === code.trim().toUpperCase();
  if (isValid) {
    captchaSessions.delete(sessionId); // One-time use
  }
  return isValid;
}

/**
 * Renders a distorted SVG image of the code without using any <text> tags.
 * The code is drawn purely as vector paths with noise lines and background distortion.
 */
export function renderCaptchaSvg(code: string): string {
  const width = 220;
  const height = 70;
  const chars = code.split("");

  let paths = "";
  chars.forEach((ch, idx) => {
    const glyph = GLYPH_PATHS[ch] || GLYPH_PATHS["X"]!;
    const xOffset = 25 + idx * 36;
    const yOffset = 18 + (Math.random() * 8 - 4);
    const rotation = Math.random() * 20 - 10;
    const strokeColor = ["#b45309", "#78350f", "#92400e", "#a16207"][idx % 4];

    paths += `
      <g transform="translate(${xOffset}, ${yOffset}) rotate(${rotation} 11 15)">
        <path d="${glyph}" fill="none" stroke="${strokeColor}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
      </g>
    `;
  });

  // Noise lines
  let noiseLines = "";
  for (let i = 0; i < 6; i++) {
    const x1 = Math.random() * width;
    const y1 = Math.random() * height;
    const x2 = Math.random() * width;
    const y2 = Math.random() * height;
    noiseLines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ca8a04" stroke-width="1.2" opacity="0.4" />`;
  }

  // Noise dots
  let noiseDots = "";
  for (let i = 0; i < 35; i++) {
    const cx = Math.random() * width;
    const cy = Math.random() * height;
    const r = Math.random() * 2;
    noiseDots += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#854d0e" opacity="0.3" />`;
  }

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#fef3c7" rx="6" />
  ${noiseDots}
  ${noiseLines}
  ${paths}
</svg>`.trim();
}

