import { NextResponse } from "next/server";
import { resolveRecyclerId } from "@/lib/config";
import { getRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const host = request.headers.get("host");
  const recyclerId = resolveRecyclerId(host);
  const repo = getRepository();
  const switches = await repo.getFailureSwitches(recyclerId);

  const url = new URL(request.url);
  const weightStr = url.searchParams.get("weight");
  const weightKg = weightStr ? parseFloat(weightStr) : 0;

  let fee = 0;
  if (recyclerId === "deccan") {
    // Under 5 kg: ₹180 standard pickup charge; 5 kg or more: ₹0 (free pickup)
    fee = weightKg < 5 ? 180 : 0;
  } else if (recyclerId === "paperplus") {
    // PaperPlus doorstep scrap collection is ₹0 pickup fee
    fee = 0;
  } else if (recyclerId === "quickscrap") {
    // Flat convenience fee: ₹50
    fee = 50;
  }

  if (switches.hideReviewFee || switches.hideFeeInfo) {
    return NextResponse.json({ ok: true, recyclerId, fee: null, hideReviewFee: true });
  }

  if (switches.raiseFee) {
    fee += 40;
  }

  return NextResponse.json({ ok: true, recyclerId, fee, raiseFee: Boolean(switches.raiseFee) });
}

