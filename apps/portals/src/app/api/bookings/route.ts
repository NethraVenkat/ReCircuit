import { NextResponse } from "next/server";
import { resolveRecyclerId } from "@/lib/config";
import { getRepository } from "@/lib/repository";
import { validateBookingSubmission, type BookingSubmissionPayload } from "@/lib/validation";
import { verifyCaptchaToken } from "@/lib/captcha";
import { assertPortalConfiguration } from "@/lib/runtime-config";
import { pickupFee } from "@/lib/fees";


export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const ref = url.searchParams.get("ref");
  const client = url.searchParams.get("client") || url.searchParams.get("client_id");

  if ((!ref || !ref.trim()) && (!client || !client.trim())) {
    return NextResponse.json({ ok: false, error: "Missing ref or client parameter" }, { status: 400 });
  }

  const host = request.headers.get("host");
  const recyclerId = resolveRecyclerId(host);
  const repo = getRepository();

  let booking = null;
  if (ref && ref.trim()) {
    booking = await repo.getBookingByReference(recyclerId, ref.trim());
  } else if (client && client.trim()) {
    booking = await repo.getBookingByClientRequestId(recyclerId, client.trim());
  }

  if (!booking) {
    return NextResponse.json({ ok: false, error: "No booking found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, booking });
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertPortalConfiguration();
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Portal configuration error" }, { status: 503 });
  }
  const host = request.headers.get("host");
  const recyclerId = resolveRecyclerId(host);
  const repo = getRepository();

  // 1. Check failure switch: "fail next submit with HTTP 500"
  const failSubmit = await repo.consumeFailureSwitch(recyclerId, "failNextSubmit");
  if (failSubmit) {
    return new NextResponse("Internal Server Error: Simulated upstream portal outage (Failure Switch Active)", {
      status: 500,
    });
  }

  let body: BookingSubmissionPayload;
  try {
    body = (await request.json()) as BookingSubmissionPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON request payload" }, { status: 400 });
  }

  // 2. Validate CAPTCHA if PaperPlus with stateless token & nonce replay check
  let activeCaptchaCode: string | undefined;
  const captchaSid = request.headers.get("x-captcha-session") || (body as { captcha_session_id?: string }).captcha_session_id;
  if (recyclerId === "paperplus") {
    if (captchaSid && body.human_verification_code) {
      const isOk = await verifyCaptchaToken(captchaSid, body.human_verification_code, repo);
      if (isOk) {
        activeCaptchaCode = body.human_verification_code;
      }
    }
  }

  // 3. Server-side validation
  const validation = validateBookingSubmission(recyclerId, body, activeCaptchaCode);
  if (!validation.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "Validation failed",
        errors: validation.errors,
      },
      { status: 400 }
    );
  }

  // 4. Create booking via repository (handles duplicate client_request_id and omitNextReference)
  const switches = await repo.getFailureSwitches(recyclerId);
  if (body.items.some((item) => typeof item.weightKg !== "number" || !Number.isFinite(item.weightKg))) {
    return NextResponse.json({ ok: false, error: "Item weights are required" }, { status: 400 });
  }
  const result = await repo.createBooking({
    chargedFeeInr: pickupFee(recyclerId, body.items.reduce((sum, item) => sum + item.weightKg!, 0), switches.raiseFee),
    recyclerId,
    clientRequestId: body.client_request_id.trim(),
    fullName: body.full_name.trim(),
    phone: body.phone.trim(),
    addressLine: body.address_line.trim(),
    locality: body.locality.trim(),
    pincode: body.pincode.trim(),
    preferredSlot: body.preferred_slot.trim(),
    items: body.items,
    dataWipeAcknowledged: Boolean(body.data_wipe_ack),
  });

  return NextResponse.json({
    ok: true,
    booking: result.booking,
    isDuplicate: result.isDuplicate,
    omitReference: result.omitReference ?? false,
    message: result.isDuplicate
      ? "This request was already received. Returning existing booking details."
      : "Booking created successfully.",
  });
}

