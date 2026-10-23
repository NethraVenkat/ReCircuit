/**
 * packages/db/src/index.ts
 *
 * ReCircuit Storage & Repository layer:
 * - FileRepository: Local filesystem persistence (.data/requests, .data/jobs, .data/action-log.jsonl).
 * - SupabaseHouseholdRepository: server-only durable cloud records, jobs and actions.
 * - PgRepository: embedded PGlite support for local tests.
 */

import { FileRepository } from "./file-store.js";
import { PgRepository } from "./pg-store.js";
import type { IRepository } from "./types.js";
import { SupabaseHouseholdRepository, cloudConfigured, PersistenceError } from "./cloud.js";

let defaultRepository: IRepository | null = null;

export function getRepository(): IRepository {
  if (!defaultRepository) {
    // Production always requires Supabase. Local stores are development/test only.
    if (cloudConfigured()) defaultRepository = new SupabaseHouseholdRepository();
    else if (process.env.NODE_ENV === "production") throw new PersistenceError("CONFIGURATION_MISSING");
    else defaultRepository = new FileRepository(process.env.RECIRCUIT_DATA_DIR || ".data");
  }
  return defaultRepository;
}

export function setRepository(repo: IRepository): void {
  defaultRepository = repo;
}

export { FileRepository, PgRepository };
export * from "./cloud.js";
export type * from "./types.js";
