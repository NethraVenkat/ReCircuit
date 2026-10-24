import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeRouting, requestMapConfiguration } from "../../../lib/geospatial/authorization.server";
import { routingService } from "../../../lib/geospatial/runtime.server";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "Vary": "x-admin-token" };
function failure(error: unknown) {
  const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "ROUTING_INVALID_REQUEST_OR_SERVICE_FAILURE";
  const status = code === "ROUTING_UNAUTHORIZED" ? 401 : code.includes("ORIGIN") ? 403 : code.includes("DISABLED") || code.includes("CONFIGURATION") || code.includes("PREVIEW_ONLY") ? 503 : code.includes("NOT_FOUND") ? 404 : code.includes("CHANGED") || code.includes("CONFLICT") || code.includes("BUSY") ? 409 : 400;
  return NextResponse.json({ error: code, planningOnly: true }, { status, headers });
}
export async function GET(request: Request) {
  try {
    const { tenant } = authorizeRouting(request), url = new URL(request.url), service = routingService();
    const id = url.searchParams.get("id");
    if (id) return NextResponse.json(await service.read(tenant, id), { headers });
    if (url.searchParams.get("view") === "proposals") return NextResponse.json({ proposals: await service.catalog(tenant), planningOnly: true }, { headers });
    const date = url.searchParams.get("date"); if (!date) throw Error("SERVICE_DATE_REQUIRED");
    return NextResponse.json({ ...(await service.preview(tenant, date)), history: await service.history(tenant), map: requestMapConfiguration(request), planningOnly: true }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const { tenant, reviewer } = authorizeRouting(request);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw Error("JSON_REQUIRED");
    if (Number(request.headers.get("content-length")) > 65536) throw Error("PAYLOAD_LIMIT");
    const reader = request.body?.getReader(); if (!reader) throw Error("JSON_REQUIRED");
    const decoder = new TextDecoder(); let text = "", size = 0;
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) { size += chunk.value.length; if (size > 65536) { await reader.cancel(); throw Error("PAYLOAD_LIMIT"); } text += decoder.decode(chunk.value, { stream: true }); }
    text += decoder.decode();
    const envelope = z.object({ action: z.enum(["review", "geocode", "vehicles", "generate"]), payload: z.unknown() }).strict().parse(JSON.parse(text)), service = routingService();
    const result = envelope.action === "review" ? await service.review(tenant, envelope.payload, reviewer) : envelope.action === "geocode" ? await service.geocode(tenant, envelope.payload) : envelope.action === "vehicles" ? await service.vehicles(tenant, envelope.payload) : await (async () => { const body = z.object({ serviceDate: z.string(), requestKey: z.string().uuid() }).strict().parse(envelope.payload); return service.generate(tenant, body.serviceDate, body.requestKey); })();
    return NextResponse.json(result, { headers });
  } catch (error) { return failure(error); }
}
