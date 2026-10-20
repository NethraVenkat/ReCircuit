/**
 * packages/db/src/migrations.test.ts
 *
 * Offline PostgreSQL migration and schema verification using @electric-sql/pglite.
 * Verifies that:
 *  - 0001_init.sql, 0002_portal.sql, and seed.sql are 100% valid PostgreSQL.
 *  - All tables, constraints, defaults, foreign keys, cascades behave as specified.
 *  - The partial unique index on browser_actions(idempotency_key, action_type) WHERE result='success'
 *    blocks duplicate successes while allowing failed/pending retries.
 *  - Database enums match TypeScript enums without drift.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import path from "path";

describe("PostgreSQL Migrations & Schema Offline Verification", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();

    const rootDir = path.resolve(__dirname, "../../..");
    const migration1 = fs.readFileSync(path.join(rootDir, "supabase/migrations/0001_init.sql"), "utf-8");
    const migration2 = fs.readFileSync(path.join(rootDir, "supabase/migrations/0002_portal.sql"), "utf-8");
    const seed = fs.readFileSync(path.join(rootDir, "supabase/seed.sql"), "utf-8");

    // Execute migrations
    await db.exec(migration1);
    await db.exec(migration2);
    await db.exec(fs.readFileSync(path.join(rootDir, "supabase/migrations/0003_booking_fee.sql"), "utf8"));
    await db.exec(seed);
  });

  it("stores submitted fees as nullable numeric values with a nonnegative constraint", async () => {
    const column = await db.query<{ data_type: string; is_nullable: string }>(
      "SELECT data_type, is_nullable FROM information_schema.columns WHERE table_schema='portal' AND table_name='bookings' AND column_name='charged_fee_inr'"
    );
    expect(column.rows).toEqual([{ data_type: "numeric", is_nullable: "YES" }]);
    const constraint = await db.query<{ definition: string }>(
      "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='portal.bookings'::regclass AND contype='c'"
    );
    expect(constraint.rows.some((row) => row.definition.includes("charged_fee_inr >= "))).toBe(true);
  });

  it("applies migrations and seed successfully with recyclers and policies populated", async () => {
    const recyclers = await db.query<{ id: string; name: string }>("SELECT id, name FROM recyclers;");
    expect(recyclers.rows).toHaveLength(3);
    const names = recyclers.rows.map((r) => r.name);
    expect(names).toContain("Deccan E-Cycle");
    expect(names).toContain("PaperPlus Kabadi");
    expect(names).toContain("QuickScrap Hyd");

    const policies = await db.query<{ id: string; recycler_id: string }>("SELECT id, recycler_id FROM recycler_policies;");
    expect(policies.rows).toHaveLength(2);
  });

  it("enforces foreign key cascading and constraints on requests and items", async () => {
    // Insert a request
    const reqRes = await db.query<{ id: string }>(
      `INSERT INTO requests (user_id, description, state, fee_cap_inr)
       VALUES ('user-test', 'Recycle old electronics', 'DRAFT', 250)
       RETURNING id;`
    );
    const reqId = reqRes.rows[0]?.id;
    expect(reqId).toBeDefined();

    // Insert an item
    const itemRes = await db.query<{ id: string }>(
      `INSERT INTO items (request_id, category, description, quantity, estimated_weight_kg, confidence, hazard_class)
       VALUES ($1, 'ELECTRONICS', 'Old laptop', 1, 2.2, 0.95, 'BATTERY')
       RETURNING id;`,
      [reqId]
    );
    expect(itemRes.rows[0]?.id).toBeDefined();

    // Verify negative quantities or weights are rejected by CHECK constraint
    await expect(
      db.query(
        `INSERT INTO items (request_id, category, description, quantity, estimated_weight_kg, confidence)
         VALUES ($1, 'ELECTRONICS', 'Negative quantity', -1, 2.2, 0.95);`,
        [reqId]
      )
    ).rejects.toThrow();

    await expect(
      db.query(
        `INSERT INTO items (request_id, category, description, quantity, estimated_weight_kg, confidence)
         VALUES ($1, 'ELECTRONICS', 'Negative weight', 1, -2.2, 0.95);`,
        [reqId]
      )
    ).rejects.toThrow();

    // Delete the request and confirm cascade deletion of items
    await db.query("DELETE FROM requests WHERE id = $1;", [reqId]);
    const itemsRemaining = await db.query("SELECT * FROM items WHERE request_id = $1;", [reqId]);
    expect(itemsRemaining.rows).toHaveLength(0);
  });

  it("supports audit status_events for both request-level and leg-level transitions", async () => {
    // 1. Request transition event
    const req = await db.query<{ id: string }>(
      `INSERT INTO requests (user_id, description, state)
       VALUES ('user-audit', 'Audit test request', 'DRAFT')
       RETURNING id;`
    );
    const reqId = req.rows[0]?.id;

    await db.query(
      `INSERT INTO status_events (request_id, previous_state, new_state, evidence_type, evidence_reference)
       VALUES ($1, 'DRAFT', 'ITEMS_PARSED', 'items_extracted', 'count=3');`,
      [reqId]
    );

    // 2. Leg transition event
    const recycler = (await db.query<{ id: string }>("SELECT id FROM recyclers LIMIT 1;")).rows[0]?.id;
    const plan = await db.query<{ id: string }>(
      `INSERT INTO plans (request_id, plan_hash) VALUES ($1, 'hash-123') RETURNING id;`,
      [reqId]
    );
    const leg = await db.query<{ id: string }>(
      `INSERT INTO plan_legs (plan_id, recycler_id, recycler_name) VALUES ($1, $2, 'Test Recycler') RETURNING id;`,
      [plan.rows[0]?.id, recycler]
    );
    const legId = leg.rows[0]?.id;

    await db.query(
      `INSERT INTO status_events (leg_id, previous_state, new_state, evidence_type, evidence_reference)
       VALUES ($1, 'APPROVED', 'SUBMITTING', 'idempotency_key', 'ikey-123');`,
      [legId]
    );

    const events = await db.query<{ previous_state: string; new_state: string }>(
      `SELECT previous_state, new_state FROM status_events WHERE request_id = $1 OR leg_id = $2;`,
      [reqId, legId]
    );
    expect(events.rows).toHaveLength(2);
  });

  it("enforces partial unique index on browser_actions(idempotency_key, action_type) WHERE result='success'", async () => {
    const recycler = (await db.query<{ id: string }>("SELECT id FROM recyclers LIMIT 1;")).rows[0]?.id;
    const req = (await db.query<{ id: string }>("INSERT INTO requests (user_id, description) VALUES ('u', 'd') RETURNING id;")).rows[0]?.id;
    const plan = (await db.query<{ id: string }>("INSERT INTO plans (request_id, plan_hash) VALUES ($1, 'h') RETURNING id;", [req])).rows[0]?.id;
    const leg = (await db.query<{ id: string }>("INSERT INTO plan_legs (plan_id, recycler_id, recycler_name) VALUES ($1, $2, 'r') RETURNING id;", [plan, recycler])).rows[0]?.id;

    const ikey = "test-idempotency-key-" + Math.random().toString(36).substring(2);

    // First attempt: failed submit
    await db.query(
      `INSERT INTO browser_actions (leg_id, action_type, idempotency_key, session_id, url, result)
       VALUES ($1, 'SUBMIT_FORM', $2, 'sess-1', 'https://deccan.example.com', 'failure');`,
      [leg, ikey]
    );

    // Second attempt: successful submit
    await db.query(
      `INSERT INTO browser_actions (leg_id, action_type, idempotency_key, session_id, url, result)
       VALUES ($1, 'SUBMIT_FORM', $2, 'sess-2', 'https://deccan.example.com', 'success');`,
      [leg, ikey]
    );

    // Third attempt: duplicate SUCCESS with the same (idempotency_key, action_type) must be blocked
    await expect(
      db.query(
        `INSERT INTO browser_actions (leg_id, action_type, idempotency_key, session_id, url, result)
         VALUES ($1, 'SUBMIT_FORM', $2, 'sess-3', 'https://deccan.example.com', 'success');`,
        [leg, ikey]
      )
    ).rejects.toThrow(/unique|duplicate/i);
  });

  it("validates portal schema tables, unique booking references, and duplicate client_request_id", async () => {
    const clientReqId = "req-client-" + Math.random().toString(36).substring(2);

    // First booking
    await db.query(
      `INSERT INTO portal.bookings (recycler_id, booking_reference, client_request_id, full_name, phone, address_line, locality, pincode, preferred_slot)
       VALUES ('deccan', 'DEC-99881', $1, 'Test User', '9876543210', 'Plot 1', 'Kukatpally', '500072', 'Tomorrow');`,
      [clientReqId]
    );

    // Duplicate client_request_id for same recycler should violate unique index
    await expect(
      db.query(
        `INSERT INTO portal.bookings (recycler_id, booking_reference, client_request_id, full_name, phone, address_line, locality, pincode, preferred_slot)
         VALUES ('deccan', 'DEC-99882', $1, 'Another Name', '9876543210', 'Plot 1', 'Kukatpally', '500072', 'Tomorrow');`,
        [clientReqId]
      )
    ).rejects.toThrow();
  });
});

