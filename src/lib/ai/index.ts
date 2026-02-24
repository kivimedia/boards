export {
  getProviderKey,
  touchApiKey,
  createAnthropicClient,
  createOpenAIClient,
  createGoogleAIClient,
  getProviderClient,
  isProviderConfigured,
  getConfiguredProviders,
} from './providers';

export {
  MODEL_PRICING,
  getModelPricing,
  calculateCost,
  logUsage,
  getMonthlySpend,
  getUsageSummary,
} from './cost-tracker';
export type { LogUsageParams } from './cost-tracker';

export {
  getBudgetConfig,
  checkBudgetStatus,
  canMakeAICall,
  getAllBudgetStatuses,
} from './budget-checker';

export {
  resolveModel,
  getAllModelConfigs,
  updateModelConfig,
  resolveModelWithFallback,
  getDefaultConfig,
  getAllActivities,
  ACTIVITY_LABELS,
} from './model-resolver';

export {
  SYSTEM_PROMPTS,
  getSystemPrompt,
  buildPrompt,
  buildEmailDraftPrompt,
} from './prompt-templates';

export {
  buildTicketContext,
  buildBoardContext,
  buildGlobalContext,
  formatContextForPrompt,
  sendChatMessage,
  getChatSessions,
  getChatSession,
  archiveChatSession,
  deleteChatSession,
} from './chatbot';
export type { ChatSendInput, ChatSendOutput } from './chatbot';

export {
  getModelPricing as getModelPricingRows,
  upsertModelPricing,
  getActivityConfigs,
  resolveModelForActivity,
  createActivityConfig,
  updateActivityConfig,
  deleteActivityConfig,
  getBudgetAlerts,
  createBudgetAlert,
  updateBudgetAlert,
  checkBudgetAlerts,
  getCostSummary,
  calculateCost as calculateModelCost,
} from './cost-profiling';
