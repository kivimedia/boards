# Agent Skills — End-to-End Implementation Plan

## Context

We have 16 marketing AI skills (10 Skills Pack + 6 Creative Pack) from two zip files that were analyzed, quality-rated, and 4 were rewritten. The backend schema, engine, seed data, API routes, and 3 UI components were built in a previous session. **The goal is to make this fully functional end-to-end**: a user opens a card, picks a skill, hits Run, the agent executes using Claude with the skill's system_prompt, and streams the output back in real-time. Separately, a Skills Management page lets admins view/edit/optimize skills over time as part of KM.

## What Already Exists

| Layer | File | Status |
|-------|------|--------|
| DB migration | `supabase/migrations/039_agent_skills_system.sql` | Written, **NOT applied** |
| Types | `src/lib/types.ts` (lines 2088-2280) | Done |
| Engine CRUD | `src/lib/agent-engine.ts` | Done |
| Seed data | `src/lib/agent-skill-seeds.ts` | Done (16 skills + improvement log) |
| API: skills | `src/app/api/agents/skills/route.ts` | Done (GET list, POST seed/create) |
| API: dashboard | `src/app/api/agents/dashboard/route.ts` | Done |
| API: card tasks | `src/app/api/cards/[id]/agent-tasks/route.ts` | Done (CRUD) |
| UI: Dashboard | `src/components/agents/SkillQualityDashboard.tsx` | Done (487 lines) |
| UI: Board agents | `src/components/agents/BoardAgentsList.tsx` | Done (215 lines) |
| UI: Card tasks | `src/components/agents/CardAgentTasksPanel.tsx` | Done (300 lines, no Run button) |

## What's Missing

1. **Migration not applied** — tables don't exist in Supabase yet
2. **Execution engine** — no code to actually call Claude with skill prompt + card context
3. **Run/execute API route** — no endpoint to trigger agent execution
4. **Board agents API routes** — `BoardAgentsList` component calls routes that don't exist
5. **"Run" button** on card tasks panel — can add/delete tasks but not execute them
6. **CardModal integration** — `CardAgentTasksPanel` not rendered in the card modal tabs
7. **Settings page** — `SkillQualityDashboard` has no route/page
8. **Streaming output** — agent should stream tokens to UI in real-time

---

## Implementation Plan (5 phases)

### Phase 1: Database & Seed (foundation)

**1a. Apply migration 039 to Supabase**
- Run `039_agent_skills_system.sql` against the live database
- Creates: `agent_skills`, `board_agents`, `agent_executions`, `agent_tool_calls`, `card_agent_tasks`, `skill_improvement_log`
- Verify tables exist and RLS policies are active

**1b. Seed the 16 skills**
- Hit `POST /api/agents/skills` with `{ action: 'seed' }` via curl or browser
- Verify skills appear in `agent_skills` table

---

### Phase 2: Missing API Routes

**2a. Board agents routes** — `src/app/api/boards/[id]/agents/route.ts`
- `GET` — list board agents (calls `listBoardAgents()` from agent-engine)
- `POST` — add skill to board (calls `addAgentToBoard()`)
- Pattern: follow `src/app/api/boards/[id]/members/route.ts`

**2b. Board agent single route** — `src/app/api/boards/[id]/agents/[agentId]/route.ts`
- `PUT` — update board agent (toggle active, change config)
- `DELETE` — remove agent from board
- Pattern: standard auth + `updateBoardAgent()` / `removeAgentFromBoard()`

**2c. Agent execution route** — `src/app/api/cards/[id]/agent-tasks/[taskId]/run/route.ts`
- `POST` — triggers execution of a card agent task
- **Streaming SSE response** (same pattern as migration backfill)
- Flow:
  1. Load the task + skill from DB
  2. Load card context (title, description, comments, brief, labels, custom fields)
  3. Check AI budget via `canMakeAICall()`
  4. Create execution record via `createExecution()`
  5. Update task status to 'running'
  6. Call Claude with skill's `system_prompt` + card context as user message
  7. Stream tokens back via SSE
  8. On complete: save output to task, complete execution record, log usage
  9. On error: mark task/execution as failed

---

### Phase 3: Execution Engine

**3a. Create `src/lib/ai/agent-executor.ts`**

Core function: `executeAgentSkill()`
```
Input: supabase, { taskId, skillId, boardAgentId, cardId, userId, inputPrompt }
Output: streaming via callback onToken(text)
```

- Builds card context: query card details, comments, brief, labels, checklist items
- Constructs messages: skill `system_prompt` as system message, card context + user prompt as user message
- Uses `createAnthropicClient()` from `src/lib/ai/providers.ts`
- Uses `client.messages.stream()` pattern from `src/lib/ai/chatbot-stream.ts`
- Tracks tokens via `finalMessage.usage`
- Logs cost via existing `logUsage()` from `src/lib/ai/cost-tracker.ts`
- Updates `agent_executions` and `card_agent_tasks` records
- Supports `model_preference` from `board_agents` table (anthropic/openai/google)

**Key files to reuse:**
- `src/lib/ai/providers.ts` — `createAnthropicClient()`
- `src/lib/ai/chatbot-stream.ts` — streaming pattern (lines 252-298)
- `src/lib/ai/budget-checker.ts` — `canMakeAICall()`
- `src/lib/ai/cost-tracker.ts` — `logUsage()`
- `src/lib/agent-engine.ts` — `createExecution()`, `completeExecution()`

---

### Phase 4: Frontend Integration

**4a. Add "Agents" tab to CardModal**
- File: `src/components/card/CardModal.tsx`
- Add `'agents'` to the `Tab` type union (line 36)
- Add `AGENTS_TAB` constant: `{ key: 'agents', label: 'Agents', icon: '🤖' }`
- Show tab always (or conditionally based on board having agents enabled)
- Render `<CardAgentTasksPanel cardId={cardId} />` when tab active
- Import from `@/components/agents/CardAgentTasksPanel`

**4b. Add "Run" button to CardAgentTasksPanel**
- File: `src/components/agents/CardAgentTasksPanel.tsx`
- Add a "Run" button (play icon) next to each pending/failed task
- On click: POST to `/api/cards/{cardId}/agent-tasks/{taskId}/run`
- Open SSE connection, stream tokens into the task's output area
- Show real-time typing animation while streaming
- On complete: update task status, show full output, enable rating
- Handle errors gracefully

**4c. Add Skills Management page**
- Create `src/app/settings/agents/page.tsx`
- Render `<SkillQualityDashboard />` component
- Add nav link in settings layout/page
- Add "Seed Default Skills" and "Apply Improvements" buttons (already in component)

**4d. Wire BoardAgentsList into board settings** (if board settings UI exists)
- Find where board settings are rendered
- Add `<BoardAgentsList boardId={boardId} />` section
- Or: add as a section in the board header menu

---

### Phase 5: Polish & Testing

**5a. Verify end-to-end flow**
1. Navigate to Settings > Agents, seed skills
2. Open a board, go to board settings, add some skills
3. Open a card, go to Agents tab
4. Create a task (pick a skill, add instructions)
5. Click Run — verify streaming output appears
6. Rate the output
7. Check dashboard shows execution stats

**5b. Edge cases**
- No API key configured → show friendly error
- Budget exceeded → show budget error
- Skill has `requires_mcp_tools` → show fallback message
- Network timeout during streaming → handle reconnection
- Card with no content → agent should still work (minimal context)

---

## File Changes Summary

| Action | File |
|--------|------|
| **RUN** | `supabase/migrations/039_agent_skills_system.sql` (apply to DB) |
| **CREATE** | `src/app/api/boards/[id]/agents/route.ts` |
| **CREATE** | `src/app/api/boards/[id]/agents/[agentId]/route.ts` |
| **CREATE** | `src/app/api/cards/[id]/agent-tasks/[taskId]/run/route.ts` |
| **CREATE** | `src/lib/ai/agent-executor.ts` |
| **CREATE** | `src/app/settings/agents/page.tsx` |
| **EDIT** | `src/components/card/CardModal.tsx` (add Agents tab) |
| **EDIT** | `src/components/agents/CardAgentTasksPanel.tsx` (add Run button + streaming) |
| **EDIT** | `src/app/settings/page.tsx` (add Agents link) |

## Persistent Plan Location
This plan is saved at: `C:\Users\raviv\.claude\plans\async-jingling-cookie.md`
Also copy to project root as: `AGENT-PLAN.md` (for future sessions)
