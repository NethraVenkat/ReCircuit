import { NextResponse } from "next/server";
import { resolveRecyclerId } from "@/lib/config";
import { getRepository } from "@/lib/repository";
import { validateBookingSubmission, type BookingSubmissionPayload } from "@/lib/validation";
import { getStoredCaptchaCode } from "@/lib/captcha";


export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const ref = url.searchParams.get("ref");
  if (!ref || !ref.trim()) {
    return NextResponse.json({ ok: false, error: "Missing ref parameter" }, { status: 400 });
  }

  const host = request.headers.get("host");
  const recyclerId = resolveRecyclerId(host);
  const repo = getRepository();

  const booking = await repo.getBookingByReference(recyclerId, ref.trim());
  if (!booking) {
    return NextResponse.json({ ok: false, error: "Booking not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, booking });
}

export async function POST(request: Request): Promise<NextResponse> {
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

  // 2. Validate CAPTCHA if PaperPlus
  let activeCaptchaCode: string | undefined;
  const captchaSid = request.headers.get("x-captcha-session") || (body as { captcha_session_id?: string }).captcha_session_id;
  if (recyclerId === "paperplus" && captchaSid) {
    activeCaptchaCode = getStoredCaptchaCode(captchaSid);
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
  const result = await repo.createBooking({
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

