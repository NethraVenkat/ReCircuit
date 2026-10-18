-- =============================================================================
-- supabase/migrations/0001_init.sql
-- ReRoute initial schema
-- =============================================================================

-- Enable pgcrypto for uuid generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enum types (stored as text with CHECK constraints for flexibility)
-- ---------------------------------------------------------------------------

-- Request pipeline states
CREATE TYPE request_state AS ENUM (
  'DRAFT',
  'ITEMS_PARSED',
  'NEEDS_CLARIFICATION',
  'RECYCLERS_DISCOVERED',
  'POLICIES_READ',
  'ELIGIBILITY_CHECKED',
  'PLAN_CREATED',
  'AWAITING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'FAILED'
);

-- Leg lifecycle states
CREATE TYPE leg_state AS ENUM (
  'APPROVED',
  'SUBMITTING',
  'NEEDS_HUMAN',
  'REQUEST_SUBMITTED',
  'REQUEST_CONFIRMED',
  'PICKUP_SCHEDULED',
  'PICKED_UP',
  'WEIGHED',
  'RECEIVED_AT_RECYCLER',
  'PROCESSED',
  'RECYCLED',
  'CERTIFICATE_ISSUED',
  'REJECTED',
  'FAILED'
);

CREATE TYPE item_category AS ENUM (
  'ELECTRONICS',
  'BATTERIES',
  'PAPER',
  'PLASTIC',
  'METAL',
  'GLASS',
  'TEXTILES',
  'HAZARDOUS',
  'OTHER'
);

CREATE TYPE hazard_class AS ENUM (
  'NON_HAZARDOUS',
  'BATTERY',
  'CRT',
  'FLUORESCENT',
  'TONER',
  'RADIOACTIVE',
  'UNKNOWN'
);

CREATE TYPE registration_status AS ENUM (
  'REGISTERED',
  'NOT_FOUND',
  'EXPIRED',
  'SUSPENDED'
);

CREATE TYPE browser_action_result AS ENUM (
  'success',
  'failure',
  'pending'
);

CREATE TYPE job_status AS ENUM (
  'pending',
  'running',
  'done',
  'failed'
);

-- ---------------------------------------------------------------------------
-- requests
-- ---------------------------------------------------------------------------

CREATE TABLE requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT        NOT NULL,
  description     TEXT        NOT NULL,
  state           request_state NOT NULL DEFAULT 'DRAFT',
  fee_cap_inr     INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX requests_user_id_idx ON requests(user_id);
CREATE INDEX requests_state_idx   ON requests(state);

-- ---------------------------------------------------------------------------
-- items
-- ---------------------------------------------------------------------------

CREATE TABLE items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          UUID        NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  category            item_category NOT NULL,
  description         TEXT        NOT NULL,
  quantity            INTEGER     NOT NULL CHECK (quantity > 0),
  estimated_weight_kg NUMERIC(8, 3) NOT NULL CHECK (estimated_weight_kg > 0),
  confidence          NUMERIC(4, 3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  hazard_class        hazard_class NOT NULL DEFAULT 'NON_HAZARDOUS',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX items_request_id_idx ON items(request_id);

-- ---------------------------------------------------------------------------
-- recyclers
-- ---------------------------------------------------------------------------

CREATE TABLE recyclers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT        NOT NULL,
  website             TEXT        NOT NULL,
  portal_url          TEXT        NOT NULL,
  registration_status registration_status NOT NULL DEFAULT 'REGISTERED',
  snapshot_date       DATE        NOT NULL,
  note                TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- recycler_policies
-- ---------------------------------------------------------------------------

CREATE TABLE recycler_policies (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recycler_id         UUID        NOT NULL REFERENCES recyclers(id) ON DELETE CASCADE,
  accepted_categories item_category[] NOT NULL DEFAULT '{}',
  rejected_categories item_category[] NOT NULL DEFAULT '{}',
  max_weight_kg       NUMERIC(8, 3),
  fee_per_kg          NUMERIC(8, 4),
  payout_per_kg       NUMERIC(8, 4),
  terms_url           TEXT        NOT NULL,
  -- Evidence fields (denormalized for fast lookup)
  evidence_url        TEXT        NOT NULL,
  evidence_screenshot_ref TEXT    NOT NULL,
  evidence_extracted_at   TIMESTAMPTZ NOT NULL,
  evidence_session_id TEXT        NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX recycler_policies_recycler_id_idx ON recycler_policies(recycler_id);

-- ---------------------------------------------------------------------------
-- plans
-- ---------------------------------------------------------------------------

CREATE TABLE plans (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id              UUID        NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  total_estimated_fee     NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total_estimated_payout  NUMERIC(10, 2) NOT NULL DEFAULT 0,
  plan_hash               CHAR(64)    NOT NULL, -- sha256 hex
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX plans_request_id_idx ON plans(request_id);

-- ---------------------------------------------------------------------------
-- plan_legs
-- ---------------------------------------------------------------------------

CREATE TABLE plan_legs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id             UUID        NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  recycler_id         UUID        NOT NULL REFERENCES recyclers(id),
  recycler_name       TEXT        NOT NULL,
  item_ids            UUID[]      NOT NULL DEFAULT '{}',
  estimated_fee       NUMERIC(10, 2) NOT NULL DEFAULT 0,
  estimated_payout    NUMERIC(10, 2) NOT NULL DEFAULT 0,
  state               leg_state   NOT NULL DEFAULT 'APPROVED',
  submitting_session_id TEXT,
  booking_reference   TEXT,
  idempotency_key     CHAR(64),   -- sha256 hex
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX plan_legs_plan_id_idx     ON plan_legs(plan_id);
CREATE INDEX plan_legs_recycler_id_idx ON plan_legs(recycler_id);
CREATE INDEX plan_legs_state_idx       ON plan_legs(state);

-- ---------------------------------------------------------------------------
-- approvals
-- ---------------------------------------------------------------------------

CREATE TABLE approvals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID        NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  plan_id     UUID        NOT NULL REFERENCES plans(id),
  plan_hash   CHAR(64)    NOT NULL, -- must equal plans.plan_hash at approval time
  approved_by TEXT        NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX approvals_request_id_idx ON approvals(request_id);
CREATE INDEX approvals_plan_id_idx    ON approvals(plan_id);

-- ---------------------------------------------------------------------------
-- browser_actions
-- ---------------------------------------------------------------------------

CREATE TABLE browser_actions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leg_id          UUID        NOT NULL REFERENCES plan_legs(id) ON DELETE CASCADE,
  action_type     TEXT        NOT NULL,
  idempotency_key CHAR(64)    NOT NULL,
  session_id      TEXT        NOT NULL,
  url             TEXT        NOT NULL,
  screenshot_ref  TEXT,
  result          browser_action_result NOT NULL DEFAULT 'pending',
  payload         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Core idempotency guarantee: only one successful action per (key, type)
CREATE UNIQUE INDEX browser_actions_idempotency_success_idx
  ON browser_actions(idempotency_key, action_type)
  WHERE result = 'success';

CREATE INDEX browser_actions_leg_id_idx ON browser_actions(leg_id);

-- ---------------------------------------------------------------------------
-- status_events (audit log)
-- ---------------------------------------------------------------------------

CREATE TABLE status_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leg_id              UUID        NOT NULL REFERENCES plan_legs(id) ON DELETE CASCADE,
  previous_state      leg_state   NOT NULL,
  new_state           leg_state   NOT NULL,
  evidence_type       TEXT        NOT NULL,
  evidence_reference  TEXT        NOT NULL,
  observed_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX status_events_leg_id_idx ON status_events(leg_id);
CREATE INDEX status_events_observed_at_idx ON status_events(observed_at);

-- ---------------------------------------------------------------------------
-- test_runs
-- ---------------------------------------------------------------------------

CREATE TABLE test_runs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_case   TEXT        NOT NULL,
  status      TEXT        NOT NULL CHECK (status IN ('PASS', 'FAIL', 'RUNNING')),
  detail      TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- jobs (simple queue)
-- ---------------------------------------------------------------------------

CREATE TABLE jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT        NOT NULL,
  payload     JSONB       NOT NULL DEFAULT '{}',
  status      job_status  NOT NULL DEFAULT 'pending',
  attempts    INTEGER     NOT NULL DEFAULT 0,
  locked_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX jobs_status_created_idx ON jobs(status, created_at);
CREATE INDEX jobs_type_status_idx    ON jobs(type, status);

-- ---------------------------------------------------------------------------
-- agent_trace (per-request reasoning trace)
-- ---------------------------------------------------------------------------

CREATE TABLE agent_trace (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID        NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  step        TEXT        NOT NULL,
  detail      JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX agent_trace_request_id_idx ON agent_trace(request_id);
CREATE INDEX agent_trace_created_at_idx ON agent_trace(created_at);

-- ---------------------------------------------------------------------------
-- Row-level update trigger for updated_at
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER requests_updated_at
  BEFORE UPDATE ON requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER plan_legs_updated_at
  BEFORE UPDATE ON plan_legs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

