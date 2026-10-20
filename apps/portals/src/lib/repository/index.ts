import type { BookingRepository } from "../types";
import { FileRepository } from "./file-repository";
import { SupabaseRepository } from "./supabase-repository";
import { assertPortalConfiguration } from "../runtime-config";

let repositoryInstance: BookingRepository | null = null;

export function getRepository(): BookingRepository {
  assertPortalConfiguration();
  if (repositoryInstance) {
    return repositoryInstance;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceRoleKey) {
    repositoryInstance = new SupabaseRepository(supabaseUrl, serviceRoleKey);
  } else {
    repositoryInstance = new FileRepository();
  }

  return repositoryInstance;
}

export function setRepositoryInstance(repo: BookingRepository | null): void {
  repositoryInstance = repo;
}

export function getStorageType(): "supabase" | "file" {
  assertPortalConfiguration();
  return process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "file";
}

