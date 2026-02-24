import { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';


/**
 * Stub -- agent executor was removed during the Carolina Balloons HQ pivot.
 * This export satisfies the import in api/agents/sessions/[id]/message/route.ts.
 */

interface ExecuteOptions {
  skillId: string;
  boardId?: string;
  userId: string;
  systemPrompt: string;
  messageHistory: Anthropic.MessageParam[];
  newUserMessage: string;
}

interface ExecuteCallbacks {
  onToken: (text: string) => void;
  onComplete: () => void;
  onError: (error: string) => void;
  onToolCall: (name: string, input: unknown) => void;
  onToolResult: (name: string, result: string, success: boolean) => void;
  onThinking: (summary: string) => void;
}

interface ExecuteResult {
  updatedMessageHistory: Anthropic.MessageParam[];
  fullOutput: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  toolCallCount: number;
}

export async function executeAgentConversation(
  _supabase: SupabaseClient,
  options: ExecuteOptions,
  callbacks: ExecuteCallbacks
): Promise<ExecuteResult> {
  callbacks.onError('Agent executor is not available in this build.');
  return {
    updatedMessageHistory: [
      ...options.messageHistory,
      { role: 'user', content: options.newUserMessage },
      { role: 'assistant', content: 'Agent executor is not available in this build.' },
    ],
    fullOutput: 'Agent executor is not available in this build.',
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    toolCallCount: 0,
  };
}
