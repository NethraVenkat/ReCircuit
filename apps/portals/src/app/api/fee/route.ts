import { NextResponse } from "next/server";
import { resolveRecyclerId } from "@/lib/config";
import { pickupFee } from "@/lib/fees";
import { getRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const host = request.headers.get("host");
  const recyclerId = resolveRecyclerId(host);
  const repo = getRepository();
  const switches = await repo.getFailureSwitches(recyclerId);

  const url = new URL(request.url);
  const weightStr = url.searchParams.get("weight");
  const weightKg = weightStr === null || weightStr.trim() === "" ? NaN : Number(weightStr);
  if (!Number.isFinite(weightKg) || weightKg < 0) {
    return NextResponse.json({ ok: false, error: "A valid weight is required" }, { status: 400 });
  }
  const fee = pickupFee(recyclerId, weightKg, switches.raiseFee);

  if (switches.hideReviewFee || switches.hideFeeInfo) {
    return NextResponse.json({ ok: true, recyclerId, fee: null, hideReviewFee: true });
  }


  return NextResponse.json({ ok: true, recyclerId, fee, raiseFee: Boolean(switches.raiseFee) });
}

