-- Migration 030: Performance Optimization Indexes (P5.3)
-- Adds strategic indexes for cursor-based pagination and N+1 query fixes

-- Card placements: the most queried join
CREATE INDEX IF NOT EXISTS idx_card_placements_board_list ON card_placements(board_id, list_id, position);
CREATE INDEX IF NOT EXISTS idx_card_placements_card ON card_placements(card_id);

-- Cards: cursor-based pagination support
CREATE INDEX IF NOT EXISTS idx_cards_created_at ON cards(created_at);
CREATE INDEX IF NOT EXISTS idx_cards_updated_at ON cards(updated_at);

-- Labels / assignees join optimization
CREATE INDEX IF NOT EXISTS idx_card_labels_card ON card_labels(card_id);
CREATE INDEX IF NOT EXISTS idx_card_assignees_card ON card_assignees(card_id);

-- Comments: card lookup
CREATE INDEX IF NOT EXISTS idx_comments_card ON comments(card_id, created_at);

-- Activity log: card and board lookup
CREATE INDEX IF NOT EXISTS idx_activity_log_card ON activity_log(card_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_log_board ON activity_log(board_id, created_at);

-- Custom fields: board and card lookup
CREATE INDEX IF NOT EXISTS idx_custom_field_defs_board ON custom_field_definitions(board_id);
CREATE INDEX IF NOT EXISTS idx_custom_field_values_card ON custom_field_values(card_id);

-- Board column history: productivity queries
CREATE INDEX IF NOT EXISTS idx_card_column_history_board_date ON card_column_history(board_id, moved_at);
CREATE INDEX IF NOT EXISTS idx_card_column_history_card ON card_column_history(card_id, moved_at);

-- Notifications: unread count
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = false;
