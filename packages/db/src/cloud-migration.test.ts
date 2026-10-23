import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

describe("cloud persistence SQL contracts", () => {
  const db = new PGlite();
  beforeAll(async () => {
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text primary key,name text,public boolean);");
    for (const name of ["0001_init", "0002_portal", "0003_booking_fee", "0004_portal_access", "0005_cloud_persistence", "0006_persistence_guards"]) {
      await db.exec(readFileSync(`supabase/migrations/${name}.sql`, "utf8"));
    }
  }, 30000);
  afterAll(async () => { await db.close(); });
  it("denies browser roles access to documents and privileged RPCs", async () => {
    const result = await db.query<{ allowed: boolean }>("select has_table_privilege('anon','household_records','SELECT') or has_function_privilege('authenticated','household_save(jsonb,bigint,uuid)','EXECUTE') as allowed");
    expect(result.rows[0]?.allowed).toBe(false);
  });
  it("atomically consumes a nonce and rejects expiry/replay", async () => {
    const nonce = randomUUID();
    const first = await db.query<{ used: boolean }>("select portal.consume_nonce($1,now()+interval '1 minute') as used", [nonce]);
    const replay = await db.query<{ used: boolean }>("select portal.consume_nonce($1,now()+interval '1 minute') as used", [nonce]);
    const expired = await db.query<{ used: boolean }>("select portal.consume_nonce($1,now()-interval '1 minute') as used", [randomUUID()]);
    expect([first.rows[0]?.used,replay.rows[0]?.used,expired.rows[0]?.used]).toEqual([true,false,false]);
  });
  it("creates exactly one booking and event across retries", async () => {
    const booking = { recycler_id: "deccan", booking_reference: "DEC-TEST", client_request_id: randomUUID(), full_name: "Test", phone: "0000000000", address_line: "Test", locality: "Test", pincode: "500072", preferred_slot: "Test", items: [], charged_fee_inr: 180 };
    const first = await db.query<{ result: { isDuplicate: boolean } }>("select portal.create_booking($1) as result", [JSON.stringify(booking)]);
    const second = await db.query<{ result: { isDuplicate: boolean } }>("select portal.create_booking($1) as result", [JSON.stringify({ ...booking, booking_reference: "DEC-OTHER" })]);
    expect(first.rows[0]?.result.isDuplicate).toBe(false);
    expect(second.rows[0]?.result.isDuplicate).toBe(true);
    const count = await db.query<{ n: number }>("select count(*)::int as n from portal.booking_events");
    expect(count.rows[0]?.n).toBe(1);
  });
  it("persists every switch and consumes a one-shot value once", async () => {
    const switches = { failNextSubmit: true, omitNextReference: true, changedPolicyLayout: true, hideFeeInfo: true, raiseFee: true, hideReviewFee: true };
    const result = await db.query<{ switches: typeof switches }>("select portal.update_switches('test-recycler',$1) as switches", [JSON.stringify(switches)]);
    expect(result.rows[0]?.switches).toEqual(switches);
    const consumed = await db.query<{ used: boolean }>("select portal.consume_switch('test-recycler','failNextSubmit') as used");
    const replay = await db.query<{ used: boolean }>("select portal.consume_switch('test-recycler','failNextSubmit') as used");
    expect([consumed.rows[0]?.used,replay.rows[0]?.used]).toEqual([true,false]);
  });
  it("enforces revisions, ownership, locks and approval expiry", async () => {
    const id = randomUUID();
    const record = { request: { id, userId: "owner", state: "AWAITING_APPROVAL" }, items: [], plan: { planHash: "hash", legs: [{ id: "leg", recyclerId: "deccan", state: "APPROVED" }] }, household: { policyMode: "live", policies: [{ recyclerId: "deccan", provenance: "live", status: "SUCCESS", expiresAt: "2000-01-01T00:00:00Z" }] } };
    await db.query("select household_save($1)", [JSON.stringify(record)]);
    await expect(db.query("select household_save($1)", [JSON.stringify(record)])).rejects.toThrow("revision changed");
    await expect(db.query("select household_save($1,1)", [JSON.stringify({ ...record, request: { ...record.request, userId: "stranger" } })])).rejects.toThrow("OWNERSHIP_DENIED");
    const approved = { ...record, request: { ...record.request, state: "APPROVED" }, approval: { decision: "approved", planHash: "hash" } };
    await expect(db.query("select household_save($1,1)", [JSON.stringify(approved)])).rejects.toThrow("evidence expired");
    const token = randomUUID();
    const lock = await db.query<{ locked: boolean }>("select household_lock($1,$2) as locked", [id,token]);
    expect(lock.rows[0]?.locked).toBe(true);
    await expect(db.query("select household_save($1,1)", [JSON.stringify(record)])).rejects.toThrow("BUSY");
    await db.query("select household_save($1,1,$2)", [JSON.stringify(record),token]);
    await db.query("select household_lock($1,$2,true)", [id,token]);
    await db.query("select household_save($1,2)", [JSON.stringify({ request: record.request, items: [] })]);
    const preserved = await db.query<{ hash: string }>("select record#>>'{plan,planHash}' as hash from household_records where id=$1", [id]);
    expect(preserved.rows[0]?.hash).toBe("hash");
  });
});
