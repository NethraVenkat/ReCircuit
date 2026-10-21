import { NextResponse } from "next/server";
import { BookingRunner } from "@recircuit/worker";
import { getRepository } from "@recircuit/db";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      requestId?: string;
      customer?: {
        fullName?: string;
        phone?: string;
        addressLine?: string;
        locality?: string;
        pincode?: string;
      };
    };

    if (!body.requestId) {
      return NextResponse.json({ error: "requestId is required" }, { status: 400 });
    }

    const repo = getRepository();
    const stored = await repo.getRequest(body.requestId);
    if (!stored || !stored.plan) {
      return NextResponse.json({ error: "Request or plan not found" }, { status: 404 });
    }

    if (stored.request.state !== "APPROVED") {
      return NextResponse.json(
        { error: `Cannot book plan: request must be APPROVED (current state: ${stored.request.state})` },
        { status: 400 }
      );
    }

    const customer = {
      fullName: body.customer?.fullName || "Ananya Sharma",
      phone: body.customer?.phone || "9876543210",
      addressLine: body.customer?.addressLine || "Flat 402, Green Meadows",
      locality: body.customer?.locality || "Madhapur",
      pincode: body.customer?.pincode || "500081",
    };

    const legResults = [];
    for (const leg of stored.plan.legs) {
      if (leg.state === "APPROVED") {
        const legContext = {
          leg,
          plan: stored.plan,
          request: stored.request,
          approval: stored.approval || undefined,
          customer,
          items: leg.items || stored.items.map((it) => ({
            id: it.id,
            name: it.description,
            quantity: it.quantity,
            estimatedWeightKg: it.estimatedWeightKg,
          })),
          dataWipeAck: true,
        };

        const legRes = await BookingRunner.bookLegWithTransitions(legContext as any, {
          headless: true,
        });
        Object.assign(leg, legRes.updatedLeg);
        legResults.push(legRes);
      }
    }

    await repo.saveRequest({
      ...stored,
      plan: stored.plan,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      plan: stored.plan,
      legResults,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
