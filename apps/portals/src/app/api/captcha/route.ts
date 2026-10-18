import { NextResponse } from "next/server";
import { createCaptchaSession, renderCaptchaSvg, getStoredCaptchaCode } from "@/lib/captcha";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const sid = url.searchParams.get("sid");

  // If sid is requested, return the raw SVG image
  if (sid) {
    let code = getStoredCaptchaCode(sid);
    if (!code) {
      const created = createCaptchaSession();
      code = created.code;
    }

    const svg = renderCaptchaSvg(code);
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }

  // Create new session and return sessionId (no code in response JSON)
  const session = createCaptchaSession();

  return NextResponse.json({
    ok: true,
    sessionId: session.sessionId,
  });
}


