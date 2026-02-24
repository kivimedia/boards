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
  buildDesignReviewPrompt,
  buildDevQAPrompt,
  buildEmailDraftPrompt,
} from './prompt-templates';

export {
  extractChangeRequests,
  getAttachmentUrl,
  downloadImageAsBase64,
  isImageAttachment,
  runDesignReview,
  parseReviewResponse,
  storeReviewResult,
  overrideReviewVerdict,
  getCardReviewHistory,
} from './design-review';
export type { ReviewInput, ReviewOutput } from './design-review';

export {
  QA_VIEWPORTS,
  captureScreenshots,
  uploadScreenshots,
  runDevQA,
  parseQAResponse,
  countFindings,
  scoreToStatus,
  storeQAResult,
  getCardQAHistory,
} from './dev-qa';
export type { QAInput, QAOutput } from './dev-qa';

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
  chunkText,
  generateEmbedding,
  generateEmbeddings,
  indexDocument,
  autoIndexCard,
  searchBrain,
  queryClientBrain,
  getClientDocuments,
  getClientQueryHistory,
  deactivateDocument,
  getClientBrainStats,
} from './client-brain';
export type { IndexDocumentInput, BrainQueryInput, BrainQueryOutput } from './client-brain';

export {
  editImage,
  generateImage,
  saveNanoBananaResult,
} from './nano-banana';
export type { NanoBananaEditInput, NanoBananaGenerateInput, NanoBananaOutput } from './nano-banana';

export {
  generateVideo,
  getCardVideoGenerations,
  getVideoGeneration,
  getUserVideoGenerations,
  deleteVideoGeneration,
} from './video-generation';

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
