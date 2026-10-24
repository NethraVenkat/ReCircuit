import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { getRepository } from "@recircuit/db";
import { assertSameOrigin } from "./request-origin";

export const customerSchema = z.object({
  fullName: z.string().trim().min(1).max(100),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian phone number"),
  addressLine: z.string().trim().min(3).max(300),
  locality: z.string().trim().min(1).max(100),
  pincode: z.string().regex(/^\d{6}$/),
});
export async function owner(create = false): Promise<string | null> {
  const jar = await cookies();
  let token = jar.get("rc-household")?.value;
  if (!token && create) {
    token = randomBytes(32).toString("hex");
    jar.set("rc-household", token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 90 });
  }
  return token ? createHash("sha256").update(token).digest("hex") : null;
}
export async function owned(id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new Error("NOT_FOUND");
  const userId = await owner();
  if (!userId) throw new Error("NOT_FOUND");
  const record = await getRepository().getRequest(id, userId);
  const currentOwner = await owner();
  if (!record || !currentOwner || record.request.userId !== currentOwner) throw new Error("NOT_FOUND");
  return record;
}
export function sameOrigin(req: Request): void {
  assertSameOrigin(req);
}
export async function locked<T>(id: string, run: () => Promise<T>): Promise<T> {
  if (!z.string().uuid().safeParse(id).success) throw new Error("NOT_FOUND");
  const repo = getRepository();
  if (repo.withRequestLock) return repo.withRequestLock(id, run);
  const dir = path.resolve(process.env.RECIRCUIT_DATA_DIR || ".data", "household-locks");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${id}.lock`);
  let handle;
  try { handle = await fs.open(file, "wx"); } catch { throw new Error("BUSY: A request action is already running. Refresh to recover its persisted state. If a process stopped, reconcile before retrying."); }
  try { return await run(); } finally { await handle.close(); await fs.unlink(file); }
}
export function failure(err: unknown) {
  const message = err instanceof Error ? err.message : "Request failed";
  return { body: { error: message === "NOT_FOUND" ? "Request not found" : /[A-Z]:\\|file:\/\//i.test(message) ? "Local browser integration is unavailable. Check the local service configuration." : message }, status: message.startsWith("PERSISTENCE_UNAVAILABLE") ? 503 : message === "NOT_FOUND" ? 404 : message.startsWith("BUSY") || message.startsWith("STALE") ? 409 : 400 };
}
