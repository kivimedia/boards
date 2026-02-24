-- ============================================================================
-- 065_client_trello_cards.sql
-- Map Trello cards (account manager tickets) to clients.
-- Each client can track one or more Trello cards for updates.
-- ============================================================================

CREATE TABLE client_trello_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  trello_board_id TEXT NOT NULL,
  trello_board_name TEXT NOT NULL,
  trello_list_id TEXT NOT NULL,
  trello_list_name TEXT NOT NULL,
  trello_card_id TEXT NOT NULL,
  trello_card_name TEXT NOT NULL,
  added_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A card can only be tracked once per client
CREATE UNIQUE INDEX idx_ctc_client_card ON client_trello_cards (client_id, trello_card_id);
CREATE INDEX idx_ctc_client ON client_trello_cards (client_id);
CREATE INDEX idx_ctc_card ON client_trello_cards (trello_card_id);

-- RLS
ALTER TABLE client_trello_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ctc_select" ON client_trello_cards FOR SELECT TO authenticated USING (true);
CREATE POLICY "ctc_insert" ON client_trello_cards FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ctc_delete" ON client_trello_cards FOR DELETE TO authenticated USING (true);
