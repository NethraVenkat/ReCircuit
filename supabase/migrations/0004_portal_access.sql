-- Server-only portal API access. service_role bypasses RLS; recycler isolation
-- remains the responsibility of the server adapter. No browser policies.
BEGIN;
REVOKE ALL ON SCHEMA portal FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA portal TO service_role;
REVOKE ALL ON TABLE portal.bookings, portal.booking_events, portal.failure_switches
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  portal.bookings, portal.booking_events, portal.failure_switches TO service_role;
ALTER TABLE portal.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.booking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.failure_switches ENABLE ROW LEVEL SECURITY;
NOTIFY pgrst, 'reload schema';
COMMIT;
