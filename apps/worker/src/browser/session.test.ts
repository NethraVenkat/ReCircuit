import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ connect: vi.fn(), launch: vi.fn(), guard: vi.fn() }));
vi.mock("playwright", () => ({ chromium: { connectOverCDP: mock.connect, launch: mock.launch } }));
vi.mock("./api-guard.js", () => ({ guardPortalApi: mock.guard }));
vi.mock("@recircuit/db", () => ({ cloudConfigured: (): boolean => true, storeEvidence: vi.fn() }));
import { openSession } from "./session.js";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("BROWSER_MODE", "browserbase");
  vi.stubEnv("BROWSERBASE_API_KEY", "test-only"); vi.stubEnv("BROWSERBASE_PROJECT_ID", "test-project");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("rejects local execution and missing cloud credentials before launching", async () => {
  await expect(openSession({ mode: "local" })).rejects.toThrow("local browsers are disabled");
  vi.stubEnv("BROWSERBASE_API_KEY", "");
  await expect(openSession()).rejects.toThrow("BROWSERBASE_API_KEY");
  expect(mock.launch).not.toHaveBeenCalled(); expect(mock.connect).not.toHaveBeenCalled();
});
it("creates a real session with automated CAPTCHA solving disabled, then releases it once", async () => {
  const close = vi.fn(); const page = { close }; const context = { pages: (): typeof page[] => [page], close };
  mock.connect.mockResolvedValue({ contexts: () => [context], close });
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ id: "real-session", connectUrl: "wss://example.test" }))).mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetchMock);
  const session = await openSession({ keepAlive: true });
  expect(session.sessionId).toBe("real-session");
  const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string) as unknown;
  expect(body).toMatchObject({ keepAlive: true, timeout: 900, browserSettings: { solveCaptchas: false, recordSession: false, logSession: false } });
  await session.close(); await session.close();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect((JSON.parse(fetchMock.mock.calls[1]![1]!.body as string) as { status: string }).status).toBe("REQUEST_RELEASE");
});
it("reconnects to the saved page; disconnect preserves it for another process", async () => {
  const close = vi.fn(); const contextClose = vi.fn(); const page = { marker: "saved-page" };
  mock.connect.mockResolvedValue({ contexts: () => [{ pages: (): typeof page[] => [page], close: contextClose }], close });
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: "saved-session", connectUrl: "wss://example.test" })));
  vi.stubGlobal("fetch", fetchMock);
  const session = await openSession({ resumeSessionId: "saved-session" });
  expect(session.page).toBe(page); expect(fetchMock.mock.calls[0]![1]!.method).toBe("GET");
  await session.disconnect!();
  expect(close).toHaveBeenCalledOnce(); expect(contextClose).not.toHaveBeenCalled(); expect(fetchMock).toHaveBeenCalledOnce();
});
it("sanitizes session API failures and never starts a local browser", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("secret-url-with-token")));
  await expect(openSession()).rejects.toThrow("Check server-side credentials");
  expect(mock.launch).not.toHaveBeenCalled();
});
