import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as health } from "../app/api/health/route";
import { POST as book } from "../app/api/bookings/route";
import { getRepository, setRepositoryInstance } from "../lib/repository";
import { createCaptchaSession } from "../lib/captcha";

afterEach(() => {
  vi.unstubAllEnvs();
  setRepositoryInstance(null);
});

describe("production configuration", () => {
  it.each(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CAPTCHA_SECRET", "RECYCLER_ID"])(
    "refuses health and bookings when %s is missing",
    async (missing) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("RECYCLER_ID", "deccan");
      vi.stubEnv("SUPABASE_URL", "https://example.invalid");
      vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only");
      vi.stubEnv("CAPTCHA_SECRET", "test-only");
      vi.stubEnv(missing, "");
      expect(() => getRepository()).toThrow(missing);
      const request = new Request("http://localhost/api/health");
      const response = await health(request);
      expect(response.status).toBe(503);
      expect((await response.json()).error).toContain(missing);
      const booking = await book(new Request("http://localhost/api/bookings", { method: "POST" }));
      expect(booking.status).toBe(503);
      expect((await booking.json()).error).toContain(missing);
    }
  );

  it("has no development CAPTCHA signing fallback", () => {
    vi.stubEnv("CAPTCHA_SECRET", "");
    expect(() => createCaptchaSession()).toThrow("CAPTCHA_SECRET");
  });
});
