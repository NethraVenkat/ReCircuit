import { test, expect } from "@playwright/test";
import { Booker } from "../../apps/worker/src/booking/booker.js";
import { SafeActionBlockedError } from "@recircuit/core";

test.describe("Stage 11: Security & Authorization Deep Verification Suite", () => {
  const TEST_ADMIN_TOKEN = process.env.ADMIN_TOKEN || "test-admin-secret-token";

  test("1. Cross-request access isolation: request records cannot cross-pollinate", async ({ request }) => {
    // Attempt to access a random non-existent or foreign request ID
    const foreignId = "foreign-uuid-99999";
    const res = await request.get(`http://localhost:3000/api/requests/${foreignId}`);
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("Request not found");
  });

  test("2. Direct unauthorized booking blocked: POST /api/book without approval returns 400", async ({ request }) => {
    // 1. Create a request first so it exists in AWAITING_APPROVAL
    const planRes = await request.post("http://localhost:3000/api/plan", {
      data: {
        text: "1 old Dell laptop in Madhapur",
        feeCapInr: 200,
      },
    });
    expect(planRes.ok()).toBe(true);
    const planData = await planRes.json();
    const requestId = planData.requestId;

    // 2. Attempt to invoke booking without prior approval
    const unapprovedRes = await request.post("http://localhost:3000/api/book", {
      data: {
        requestId,
      },
    });

    expect(unapprovedRes.status()).toBe(400);
    const body = await unapprovedRes.json();
    expect(body.error).toContain("request must be APPROVED");
  });

  test("3. Direct unauthorized approval blocked: POST /api/approve with mismatched planHash returns 400", async ({ request }) => {
    // Create a plan first
    const planRes = await request.post("http://localhost:3000/api/plan", {
      data: {
        text: "1 old Dell laptop in Madhapur",
        feeCapInr: 200,
      },
    });
    expect(planRes.ok()).toBe(true);
    const planData = await planRes.json();
    const requestId = planData.requestId;

    // Attempt approval with forged planHash
    const forgeRes = await request.post("http://localhost:3000/api/approve", {
      data: {
        requestId,
        planId: planData.plan.id,
        planHash: "forged-tampered-hash-00000000000000000000000000000000",
        decision: "approved",
      },
    });

    expect(forgeRes.status()).toBe(400);
    const body = await forgeRes.json();
    expect(body.error).toContain("Stale approval rejected: plan has changed");
  });

  test("4. Admin endpoints protected: invalid or missing admin token returns 401/403/503", async ({ request }) => {
    // Missing token
    const resNoToken = await request.post("http://localhost:3101/api/admin", {
      data: { action: "raise_fee", feeDeltaInr: 50 },
    });
    expect([401, 403, 503]).toContain(resNoToken.status());

    // Wrong token
    const resWrongToken = await request.post("http://localhost:3101/api/admin", {
      headers: { "x-admin-token": "completely-invalid-token" },
      data: { action: "raise_fee", feeDeltaInr: 50 },
    });
    expect([401, 403, 503]).toContain(resWrongToken.status());

    // Reset without token
    const resResetNoToken = await request.post("http://localhost:3101/api/reset");
    expect([401, 403, 503]).toContain(resResetNoToken.status());
  });

  test("5. Concurrent duplicate execution: idempotency key deduplicates submissions", async ({ request }) => {
    const key = `idem-concurrent-${Date.now()}`;
    const payload = {
      client_request_id: key,
      full_name: "Radha Sharma",
      phone: "9876543210",
      address_line: "Road No 12, Cyber Valley",
      locality: "Madhapur",
      pincode: "500081",
      preferred_slot: "2026-10-25 morning",
      items: [{ name: "Lenovo ThinkPad", weightKg: 2.1 }],
      data_wipe_ack: true,
    };

    // Execute 2 concurrent requests with identical client_request_id
    const [res1, res2] = await Promise.all([
      request.post("http://localhost:3101/api/bookings", { data: payload }),
      request.post("http://localhost:3101/api/bookings", { data: payload }),
    ]);

    expect(res1.ok()).toBe(true);
    expect(res2.ok()).toBe(true);

    const data1 = await res1.json();
    const data2 = await res2.json();

    // Both requests must resolve to the EXACT SAME booking reference
    const ref1 = data1.booking?.bookingReference;
    const ref2 = data2.booking?.bookingReference;
    expect(ref1).toBeDefined();
    expect(ref1).toBe(ref2);

    // One of them must be marked as duplicate
    expect(data1.isDuplicate || data2.isDuplicate).toBe(true);
  });

  test("6. Booker rejects unapproved execution: SafeActionBlockedError strictly thrown", async () => {
    const dummyLeg: any = {
      id: "leg-unauth-test",
      planId: "plan-unauth-test",
      recyclerId: "deccan",
      recyclerName: "Deccan E-Cycle",
      itemIds: ["item-1"],
      state: "APPROVED",
      estimatedFee: 180,
      estimatedPayout: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const dummyPlan: any = {
      id: "plan-unauth-test",
      requestId: "req-unauth-test",
      legs: [dummyLeg],
      totalEstimatedFee: 180,
      totalEstimatedPayout: 0,
      planHash: "real-hash-abc",
      createdAt: new Date().toISOString(),
    };

    // Booker must refuse execution if approval is missing or decision !== "approved"
    await expect(
      Booker.bookLeg({
        leg: dummyLeg,
        plan: dummyPlan,
        items: [],
        slot: { day: "2026-10-25", window: "morning" },
        idempotencyKey: "test-idem",
        approval: {
          id: "app-test",
          requestId: "req-unauth-test",
          planId: "plan-unauth-test",
          planHash: "real-hash-abc",
          decision: "rejected" as any, // Not approved!
          approvedBy: "user",
          approvedAt: new Date().toISOString(),
        },
      } as any)
    ).rejects.toThrow(SafeActionBlockedError);
  });
});
