-- =============================================================================
-- supabase/seed.sql
-- SYNTHETIC DEMO DATA — NOT REAL RECYCLER INFORMATION
-- Snapshot date: 2026-10-01
-- =============================================================================

-- Three demo recyclers for the Ziro.Digital Agentic AI Hackathon 2026

INSERT INTO recyclers (id, name, website, portal_url, registration_status, snapshot_date, note)
VALUES
  (
    'a1b2c3d4-0001-4000-8000-000000000001',
    'Deccan E-Cycle',
    'https://deccan-ecycle.example.com',
    'https://deccan-ecycle.example.com/portal',
    'REGISTERED',
    '2026-10-01',
    'SYNTHETIC DEMO DATA — registered in snapshot 2026-10-01. Accepts electronics and batteries.'
  ),
  (
    'a1b2c3d4-0002-4000-8000-000000000002',
    'PaperPlus Kabadi',
    'https://paperplus-kabadi.example.com',
    'https://paperplus-kabadi.example.com/book',
    'REGISTERED',
    '2026-10-01',
    'SYNTHETIC DEMO DATA — registered in snapshot 2026-10-01. Accepts paper and metal. Rejects batteries.'
  ),
  (
    'a1b2c3d4-0003-4000-8000-000000000003',
    'QuickScrap Hyd',
    'https://quickscrap-hyd.example.com',
    'https://quickscrap-hyd.example.com/request',
    'NOT_FOUND',
    '2026-10-01',
    'SYNTHETIC DEMO DATA — not found in government registry snapshot 2026-10-01. Do not route items here.'
  );

-- Demo policies for the two registered recyclers

INSERT INTO recycler_policies (
  id, recycler_id,
  accepted_categories, rejected_categories,
  max_weight_kg, fee_per_kg, payout_per_kg,
  terms_url,
  evidence_url, evidence_screenshot_ref, evidence_extracted_at, evidence_session_id
)
VALUES
  (
    'b1b2c3d4-0001-4000-8000-000000000001',
    'a1b2c3d4-0001-4000-8000-000000000001',
    ARRAY['ELECTRONICS', 'BATTERIES']::item_category[],
    ARRAY['PAPER', 'PLASTIC']::item_category[],
    500,
    0.00,
    2.50,
    'https://deccan-ecycle.example.com/terms',
    'https://deccan-ecycle.example.com/policy',
    'screenshot://seed/deccan-policy.png',
    '2026-10-01T00:00:00Z',
    'seed-session-deccan'
  ),
  (
    'b1b2c3d4-0002-4000-8000-000000000002',
    'a1b2c3d4-0002-4000-8000-000000000002',
    ARRAY['PAPER', 'METAL']::item_category[],
    ARRAY['BATTERIES', 'ELECTRONICS', 'HAZARDOUS']::item_category[],
    1000,
    0.00,
    1.00,
    'https://paperplus-kabadi.example.com/terms',
    'https://paperplus-kabadi.example.com/policy',
    'screenshot://seed/paperplus-policy.png',
    '2026-10-01T00:00:00Z',
    'seed-session-paperplus'
  );

