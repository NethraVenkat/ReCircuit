-- =============================================================================
-- supabase/migrations/0002_portal.sql
-- Separate 'portal' schema for mock recycler websites.
-- Portals NEVER read or write the agent's tables.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS portal;

CREATE TYPE portal.booking_status AS ENUM (
  'RECEIVED',
  'CONFIRMED',
  'SCHEDULED',
  'PICKED_UP',
  'WEIGHED',
  'CANCELLED'
);

-- ---------------------------------------------------------------------------
-- portal.bookings
-- ---------------------------------------------------------------------------

CREATE TABLE portal.bookings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recycler_id       TEXT NOT NULL CHECK (recycler_id IN ('deccan', 'paperplus', 'quickscrap')),
  booking_reference TEXT NOT NULL UNIQUE,
  client_request_id TEXT NOT NULL,
  full_name         TEXT NOT NULL,
  phone             TEXT NOT NULL,
  address_line      TEXT NOT NULL,
  locality          TEXT NOT NULL,
  pincode           TEXT NOT NULL,
  preferred_slot    TEXT NOT NULL,
  items             JSONB NOT NULL DEFAULT '[]'::jsonb,
  status            portal.booking_status NOT NULL DEFAULT 'RECEIVED',
  pickup_otp        TEXT,
  weight_kg         NUMERIC(8, 2),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Duplicate protection: same client_request_id per recycler returns existing booking
CREATE UNIQUE INDEX bookings_recycler_client_req_idx
  ON portal.bookings(recycler_id, client_request_id);

CREATE INDEX bookings_recycler_ref_idx
  ON portal.bookings(recycler_id, booking_reference);

-- ---------------------------------------------------------------------------
-- portal.booking_events
-- ---------------------------------------------------------------------------

CREATE TABLE portal.booking_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   UUID NOT NULL REFERENCES portal.bookings(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,
  status       portal.booking_status NOT NULL,
  detail       TEXT NOT NULL,
  is_simulated BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX booking_events_booking_id_idx
  ON portal.booking_events(booking_id, created_at);

-- ---------------------------------------------------------------------------
-- portal.failure_switches (for simulated agent failure tests)
-- ---------------------------------------------------------------------------

CREATE TABLE portal.failure_switches (
  recycler_id TEXT PRIMARY KEY,
  fail_next_submit BOOLEAN NOT NULL DEFAULT false,
  omit_next_reference BOOLEAN NOT NULL DEFAULT false,
  changed_policy_layout BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

