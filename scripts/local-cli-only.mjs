// These legacy CLI demos manipulate local archives and must never act as a
// production persistence path. Household production operations use the API.
if (process.env.NODE_ENV === "production" || process.env.SUPABASE_URL || process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Legacy CLI is local-only. Use the household API for cloud-backed operations.");
}
