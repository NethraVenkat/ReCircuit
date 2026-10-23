/** Validate deployment configuration before serving health or accepting bookings. */
export function assertPortalConfiguration(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.RECIRCUIT_PERSISTENCE === "local") throw new Error("PERSISTENCE_UNAVAILABLE: LOCAL_MODE_DISABLED_IN_PRODUCTION");
  const required = [
    "RECYCLER_ID",
    "CAPTCHA_SECRET",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ] as const;
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    throw new Error(`Portal configuration error: missing ${missing.join(", ")}. Bookings are unavailable.`);
  }
}
