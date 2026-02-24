-- Migration 057: Pricing rules and product catalog
-- Powers the AI proposal generation pricing engine

CREATE TABLE IF NOT EXISTS pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL, -- minimum_charge, mileage_surcharge, location_premium, product_price, package_discount
  conditions JSONB DEFAULT '{}', -- e.g. { "location_city": "Durham", "distance_miles_gt": 30 }
  value NUMERIC(10,2),
  formula TEXT, -- optional formula for dynamic pricing
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0, -- higher priority rules override lower
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, -- e.g. "10-foot Balloon Arch", "Latex Bouquet (5pc)"
  category TEXT NOT NULL, -- arch, bouquet, wall, banner, garland, centerpiece, marquee_letter
  base_price NUMERIC(10,2),
  size_variants JSONB DEFAULT '[]', -- [{ "size": "10ft", "price": 250 }, { "size": "12ft", "price": 300 }]
  color_options JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  frequency_count INTEGER DEFAULT 0, -- how often this product appears in proposals
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pricing_rules_select" ON pricing_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "pricing_rules_insert" ON pricing_rules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "pricing_rules_update" ON pricing_rules FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "pricing_rules_delete" ON pricing_rules FOR DELETE TO authenticated USING (true);

CREATE POLICY "product_catalog_select" ON product_catalog FOR SELECT TO authenticated USING (true);
CREATE POLICY "product_catalog_insert" ON product_catalog FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "product_catalog_update" ON product_catalog FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "product_catalog_delete" ON product_catalog FOR DELETE TO authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_product_catalog_category ON product_catalog(category);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_type ON pricing_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_active ON pricing_rules(is_active) WHERE is_active = true;

-- Auto-update updated_at
CREATE TRIGGER set_pricing_rules_updated_at
  BEFORE UPDATE ON pricing_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_product_catalog_updated_at
  BEFORE UPDATE ON product_catalog
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
