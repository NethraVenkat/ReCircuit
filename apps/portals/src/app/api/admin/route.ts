import { NextResponse } from "next/server";
import { resolveRecyclerId } from "@/lib/config";
import { getRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";

import { timingSafeEqual } from "crypto";

function safeTokenMatch(provided: string, expected: string): boolean {
  const bufA = Buffer.from(provided);
  const bufB = Buffer.from(expected);
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

function checkAuth(request: Request): { status: 200; setCookieToken?: string } | { status: 503 | 401; response: NextResponse } {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken || !adminToken.trim()) {
    return {
      status: 503,
      response: new NextResponse("Admin disabled", { status: 503, headers: { "Content-Type": "text/plain" } }),
    };
  }

  const cookieHeader = request.headers.get("cookie") || "";
  const cookieMatch = cookieHeader.match(/admin_token=([^;]+)/);
  const cookieToken = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;

  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token");
  const headerToken = request.headers.get("x-admin-token");

  const candidate = cookieToken || queryToken || headerToken;
  if (!candidate || !safeTokenMatch(candidate, adminToken)) {
    return {
      status: 401,
      response: NextResponse.json({ ok: false, error: "Unauthorized: Invalid or missing admin token" }, { status: 401 }),
    };
  }

  return { status: 200, setCookieToken: queryToken ? adminToken : undefined };
}

export async function GET(request: Request): Promise<NextResponse> {
  const auth = checkAuth(request);
  if (auth.status !== 200) {
    return auth.response;
  }

  const host = request.headers.get("host");
  const recyclerId = resolveRecyclerId(host);
  const repo = getRepository();

  const [bookings, switches] = await Promise.all([
    repo.listBookings(recyclerId),
    repo.getFailureSwitches(recyclerId),
  ]);

  const response = NextResponse.json({
    ok: true,
    recyclerId,
    bookings,
    switches,
  });

  if (auth.setCookieToken) {
    response.headers.set(
      "Set-Cookie",
      `admin_token=${encodeURIComponent(auth.setCookieToken)}; Path=/; HttpOnly; SameSite=Lax`
    );
  }

  return response;
}

export async function POST(request: Request): Promise<NextResponse> {
  const auth = checkAuth(request);
  if (auth.status !== 200) {
    return auth.response;
  }

  const host = request.headers.get("host");
  const recyclerId = resolveRecyclerId(host);
  const repo = getRepository();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const action = String(body.action || "");

  if (action === "toggle_switch") {
    const rawSwitchName = String(body.switchName);
    const switchMap: Record<string, string> = {
      raise_fee: "raiseFee",
      fail_next_submit: "failNextSubmit",
      omit_next_reference: "omitNextReference",
      changed_policy_layout: "changedPolicyLayout",
      hide_review_fee: "hideReviewFee",
      hide_fee_info: "hideFeeInfo",
    };
    const switchName = switchMap[rawSwitchName] || rawSwitchName;
    const value = Boolean(body.value);
    const updated = await repo.updateFailureSwitches(recyclerId, { [switchName]: value });
    return NextResponse.json({ ok: true, switches: updated });
  }

  const reference = String(body.reference || "");
  if (!reference) {
    return NextResponse.json({ ok: false, error: "Booking reference is required" }, { status: 400 });
  }

  if (action === "confirm") {
    const updated = await repo.updateBookingStatus(
      recyclerId,
      reference,
      "CONFIRMED",
      "Booking request confirmed by dispatcher (SIMULATED DOWNSTREAM EVENT)",
      { isSimulated: true }
    );
    return NextResponse.json({ ok: Boolean(updated), booking: updated });
  }

  if (action === "schedule") {
    const slot = String(body.slot || "Tomorrow 10:00–12:00 IST");
    const updated = await repo.updateBookingStatus(
      recyclerId,
      reference,
      "SCHEDULED",
      `Pickup scheduled for slot: ${slot} (SIMULATED DOWNSTREAM EVENT)`,
      { slot, isSimulated: true }
    );
    return NextResponse.json({ ok: Boolean(updated), booking: updated });
  }

  if (action === "picked_up") {
    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const updated = await repo.updateBookingStatus(
      recyclerId,
      reference,
      "PICKED_UP",
      `Items collected from household. OTP verified: ${otp} (SIMULATED DOWNSTREAM EVENT)`,
      { pickupOtp: otp, isSimulated: true }
    );
    return NextResponse.json({ ok: Boolean(updated), booking: updated, pickupOtp: otp });
  }

  if (action === "weighed") {
    const weightKg = Number(body.weightKg) || 5.0;
    const updated = await repo.updateBookingStatus(
      recyclerId,
      reference,
      "WEIGHED",
      `Weight ticket verified at collection depot: ${weightKg} kg (SIMULATED DOWNSTREAM EVENT)`,
      { weightKg, isSimulated: true }
    );
    return NextResponse.json({ ok: Boolean(updated), booking: updated });
  }

  return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
}

