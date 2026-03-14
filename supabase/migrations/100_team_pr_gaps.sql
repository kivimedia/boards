-- Migration 100: Team PR gap fixes
-- Adds missing columns, seeds Caroline Ravn, updates constraints

-- 1. Add missing columns to pr_outlets
ALTER TABLE pr_outlets
  ADD COLUMN IF NOT EXISTS fit_type TEXT,
  ADD COLUMN IF NOT EXISTS lead_time_weeks INT,
  ADD COLUMN IF NOT EXISTS pitch_timing_window TEXT;

-- 2. Add dry_run flag to pr_runs
ALTER TABLE pr_runs
  ADD COLUMN IF NOT EXISTS dry_run BOOLEAN NOT NULL DEFAULT false;

-- 3. Fix contact_source constraint to include hunter_domain_search (backwards compat)
ALTER TABLE pr_outlets DROP CONSTRAINT IF EXISTS pr_outlets_contact_source_check;
ALTER TABLE pr_outlets ADD CONSTRAINT pr_outlets_contact_source_check
  CHECK (contact_source IS NULL OR contact_source IN ('hunter', 'hunter_domain_search', 'manual', 'website', 'linkedin', 'exa'));

-- 4. Seed Caroline Ravn as first PR client
-- Uses a DO block so it's idempotent (only inserts if no client named 'Caroline Ravn' exists)
DO $$
DECLARE
  v_client_id UUID;
BEGIN
  -- Check if already seeded
  SELECT id INTO v_client_id FROM pr_clients WHERE name = 'Caroline Ravn' LIMIT 1;
  IF v_client_id IS NOT NULL THEN
    RAISE NOTICE 'Caroline Ravn already exists, skipping seed';
    RETURN;
  END IF;

  -- Insert client (user_id = Ziv)
  INSERT INTO pr_clients (
    user_id, name, company, industry, bio, website,
    brand_voice, pitch_angles, tone_rules,
    target_markets, exclusion_list
  ) VALUES (
    '860201a2-8d2d-43ba-91a0-4cc0534fc233',
    'Caroline Ravn',
    'Caroline Ravn Entertainment',
    'Entertainment & Events',
    'Caroline Ravn is an international magician, mentalist, and emcee who transforms events into unforgettable experiences. She is an experience architect, not a tricks performer.',
    'https://carolineravn.com',
    '{"style": "Confident, elegant, playful, and aspirational", "do": ["Lead with specificity and credibility", "Let credentials speak", "Frame as story opportunity for journalist", "Tie to current trends or seasonal moments"], "dont": ["Use superlatives", "Oversell or boast", "Frame as promotion", "Use phrases like worlds greatest or absolutely amazing"]}'::jsonb,
    '[
      {"name": "Event Transformation", "description": "How Caroline transforms corporate events, galas, and conferences into immersive experiences that guests remember. Focus on the experience architecture approach."},
      {"name": "Breaking Barriers", "description": "A woman succeeding in the male-dominated world of magic and mentalism. Gender equality angle - supporting layer, not the lead."},
      {"name": "Corporate Entertainment Evolution", "description": "The shift from traditional entertainment to experiential, interactive formats. Caroline as thought leader in this space."},
      {"name": "Mind Reading & Decision Science", "description": "The psychology behind mentalism and how it connects to behavioral science, decision-making, and leadership."},
      {"name": "Nordic Success Story", "description": "International career built from Scandinavia. Performing globally while rooted in Nordic values."},
      {"name": "Keynote Speaker & Emcee", "description": "Beyond magic - Caroline as a professional host and keynote speaker for corporate events."},
      {"name": "Behind the Curtain", "description": "The creative process, preparation, and business of being a professional performer. Human interest angle."}
    ]'::jsonb,
    '{"swedish": {"undersell": true, "jantelagen": true, "no_superlatives": true, "frame_as_story": true, "specificity_over_impressiveness": true}, "english": {"confident_but_grounded": true, "results_focused": true}, "universal": {"no_bullet_points": true, "no_em_dashes": true, "max_words": 300, "must_have_why_now": true, "no_fabrication": true}}'::jsonb,
    ARRAY['Sweden', 'Nordics'],
    ARRAY[]::text[]
  ) RETURNING id INTO v_client_id;

  -- Insert Sweden territory
  INSERT INTO pr_territories (
    user_id, client_id, name, country_code, language,
    signal_keywords, pitch_norms, seasonal_calendar,
    seed_outlets, market_data
  ) VALUES (
    '860201a2-8d2d-43ba-91a0-4cc0534fc233',
    v_client_id,
    'Sweden',
    'SE',
    'sv',
    ARRAY['magic', 'mentalism', 'event entertainment', 'corporate events', 'experience design', 'keynote speaker', 'emcee', 'Swedish entertainment', 'event transformation', 'women in magic'],
    'Always pitch in Swedish for Swedish outlets. Swedish journalists prefer Swedish - an English pitch signals "foreign PR agency." Undersell, don''t oversell - follow Jantelagen. Lead with specificity and credibility, not superlatives. Frame as story opportunity for the journalist, not promotion. Tie to something current (why now). The right person matters more than the right outlet - never pitch a general inbox. Lead times: print 2-4 months, TV 2-8 weeks, digital 1-4 weeks, podcasts 1-6 weeks.',
    '{
      "jan_feb": {"events": "Post-holiday restart, event industry planning for spring", "strategy": "Pitch business/event media. Event trends angle."},
      "mar_apr": {"events": "Spring season, magazine spring/summer issues in production", "strategy": "Pitch print magazines (2-month lead). Lifestyle and culture outlets."},
      "may": {"events": "Pre-summer, last window before media slows", "strategy": "Urgent pitches for autumn bookings. Pitch TV for autumn season."},
      "jun_jul": {"events": "Summer dead zone, editorial staff on vacation", "strategy": "DO NOT PITCH. Use for seed list prep and research only."},
      "aug": {"events": "Media returns, autumn production begins", "strategy": "PRIME WINDOW. TV booking autumn guests. Magazines planning Oct-Dec."},
      "sep_oct": {"events": "Peak event season, corporate galas, conferences", "strategy": "Pitch event industry media. Tie to specific events or trends."},
      "nov_dec": {"events": "Holiday season, feel-good content, year-end", "strategy": "Pitch TV holiday specials. Personality profiles. Best of year features."}
    }'::jsonb,
    '[
      {"name": "Nyhetsmorgon", "url": "https://www.tv4.se/nyhetsmorgon", "type": "tv", "description": "TV4 morning show - interviews and lifestyle"},
      {"name": "Morgonstudion", "url": "https://www.svt.se/nyheter/morgonstudion", "type": "tv", "description": "SVT1 morning news + interviews"},
      {"name": "Efter tio", "url": "https://www.tv4.se/efter-tio", "type": "tv", "description": "TV4 late night lifestyle show"},
      {"name": "Carina Bergfeldt", "url": "https://www.svt.se/carina-bergfeldt", "type": "tv", "description": "SVT talk show / interview"},
      {"name": "Skavlan", "url": "https://www.svt.se/skavlan", "type": "tv", "description": "SVT/NRK Scandinavian talk show"},
      {"name": "ELLE Sweden", "url": "https://www.elle.se", "type": "magazine", "description": "Womens lifestyle and culture"},
      {"name": "Damernas Varld", "url": "https://www.damernasvarld.se", "type": "magazine", "description": "Womens interest magazine"},
      {"name": "Amelia", "url": "https://www.amelia.se", "type": "magazine", "description": "Womens lifestyle magazine"},
      {"name": "Dagens Industri", "url": "https://www.di.se", "type": "newspaper", "description": "Swedish business daily"},
      {"name": "Resume", "url": "https://www.resume.se", "type": "trade_publication", "description": "Media industry trade publication"},
      {"name": "Motesindustrin", "url": "https://www.motesindustrin.se", "type": "trade_publication", "description": "Event industry trade publication"},
      {"name": "Goteborgs-Posten", "url": "https://www.gp.se", "type": "newspaper", "description": "Gothenburg regional newspaper"},
      {"name": "Sydsvenskan", "url": "https://www.sydsvenskan.se", "type": "newspaper", "description": "Southern Sweden regional newspaper"},
      {"name": "Framgangspodden", "url": "https://www.youtube.com/@framgangspodden", "type": "podcast", "description": "Success/interview podcast"},
      {"name": "Hur kan vi?", "url": "https://open.spotify.com/show/hurkanvi", "type": "podcast", "description": "Interview/personality podcast"},
      {"name": "Fredagspodden", "url": "https://open.spotify.com/show/fredagspodden", "type": "podcast", "description": "Popular interview podcast"},
      {"name": "Vi", "url": "https://www.vi-tidningen.se", "type": "magazine", "description": "Culture and general interest magazine"},
      {"name": "Filter", "url": "https://filter.se", "type": "magazine", "description": "Culture and feature magazine"},
      {"name": "Fokus", "url": "https://www.fokus.se", "type": "magazine", "description": "News and culture magazine"},
      {"name": "The Local", "url": "https://www.thelocal.se", "type": "online_media", "description": "English-language news about Sweden"}
    ]'::jsonb,
    '{"pr_pricing": {"single_release_eur": 1700, "monthly_retainer_eur": "3500-4500", "three_month_package_eur": 6300}, "lead_times": {"print_months": "2-4", "tv_weeks": "2-8", "digital_weeks": "1-4", "podcast_weeks": "1-6"}}'::jsonb
  );

  RAISE NOTICE 'Caroline Ravn + Sweden territory seeded successfully';
END $$;
