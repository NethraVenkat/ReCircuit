import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FileRepository } from "./file-store.js";
import { PgRepository } from "./pg-store.js";
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { RequestRecord } from "./types.js";

describe("packages/db Repository Test Suite", () => {
  const testDataDir = path.resolve(process.cwd(), ".data/test-repo-" + Date.now());

  afterAll(() => {
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe("FileRepository", () => {
    const repo = new FileRepository(path.relative(process.cwd(), testDataDir));

    it("keeps safe-action attempts out of state-transition timelines", async () => {
      fs.appendFileSync(path.join(testDataDir, "action-log.jsonl"), JSON.stringify({ id: "attempt", requestId: "mixed-fixture", allowed: true }) + "\n");
      await repo.appendAudit({ id: randomUUID(), requestId: "mixed-fixture", previousState: "APPROVED", newState: "SUBMITTING", evidenceType: "test", evidenceReference: "fixture", observedAt: new Date().toISOString() });
      const events = await repo.getAudits({ requestId: "mixed-fixture" });
      expect(events).toHaveLength(1);
      expect(events[0]?.newState).toBe("SUBMITTING");
    });

    it("saves and retrieves a request record", async () => {
      const requestId = randomUUID();
      const mockItems = [
        {
          id: randomUUID(),
          requestId,
          description: "laptop",
          category: "ELECTRONICS" as const,
          quantity: 2,
          estimatedWeightKg: 4.4,
          confidence: 0.95,
          hazardClass: "BATTERY" as const,
          createdAt: new Date().toISOString(),
        },
      ];
      const mockRecord: RequestRecord = {
        request: {
          id: requestId,
          userId: "user-123",
          description: "2 old laptops and 1 box of batteries",
          state: "PLAN_CREATED",
          items: mockItems,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        items: mockItems,
        auditEvents: [],
        updatedAt: new Date().toISOString(),
      };

      await repo.saveRequest(mockRecord);
      const retrieved = await repo.getRequest(requestId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.request.id).toBe(requestId);
      expect(retrieved?.items).toHaveLength(1);
      expect(retrieved?.items[0]?.description).toBe("laptop");
    });

    it("enqueues, dequeues, and completes jobs in durable queue", async () => {
      const job = await repo.enqueueJob("book_leg", { legId: "leg-123", portal: "deccan" });
      expect(job.status).toBe("pending");

      const dequeued = await repo.dequeueJob("book_leg");
      expect(dequeued).not.toBeNull();
      expect(dequeued?.id).toBe(job.id);
      expect(dequeued?.status).toBe("running");

      await repo.completeJob(job.id, { bookingReference: "DEC-88888" });
      const completedList = await repo.dequeueJob("book_leg");
      // No more pending jobs
      expect(completedList).toBeNull();
    });

    it("appends and queries audit log events", async () => {
      const eventId = randomUUID();
      await repo.appendAudit({
        id: eventId,
        requestId: "req-999",
        previousState: "DRAFT",
        newState: "PLAN_CREATED",
        evidenceType: "plan",
        evidenceReference: "plan-hash-123",
        observedAt: new Date().toISOString(),
      });

      const audits = await repo.getAudits({ requestId: "req-999" });
      expect(audits.some((a) => a.id === eventId)).toBe(true);
    });
  });

  describe("PgRepository with PGlite", () => {
    let pgDb: PGlite;
    let pgRepo: PgRepository;

    beforeAll(async () => {
      pgDb = new PGlite();
      const rootDir = path.resolve(__dirname, "../../..");
      await pgDb.exec(fs.readFileSync(path.join(rootDir, "supabase/migrations/0001_init.sql"), "utf-8"));
      await pgDb.exec(fs.readFileSync(path.join(rootDir, "supabase/migrations/0002_portal.sql"), "utf-8"));
      await pgDb.exec(fs.readFileSync(path.join(rootDir, "supabase/migrations/0003_booking_fee.sql"), "utf-8"));
      pgRepo = new PgRepository(pgDb);
    });

    it("saves and retrieves requests via PostgreSQL queries", async () => {
      const reqId = randomUUID();
      const mockItems = [
        {
          id: randomUUID(),
          requestId: reqId,
          description: "Dell Monitor",
          category: "ELECTRONICS" as const,
          quantity: 1,
          estimatedWeightKg: 5.0,
          confidence: 1.0,
          hazardClass: "NON_HAZARDOUS" as const,
          createdAt: new Date().toISOString(),
        },
      ];
      const record: RequestRecord = {
        request: {
          id: reqId,
          userId: "pg-user-1",
          description: "Postgres test request",
          state: "DRAFT",
          items: mockItems,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        items: mockItems,
        auditEvents: [],
        updatedAt: new Date().toISOString(),
      };

      await pgRepo.saveRequest(record);
      const retrieved = await pgRepo.getRequest(reqId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.request.id).toBe(reqId);
      expect(retrieved?.items[0]?.description).toBe("Dell Monitor");
    });

    it("enqueues and processes jobs via transactional SQL queue", async () => {
      const job = await pgRepo.enqueueJob("verify_booking", { ref: "DEC-99999" });
      expect(job.status).toBe("pending");

      const dequeued = await pgRepo.dequeueJob("verify_booking");
      expect(dequeued).not.toBeNull();
      expect(dequeued?.id).toBe(job.id);
      expect(dequeued?.status).toBe("running");

      await pgRepo.completeJob(job.id);
      const pendingAgain = await pgRepo.dequeueJob("verify_booking");
      expect(pendingAgain).toBeNull();
    });
  });
});
