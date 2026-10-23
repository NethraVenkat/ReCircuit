import { NextResponse } from "next/server";
import { signEvidence, getRepository } from "@recircuit/db";
import { owned, failure } from "../../../lib/household";

function containsEvidence(value: unknown, reference: string): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(v => containsEvidence(v, reference));
  return Object.entries(value).some(([key, entry]) =>
    (["screenshotRef", "screenshotPath", "proof"].includes(key) && entry === reference) ||
    containsEvidence(entry, reference));
}

export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const record = await owned(params.get("requestId") || "");
    const reference = params.get("reference") || "";
    // Only server-authored evidence fields may authorize access. Searching all
    // record strings would let a user put someone else's reference in their
    // description and turn this endpoint into a signing oracle.
    if (!reference.startsWith("storage://recircuit-evidence/")) throw new Error("NOT_FOUND");
    const actions = getRepository().getActionRecords ? await getRepository().getActionRecords!(record.request.id) : [];
    if (!containsEvidence([record.household?.policySources, record.plan?.legs, record.auditEvents, actions], reference)) throw new Error("NOT_FOUND");
    return NextResponse.json({ url: await signEvidence(reference), expiresIn: 60 }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) { const f = failure(err); return NextResponse.json(f.body, { status: f.status }); }
}
