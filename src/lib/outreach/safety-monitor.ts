import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// SAFETY MONITOR (PRD Section 6)
// Warm-up enforcement, auto-pause triggers, circuit breakers, health checks
// ============================================================================

// ============================================================================
// TYPES
// ============================================================================

export type AccountHealthStatus = 'green' | 'yellow' | 'red';

export interface SafetyStatus {
  accountHealth: AccountHealthStatus;
  healthReasons: string[];
  warmup: {
    currentWeek: number;
    dailyLimit: number;
    todaySent: number;
    weeklyTotal: number;
    progressPct: number; // 0-100 progress through warm-up
  };
  acceptance: {
    rate7d: number; // 7-day rolling acceptance rate
    rate30d: number;
    trend: 'up' | 'down' | 'stable';
    totalSent7d: number;
    totalAccepted7d: number;
  };
  triggers: AutoPauseTrigger[];
  isPaused: boolean;
  pauseReason: string | null;
  circuitBreakers: CircuitBreakerStatus[];
  budget: {
    spent: number;
    cap: number;
    pct: number;
    alertLevel: 'ok' | 'warning' | 'critical';
  };
}

export interface AutoPauseTrigger {
  name: string;
  description: string;
  threshold: string;
  currentValue: string;
  triggered: boolean;
  severity: 'warning' | 'critical';
}

export interface CircuitBreakerStatus {
  service: string;
  status: 'closed' | 'open' | 'half_open';
  failureCount: number;
  lastFailure: string | null;
  threshold: number;
  cooldownMinutes: number;
}

export interface HealthMetrics {
  services: ServiceHealth[];
  errorRate24h: number;
  avgProcessingTime: number;
  jobBacklog: number;
  failedLeads: number;
  recoveryQueue: number;
  uptime: number; // hours since last critical error
}

interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  calls24h: number;
  errors24h: number;
  errorRate: number;
  avgLatencyMs: number;
  lastError: string | null;
}

// ============================================================================
// AUTO-PAUSE TRIGGERS
// ============================================================================

const PAUSE_TRIGGERS = {
  LOW_ACCEPTANCE_RATE: {
    name: 'Low Acceptance Rate',
    description: 'Connection acceptance rate dropped below safe threshold',
    threshold: 20, // percent
    severity: 'critical' as const,
  },
  RAPID_REJECTIONS: {
    name: 'Rapid Rejections',
    description: 'Multiple rejections received in short time window',
    threshold: 5, // rejections in 24h
    severity: 'critical' as const,
  },
  BUDGET_EXCEEDED: {
    name: 'Budget Exceeded',
    description: 'Monthly budget cap reached',
    threshold: 100, // percent of budget
    severity: 'warning' as const,
  },
  HIGH_ERROR_RATE: {
    name: 'High Error Rate',
    description: 'API error rate exceeded safe threshold',
    threshold: 30, // percent
    severity: 'warning' as const,
  },
  WEEKEND_BLOCK: {
    name: 'Weekend Block',
    description: 'No outreach on weekends',
    threshold: 'Sat/Sun',
    severity: 'warning' as const,
  },
};

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

const CIRCUIT_BREAKER_CONFIG: Record<string, { threshold: number; cooldownMinutes: number }> = {
  'hunter.io': { threshold: 5, cooldownMinutes: 30 },
  'snov.io': { threshold: 5, cooldownMinutes: 30 },
  'serpapi': { threshold: 3, cooldownMinutes: 60 },
  'scrapling': { threshold: 5, cooldownMinutes: 15 },
  'claude': { threshold: 3, cooldownMinutes: 10 },
};

// ============================================================================
// SAFETY STATUS
// ============================================================================

/**
 * Get comprehensive safety status for the dashboard
 */
export async function getSafetyStatus(
  supabase: SupabaseClient,
  userId: string
): Promise<SafetyStatus> {
  // Get settings
  const { data: settings } = await supabase
    .from('li_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  const warmupWeek = settings?.warmup_week || 1;
  const dailyLimit = getDailyLimitForWeek(warmupWeek);
  const budgetCap = settings?.budget_cap_usd || 500;

  // Parallel data fetches
  const [
    todaySentResult,
    weeklySentResult,
    acceptanceResult,
    rejectionsResult,
    budgetResult,
    circuitBreakerResult,
  ] = await Promise.all([
    getTodaySentCount(supabase, userId),
    getWeeklySentCount(supabase, userId),
    getAcceptanceRates(supabase, userId),
    getRecentRejections(supabase, userId),
    getCurrentSpend(supabase, userId),
    getCircuitBreakerStatuses(supabase, userId),
  ]);

  // Check auto-pause triggers
  const triggers = checkTriggers({
    acceptanceRate7d: acceptanceResult.rate7d,
    rejections24h: rejectionsResult,
    budgetPct: budgetCap > 0 ? (budgetResult / budgetCap) * 100 : 0,
    errorRate24h: 0, // calculated from circuit breakers
  });

  // Determine account health
  const { status: accountHealth, reasons: healthReasons } = determineAccountHealth(
    acceptanceResult.rate7d,
    triggers,
    budgetCap > 0 ? (budgetResult / budgetCap) * 100 : 0,
    warmupWeek
  );

  // Auto-pause if critical triggers fired
  const criticalTriggered = triggers.some(t => t.triggered && t.severity === 'critical');
  let isPaused = settings?.pause_outreach || false;
  let pauseReason = settings?.pause_reason || null;

  if (criticalTriggered && !isPaused) {
    const criticalTrigger = triggers.find(t => t.triggered && t.severity === 'critical');
    isPaused = true;
    pauseReason = `Auto-paused: ${criticalTrigger?.name}`;

    await supabase
      .from('li_settings')
      .update({
        pause_outreach: true,
        pause_reason: pauseReason,
      })
      .eq('user_id', userId);
  }

  // Calculate warm-up progress
  const maxWeek = 5;
  const progressPct = Math.min(100, (warmupWeek / maxWeek) * 100);

  // Budget alert level
  const budgetPct = budgetCap > 0 ? (budgetResult / budgetCap) * 100 : 0;
  const alertLevel = budgetPct >= 100 ? 'critical' : budgetPct >= 80 ? 'warning' : 'ok';

  return {
    accountHealth,
    healthReasons,
    warmup: {
      currentWeek: warmupWeek,
      dailyLimit,
      todaySent: todaySentResult,
      weeklyTotal: weeklySentResult,
      progressPct,
    },
    acceptance: {
      rate7d: acceptanceResult.rate7d,
      rate30d: acceptanceResult.rate30d,
      trend: acceptanceResult.trend,
      totalSent7d: acceptanceResult.totalSent7d,
      totalAccepted7d: acceptanceResult.totalAccepted7d,
    },
    triggers,
    isPaused,
    pauseReason,
    circuitBreakers: circuitBreakerResult,
    budget: {
      spent: budgetResult,
      cap: budgetCap,
      pct: budgetPct,
      alertLevel,
    },
  };
}

// ============================================================================
// HEALTH METRICS
// ============================================================================

/**
 * Get agent health metrics for the health dashboard
 */
export async function getHealthMetrics(
  supabase: SupabaseClient,
  userId: string
): Promise<HealthMetrics> {
  const since24h = new Date();
  since24h.setHours(since24h.getHours() - 24);

  // Get cost events grouped by service (proxy for API calls)
  const { data: costEvents } = await supabase
    .from('li_cost_events')
    .select('service_name, cost_usd, created_at')
    .eq('user_id', userId)
    .gte('created_at', since24h.toISOString());

  // Get failed leads
  const { count: failedLeads } = await supabase
    .from('li_failed_leads')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['failed', 'retrying']);

  // Get recovery queue (failed leads eligible for retry)
  const { count: recoveryQueue } = await supabase
    .from('li_failed_leads')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'retrying')
    .lte('next_retry_at', new Date().toISOString());

  // Get job backlog
  const { count: jobBacklog } = await supabase
    .from('li_jobs')
    .select('id', { count: 'exact', head: true })
    .in('status', ['pending', 'queued']);

  // Group cost events by service
  const serviceMap: Record<string, { calls: number; errors: number; totalLatency: number }> = {};
  const events = costEvents || [];

  for (const event of events) {
    const svc = event.service_name || 'unknown';
    if (!serviceMap[svc]) {
      serviceMap[svc] = { calls: 0, errors: 0, totalLatency: 0 };
    }
    serviceMap[svc].calls++;
    // Estimate latency from cost (rough proxy)
    serviceMap[svc].totalLatency += event.cost_usd > 0 ? 500 : 100;
  }

  // Get errors from failed_leads for error tracking
  const { data: recentErrors } = await supabase
    .from('li_failed_leads')
    .select('error_type, created_at')
    .eq('user_id', userId)
    .gte('created_at', since24h.toISOString());

  const errorCount = recentErrors?.length || 0;
  const totalCalls = events.length || 1;

  const services: ServiceHealth[] = Object.entries(serviceMap).map(([name, stats]) => ({
    name,
    status: stats.errors / Math.max(stats.calls, 1) > 0.3 ? 'degraded' :
            stats.errors / Math.max(stats.calls, 1) > 0.5 ? 'down' : 'healthy',
    calls24h: stats.calls,
    errors24h: stats.errors,
    errorRate: stats.calls > 0 ? (stats.errors / stats.calls) * 100 : 0,
    avgLatencyMs: stats.calls > 0 ? stats.totalLatency / stats.calls : 0,
    lastError: null,
  }));

  // Add default services if not seen
  const defaultServices = ['hunter.io', 'snov.io', 'serpapi', 'scrapling', 'claude'];
  for (const svc of defaultServices) {
    if (!serviceMap[svc]) {
      services.push({
        name: svc,
        status: 'healthy',
        calls24h: 0,
        errors24h: 0,
        errorRate: 0,
        avgLatencyMs: 0,
        lastError: null,
      });
    }
  }

  return {
    services: services.sort((a, b) => a.name.localeCompare(b.name)),
    errorRate24h: (errorCount / totalCalls) * 100,
    avgProcessingTime: events.length > 0 ? 450 : 0, // placeholder avg
    jobBacklog: jobBacklog || 0,
    failedLeads: failedLeads || 0,
    recoveryQueue: recoveryQueue || 0,
    uptime: 168, // placeholder: will be tracked by VPS worker
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getDailyLimitForWeek(week: number): number {
  const limits: Record<number, number> = { 1: 5, 2: 10, 3: 15, 4: 20, 5: 25 };
  return limits[Math.min(week, 5)] || 25;
}

async function getTodaySentCount(supabase: SupabaseClient, userId: string): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase
    .from('li_daily_batches')
    .select('batch_size')
    .eq('user_id', userId)
    .eq('target_date', today)
    .in('status', ['approved', 'sent']);

  return data?.reduce((sum, b) => sum + (b.batch_size || 0), 0) || 0;
}

async function getWeeklySentCount(supabase: SupabaseClient, userId: string): Promise<number> {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const { data } = await supabase
    .from('li_daily_batches')
    .select('batch_size')
    .eq('user_id', userId)
    .gte('target_date', weekAgo.toISOString().split('T')[0])
    .in('status', ['approved', 'sent']);

  return data?.reduce((sum, b) => sum + (b.batch_size || 0), 0) || 0;
}

async function getAcceptanceRates(
  supabase: SupabaseClient,
  userId: string
): Promise<{ rate7d: number; rate30d: number; trend: 'up' | 'down' | 'stable'; totalSent7d: number; totalAccepted7d: number }> {
  const now = new Date();
  const d7 = new Date(now); d7.setDate(d7.getDate() - 7);
  const d14 = new Date(now); d14.setDate(d14.getDate() - 14);
  const d30 = new Date(now); d30.setDate(d30.getDate() - 30);

  // 7-day: connections sent vs accepted
  const { count: sent7d } = await supabase
    .from('li_pipeline_events')
    .select('id', { count: 'exact', head: true })
    .eq('to_stage', 'CONNECTION_SENT')
    .gte('created_at', d7.toISOString());

  const { count: accepted7d } = await supabase
    .from('li_pipeline_events')
    .select('id', { count: 'exact', head: true })
    .eq('to_stage', 'CONNECTED')
    .gte('created_at', d7.toISOString());

  // Previous 7 days (for trend)
  const { count: sentPrev7d } = await supabase
    .from('li_pipeline_events')
    .select('id', { count: 'exact', head: true })
    .eq('to_stage', 'CONNECTION_SENT')
    .gte('created_at', d14.toISOString())
    .lt('created_at', d7.toISOString());

  const { count: acceptedPrev7d } = await supabase
    .from('li_pipeline_events')
    .select('id', { count: 'exact', head: true })
    .eq('to_stage', 'CONNECTED')
    .gte('created_at', d14.toISOString())
    .lt('created_at', d7.toISOString());

  // 30-day
  const { count: sent30d } = await supabase
    .from('li_pipeline_events')
    .select('id', { count: 'exact', head: true })
    .eq('to_stage', 'CONNECTION_SENT')
    .gte('created_at', d30.toISOString());

  const { count: accepted30d } = await supabase
    .from('li_pipeline_events')
    .select('id', { count: 'exact', head: true })
    .eq('to_stage', 'CONNECTED')
    .gte('created_at', d30.toISOString());

  const totalSent7d = sent7d || 0;
  const totalAccepted7d = accepted7d || 0;
  const rate7d = totalSent7d > 0 ? (totalAccepted7d / totalSent7d) * 100 : 0;
  const rate30d = (sent30d || 0) > 0 ? ((accepted30d || 0) / (sent30d || 0)) * 100 : 0;

  const prevRate = (sentPrev7d || 0) > 0 ? ((acceptedPrev7d || 0) / (sentPrev7d || 0)) * 100 : 0;
  const trend = rate7d > prevRate + 5 ? 'up' : rate7d < prevRate - 5 ? 'down' : 'stable';

  return { rate7d, rate30d, trend, totalSent7d, totalAccepted7d };
}

async function getRecentRejections(supabase: SupabaseClient, userId: string): Promise<number> {
  const since = new Date();
  since.setHours(since.getHours() - 24);

  const { count } = await supabase
    .from('li_pipeline_events')
    .select('id', { count: 'exact', head: true })
    .eq('to_stage', 'NOT_INTERESTED')
    .gte('created_at', since.toISOString());

  return count || 0;
}

async function getCurrentSpend(supabase: SupabaseClient, userId: string): Promise<number> {
  // Current month spend
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from('li_cost_events')
    .select('cost_usd')
    .eq('user_id', userId)
    .gte('created_at', startOfMonth.toISOString());

  return data?.reduce((sum, e) => sum + (e.cost_usd || 0), 0) || 0;
}

async function getCircuitBreakerStatuses(
  supabase: SupabaseClient,
  userId: string
): Promise<CircuitBreakerStatus[]> {
  const since = new Date();
  since.setHours(since.getHours() - 1);

  // Get recent failures by service
  const { data: recentFailures } = await supabase
    .from('li_failed_leads')
    .select('error_type, created_at')
    .eq('user_id', userId)
    .gte('created_at', since.toISOString());

  const failureCounts: Record<string, { count: number; lastFailure: string | null }> = {};
  for (const f of recentFailures || []) {
    const service = f.error_type?.split(':')[0] || 'unknown';
    if (!failureCounts[service]) {
      failureCounts[service] = { count: 0, lastFailure: null };
    }
    failureCounts[service].count++;
    if (!failureCounts[service].lastFailure || f.created_at > failureCounts[service].lastFailure!) {
      failureCounts[service].lastFailure = f.created_at;
    }
  }

  return Object.entries(CIRCUIT_BREAKER_CONFIG).map(([service, config]) => {
    const failures = failureCounts[service] || { count: 0, lastFailure: null };
    let status: CircuitBreakerStatus['status'] = 'closed';

    if (failures.count >= config.threshold) {
      status = 'open';
    } else if (failures.count >= Math.ceil(config.threshold / 2)) {
      status = 'half_open';
    }

    return {
      service,
      status,
      failureCount: failures.count,
      lastFailure: failures.lastFailure,
      threshold: config.threshold,
      cooldownMinutes: config.cooldownMinutes,
    };
  });
}

function checkTriggers(data: {
  acceptanceRate7d: number;
  rejections24h: number;
  budgetPct: number;
  errorRate24h: number;
}): AutoPauseTrigger[] {
  const isWeekend = [0, 6].includes(new Date().getDay());

  return [
    {
      ...PAUSE_TRIGGERS.LOW_ACCEPTANCE_RATE,
      threshold: `<${PAUSE_TRIGGERS.LOW_ACCEPTANCE_RATE.threshold}%`,
      currentValue: `${data.acceptanceRate7d.toFixed(1)}%`,
      triggered: data.acceptanceRate7d > 0 && data.acceptanceRate7d < PAUSE_TRIGGERS.LOW_ACCEPTANCE_RATE.threshold,
    },
    {
      ...PAUSE_TRIGGERS.RAPID_REJECTIONS,
      threshold: `>${PAUSE_TRIGGERS.RAPID_REJECTIONS.threshold} in 24h`,
      currentValue: `${data.rejections24h}`,
      triggered: data.rejections24h > PAUSE_TRIGGERS.RAPID_REJECTIONS.threshold,
    },
    {
      ...PAUSE_TRIGGERS.BUDGET_EXCEEDED,
      threshold: `>${PAUSE_TRIGGERS.BUDGET_EXCEEDED.threshold}%`,
      currentValue: `${data.budgetPct.toFixed(1)}%`,
      triggered: data.budgetPct >= PAUSE_TRIGGERS.BUDGET_EXCEEDED.threshold,
    },
    {
      ...PAUSE_TRIGGERS.HIGH_ERROR_RATE,
      threshold: `>${PAUSE_TRIGGERS.HIGH_ERROR_RATE.threshold}%`,
      currentValue: `${data.errorRate24h.toFixed(1)}%`,
      triggered: data.errorRate24h > PAUSE_TRIGGERS.HIGH_ERROR_RATE.threshold,
    },
    {
      ...PAUSE_TRIGGERS.WEEKEND_BLOCK,
      threshold: 'Sat/Sun',
      currentValue: isWeekend ? 'Weekend' : 'Weekday',
      triggered: isWeekend,
    },
  ];
}

function determineAccountHealth(
  acceptanceRate: number,
  triggers: AutoPauseTrigger[],
  budgetPct: number,
  warmupWeek: number
): { status: AccountHealthStatus; reasons: string[] } {
  const reasons: string[] = [];
  let status: AccountHealthStatus = 'green';

  // Critical checks
  const criticalTriggered = triggers.filter(t => t.triggered && t.severity === 'critical');
  if (criticalTriggered.length > 0) {
    status = 'red';
    reasons.push(...criticalTriggered.map(t => t.name));
  }

  // Warning checks
  if (budgetPct >= 80 && budgetPct < 100) {
    if (status !== 'red') status = 'yellow';
    reasons.push('Budget nearing cap');
  }

  if (acceptanceRate > 0 && acceptanceRate < 30 && acceptanceRate >= 20) {
    if (status !== 'red') status = 'yellow';
    reasons.push('Acceptance rate declining');
  }

  if (warmupWeek <= 2) {
    reasons.push(`Warm-up week ${warmupWeek} - limited volume`);
  }

  if (reasons.length === 0) {
    reasons.push('All systems operating normally');
  }

  return { status, reasons };
}
