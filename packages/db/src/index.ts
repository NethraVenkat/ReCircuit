/**
 * packages/db/src/index.ts
 *
 * ReCircuit Storage & Repository layer:
 * - FileRepository: Local filesystem persistence (.data/requests, .data/jobs, .data/action-log.jsonl).
 * - PgRepository: PostgreSQL / PGlite persistence for relational queries and durable transactional jobs.
 */

import { FileRepository } from "./file-store.js";
import { PgRepository } from "./pg-store.js";
import type { IRepository } from "./types.js";

let defaultRepository: IRepository | null = null;

export function getRepository(): IRepository {
  if (!defaultRepository) {
    // If DATABASE_URL is explicitly set and not file-based, we can use PgRepository,
    // otherwise fallback to FileRepository for local offline development and file-based scripts.
    defaultRepository = new FileRepository(process.env.RECIRCUIT_DATA_DIR || ".data");
  }
  return defaultRepository;
}

export function setRepository(repo: IRepository): void {
  defaultRepository = repo;
}

export { FileRepository, PgRepository };
export type * from "./types.js";
