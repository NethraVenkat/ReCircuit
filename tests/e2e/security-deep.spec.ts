import { test, expect } from "@playwright/test";
import { Booker } from "../../apps/worker/src/booking/booker.js";
import { SafeActionBlockedError } from "@recircuit/core";

test.describe("Stage 11: Security & Authorization Deep Verification Suite", () => {
  test.setTimeout(120000);
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

  test("7. Empty plan with legs: [] cannot be approved or booked", async ({ request }) => {
    // 1. Generate plan with unserviceable hazardous material (results in legs: [])
    const planRes = await request.post("http://localhost:3000/api/plan", {
      data: {
        text: "Toxic chemical waste container",
        items: [
          {
            id: "d9e8f7a6-b5c4-4d3e-8f1a-0b9c8d7e6f5a",
            rawText: "Hazardous toxic solvent",
            category: "hazardous",
            quantity: 1,
            declaredWeightKg: 10,
            weightSource: "user_declared",
            hazardClass: "none",
            confidence: 1,
          },
        ],
      },
    });
    expect(planRes.ok()).toBe(true);
    const planData = await planRes.json();
    expect(planData.plan.legs).toEqual([]);
    expect(planData.approvalCard.unroutedItems.length).toBeGreaterThan(0);

    // 2. Attempt to approve empty plan
    const approveRes = await request.post("http://localhost:3000/api/approve", {
      data: {
        requestId: planData.requestId,
        planHash: planData.plan.planHash,
        decision: "approved",
      },
    });
    expect(approveRes.status()).toBe(400);
    const approveBody = await approveRes.json();
    expect(approveBody.error).toContain("No eligible pickup is available to approve");

    // 3. Attempt to book empty plan
    const bookRes = await request.post("http://localhost:3000/api/book", {
      data: {
        requestId: planData.requestId,
        planHash: planData.plan.planHash,
      },
    });
    expect(bookRes.status()).toBe(400);
    const bookBody = await bookRes.json();
    expect(bookBody.error).toMatch(/request must be APPROVED|no eligible pickup legs/);
  });

  test("8. Stale/expired policy evidence cannot authorize submission without fresh revalidation and reapproval", async ({ request }) => {
    // Create valid laptop plan
    const planRes = await request.post("http://localhost:3000/api/plan", {
      data: {
        text: "1 Dell laptop for recycling in Madhapur",
        feeCapInr: 300,
      },
    });
    expect(planRes.ok()).toBe(true);
    const planData = await planRes.json();
    const requestId = planData.requestId;

    // Approve the plan
    const approveRes = await request.post("http://localhost:3000/api/approve", {
      data: {
        requestId,
        planHash: planData.plan.planHash,
        decision: "approved",
        dataWipeConfirmed: true,
      },
    });
    expect(approveRes.ok()).toBe(true);

    // Attempt booking with stale planHash (material change simulated)
    const staleBookRes = await request.post("http://localhost:3000/api/book", {
      data: {
        requestId,
        planHash: "tampered-or-stale-plan-hash-12345",
      },
    });
    expect(staleBookRes.status()).toBe(409);
    const staleBody = await staleBookRes.json();
    expect(staleBody.error).toContain("STALE: Approval no longer matches this plan");
  });

  test("9. Explicit fixture/example mode cannot create an ordinary live booking", async ({ request }) => {
    // Create plan explicitly specifying mode: "fixture"
    const fixturePlanRes = await request.post("http://localhost:3000/api/plan", {
      data: {
        text: "1 old Dell laptop in Madhapur",
        mode: "fixture",
        feeCapInr: 300,
      },
    });
    expect(fixturePlanRes.ok()).toBe(true);
    const fixtureData = await fixturePlanRes.json();
    expect(fixtureData.policyMode).toBe("fixture");
    expect(fixtureData.policies.some((p: any) => p.provenance === "fixture")).toBe(true);

    // Approve the fixture-based plan
    const approveRes = await request.post("http://localhost:3000/api/approve", {
      data: {
        requestId: fixtureData.requestId,
        planHash: fixtureData.plan.planHash,
        decision: "approved",
        dataWipeConfirmed: true,
      },
    });
    expect(approveRes.ok()).toBe(true);
    const approvedData = await approveRes.json();

    // Attempt live booking with fixture plan -> must be blocked
    const liveBookRes = await request.post("http://localhost:3000/api/book", {
      data: {
        requestId: fixtureData.requestId,
        planHash: approvedData.plan.planHash,
      },
    });
    expect(liveBookRes.status()).toBe(400);
    const liveBookBody = await liveBookRes.json();
    expect(liveBookBody.error).toContain("fixture/example policies");
  });

  test("10. Unknown fees are treated as unknown, not presented as a free ₹0 pickup", async ({ request }) => {
    // Generate plan with unserviceable or unpriced items
    const planRes = await request.post("http://localhost:3000/api/plan", {
      data: {
        text: "1 industrial lead battery 50kg in Madhapur",
        items: [
          {
            id: "b1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
            rawText: "Industrial lead-acid battery",
            category: "hazardous",
            quantity: 1,
            declaredWeightKg: 50,
            weightSource: "user_declared",
            hazardClass: "none",
            confidence: 1,
          },
        ],
      },
    });
    expect(planRes.ok()).toBe(true);
    const planData = await planRes.json();

    // Verify matrix shows status UNKNOWN or REJECTED, not ACCEPTED
    for (const cell of planData.matrix.cells) {
      expect(cell.status).not.toBe("ACCEPTED");
    }

    // Verify no leg was created with ₹0 for unknown fee
    expect(planData.plan.legs).toEqual([]);
    expect(planData.approvalCard.unroutedItems.length).toBeGreaterThan(0);
    // Unrouted items must explain the limitation
    expect(planData.approvalCard.unroutedItems[0].reasons.length).toBeGreaterThan(0);
  });
});
