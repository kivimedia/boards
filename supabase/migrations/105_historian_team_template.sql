-- 105: Seed Historian team template into agent_team_templates
-- The historian agent skills were already seeded in agent-skill-seeds.ts
-- but the team template was never added to agent_team_templates

INSERT INTO agent_team_templates (slug, name, description, icon, phases, is_active)
VALUES (
  'historian',
  'Historian',
  'AI-powered image archive pipeline - collect images from Slack, analyze with vision, clean up, and publish to client gallery',
  'camera',
  '[
    {"name": "Collect Images", "skill_slug": "historian-collector"},
    {"name": "Analyze & Score", "skill_slug": "historian-analyzer"},
    {"name": "Review Results", "is_gate": true},
    {"name": "Visual Cleanup", "skill_slug": "historian-sidekick"},
    {"name": "Publish Gallery", "skill_slug": "historian-portal"},
    {"name": "Final Approval", "is_gate": true}
  ]'::jsonb,
  true
) ON CONFLICT (slug) DO NOTHING;
