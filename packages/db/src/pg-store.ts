import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "crypto";
import type { IRepository, RequestRecord, JobRecord } from "./types.js";
import type { StatusEvent, Item, Plan, PlanLeg, RequestState, LegState, HazardClass, ItemCategory } from "@recircuit/core";

interface PgRequestRow {
  id: string;
  user_id: string;
  description: string;
  state: RequestState;
  fee_cap_inr: number | null;
  created_at: string;
  updated_at: string;
}

interface PgItemRow {
  id: string;
  request_id: string;
  category: ItemCategory;
  description: string;
  quantity: number;
  estimated_weight_kg: string | number;
  confidence: string | number;
  hazard_class: HazardClass;
  created_at: string;
}

interface PgPlanRow {
  id: string;
  request_id: string;
  total_estimated_fee: string | number;
  total_estimated_payout: string | number;
  plan_hash: string;
  created_at: string;
}

interface PgPlanLegRow {
  id: string;
  plan_id: string;
  recycler_id: string;
  recycler_name: string;
  item_ids: string[];
  estimated_fee: string | number;
  estimated_payout: string | number;
  state: LegState;
  submitting_session_id: string | null;
  booking_reference: string | null;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
}

interface PgJobRow {
  id: string;
  type: string;
  payload: string | Record<string, unknown>;
  status: "pending" | "running" | "done" | "failed";
  attempts: number;
  locked_at: string | null;
  created_at: string;
}

interface PgStatusEventRow {
  id: string;
  leg_id: string | null;
  request_id: string | null;
  previous_state: string;
  new_state: string;
  evidence_type: string;
  evidence_reference: string;
  observed_at: string;
}

export class PgRepository implements IRepository {
  private db: PGlite;

  constructor(db?: PGlite) {
    this.db = db || new PGlite();
  }

  public getDb(): PGlite {
    return this.db;
  }

  public async saveRequest(record: RequestRecord): Promise<void> {
    const { request, items, plan } = record;

    await this.db.query(
      `INSERT INTO requests (id, user_id, description, state, fee_cap_inr, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         state = EXCLUDED.state,
         fee_cap_inr = EXCLUDED.fee_cap_inr,
         updated_at = EXCLUDED.updated_at`,
      [
        request.id,
        request.userId,
        request.description || "Pickup request",
        request.state,
        request.feeCapInr ?? null,
        request.createdAt,
        request.updatedAt,
      ]
    );

    // Persist items
    for (const item of items) {
      await this.db.query(
        `INSERT INTO items (id, request_id, category, description, quantity, estimated_weight_kg, confidence, hazard_class)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [
          item.id || randomUUID(),
          request.id,
          (item.category || "ELECTRONICS").toUpperCase(),
          item.description || "item",
          item.quantity || 1,
          item.estimatedWeightKg || 1.0,
          item.confidence ?? 1.0,
          (item.hazardClass || "NON_HAZARDOUS").toUpperCase(),
        ]
      );
    }

    // Persist plan if present
    if (plan) {
      await this.db.query(
        `INSERT INTO plans (id, request_id, total_estimated_fee, total_estimated_payout, plan_hash, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           total_estimated_fee = EXCLUDED.total_estimated_fee,
           total_estimated_payout = EXCLUDED.total_estimated_payout,
           plan_hash = EXCLUDED.plan_hash`,
        [
          plan.id,
          request.id,
          plan.totalEstimatedFee,
          plan.totalEstimatedPayout,
          plan.planHash,
          plan.createdAt,
        ]
      );

      for (const leg of plan.legs) {
        await this.db.query(
          `INSERT INTO plan_legs (id, plan_id, recycler_id, recycler_name, item_ids, estimated_fee, estimated_payout, state, submitting_session_id, booking_reference, idempotency_key, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (id) DO UPDATE SET
             state = EXCLUDED.state,
             submitting_session_id = EXCLUDED.submitting_session_id,
             booking_reference = EXCLUDED.booking_reference,
             updated_at = EXCLUDED.updated_at`,
          [
            leg.id,
            plan.id,
            leg.recyclerId,
            leg.recyclerName,
            leg.itemIds,
            leg.estimatedFee,
            leg.estimatedPayout,
            leg.state,
            leg.submittingSessionId ?? null,
            leg.bookingReference ?? null,
            leg.idempotencyKey ?? null,
            leg.createdAt,
            leg.updatedAt,
          ]
        );
      }
    }
  }

  public async getRequest(requestId: string): Promise<RequestRecord | null> {
    const reqRes = await this.db.query<PgRequestRow>(
      `SELECT * FROM requests WHERE id = $1`,
      [requestId]
    );
    if (!reqRes.rows.length) return null;

    const row = reqRes.rows[0]!;
    const itemsRes = await this.db.query<PgItemRow>(
      `SELECT * FROM items WHERE request_id = $1`,
      [requestId]
    );

    const plansRes = await this.db.query<PgPlanRow>(
      `SELECT * FROM plans WHERE request_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [requestId]
    );

    let plan: Plan | null = null;
    if (plansRes.rows.length) {
      const pRow = plansRes.rows[0]!;
      const legsRes = await this.db.query<PgPlanLegRow>(
        `SELECT * FROM plan_legs WHERE plan_id = $1`,
        [pRow.id]
      );
      const legs: PlanLeg[] = legsRes.rows.map((l) => ({
        id: l.id,
        planId: l.plan_id,
        recyclerId: l.recycler_id,
        recyclerName: l.recycler_name,
        itemIds: l.item_ids,
        estimatedFee: Number(l.estimated_fee),
        estimatedPayout: Number(l.estimated_payout),
        state: l.state,
        ...(l.submitting_session_id ? { submittingSessionId: l.submitting_session_id } : {}),
        ...(l.booking_reference ? { bookingReference: l.booking_reference } : {}),
        ...(l.idempotency_key ? { idempotencyKey: l.idempotency_key } : {}),
        createdAt: l.created_at,
        updatedAt: l.updated_at,
      }));

      plan = {
        id: pRow.id,
        requestId: pRow.request_id,
        totalEstimatedFee: Number(pRow.total_estimated_fee),
        totalEstimatedPayout: Number(pRow.total_estimated_payout),
        planHash: pRow.plan_hash,
        createdAt: pRow.created_at,
        legs,
      };
    }

    const mappedItems: Item[] = itemsRes.rows.map((i) => ({
      id: i.id,
      requestId: i.request_id || requestId,
      description: i.description,
      category: i.category,
      quantity: i.quantity,
      estimatedWeightKg: Number(i.estimated_weight_kg),
      confidence: Number(i.confidence ?? 1.0),
      hazardClass: i.hazard_class,
      createdAt: i.created_at || new Date().toISOString(),
    }));

    return {
      request: {
        id: row.id,
        userId: row.user_id,
        description: row.description,
        state: row.state,
        items: mappedItems,
        ...(row.fee_cap_inr != null ? { feeCapInr: row.fee_cap_inr } : {}),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
      items: mappedItems,
      plan,
      auditEvents: [],
      updatedAt: row.updated_at,
    };
  }

  public async listRequests(): Promise<RequestRecord[]> {
    const res = await this.db.query<{ id: string }>(`SELECT id FROM requests ORDER BY updated_at DESC`);
    const records: RequestRecord[] = [];
    for (const row of res.rows) {
      const rec = await this.getRequest(row.id);
      if (rec) records.push(rec);
    }
    return records;
  }

  public async enqueueJob(type: string, payload: Record<string, unknown>): Promise<JobRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.db.query(
      `INSERT INTO jobs (id, type, payload, status, attempts, created_at)
       VALUES ($1, $2, $3, 'pending', 0, $4)`,
      [id, type, JSON.stringify(payload), now]
    );

    return {
      id,
      type,
      payload,
      status: "pending",
      attempts: 0,
      lockedAt: null,
      createdAt: now,
      updatedAt: now,
      error: null,
    };
  }

  public async dequeueJob(type?: string): Promise<JobRecord | null> {
    const query = type
      ? `SELECT * FROM jobs WHERE status = 'pending' AND type = $1 ORDER BY created_at ASC LIMIT 1`
      : `SELECT * FROM jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1`;
    const params = type ? [type] : [];

    const res = await this.db.query<PgJobRow>(query, params);
    if (!res.rows.length) return null;

    const row = res.rows[0]!;
    const now = new Date().toISOString();

    await this.db.query(
      `UPDATE jobs SET status = 'running', locked_at = $1, attempts = attempts + 1 WHERE id = $2`,
      [now, row.id]
    );

    const parsedPayload = typeof row.payload === "string"
      ? (JSON.parse(row.payload) as Record<string, unknown>)
      : row.payload;

    return {
      id: row.id,
      type: row.type,
      payload: parsedPayload,
      status: "running",
      attempts: row.attempts + 1,
      lockedAt: now,
      createdAt: row.created_at,
      updatedAt: now,
      error: null,
    };
  }

  public async completeJob(jobId: string, _result?: Record<string, unknown>): Promise<void> {
    await this.db.query(
      `UPDATE jobs SET status = 'done', locked_at = NULL WHERE id = $1`,
      [jobId]
    );
  }

  public async failJob(jobId: string, _error: string): Promise<void> {
    await this.db.query(
      `UPDATE jobs SET status = 'failed', locked_at = NULL WHERE id = $1`,
      [jobId]
    );
  }

  public async appendAudit(event: StatusEvent): Promise<void> {
    await this.db.query(
      `INSERT INTO status_events (id, leg_id, request_id, previous_state, new_state, evidence_type, evidence_reference, observed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        event.id,
        event.legId ?? null,
        event.requestId ?? null,
        event.previousState,
        event.newState,
        event.evidenceType,
        event.evidenceReference,
        event.observedAt,
      ]
    );
  }

  public async getAudits(filter?: { requestId?: string; legId?: string }): Promise<StatusEvent[]> {
    let query = `SELECT * FROM status_events`;
    const params: string[] = [];
    if (filter?.requestId) {
      query += ` WHERE request_id = $1`;
      params.push(filter.requestId);
    } else if (filter?.legId) {
      query += ` WHERE leg_id = $1`;
      params.push(filter.legId);
    }
    query += ` ORDER BY observed_at ASC`;

    const res = await this.db.query<PgStatusEventRow>(query, params);
    return res.rows.map((r) => ({
      id: r.id,
      ...(r.leg_id ? { legId: r.leg_id } : {}),
      ...(r.request_id ? { requestId: r.request_id } : {}),
      previousState: r.previous_state as LegState | RequestState,
      newState: r.new_state as LegState | RequestState,
      evidenceType: r.evidence_type,
      evidenceReference: r.evidence_reference,
      observedAt: r.observed_at,
    }));
  }
}
