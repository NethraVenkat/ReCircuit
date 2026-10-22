import { NextResponse } from "next/server";
import { parseIntake } from "@recircuit/core";
import { z } from "zod";
import { sameOrigin, failure } from "../../../lib/household";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { text } = z.object({ text: z.string().trim().min(1).max(10000) }).parse(await req.json());
    return NextResponse.json(await parseIntake(text));
  } catch (err) { const f = failure(err); return NextResponse.json(f.body, { status: f.status }); }
}
