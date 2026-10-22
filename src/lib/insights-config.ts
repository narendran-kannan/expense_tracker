import type { InsightStats } from "@/lib/insights-stats-pure";
import type { InsightOutput } from "@/lib/schemas";
import { AI_MODELS } from "@/lib/ai-config";

export const INSIGHTS_MODEL = AI_MODELS.insights;
export const MIN_TRANSACTIONS_FOR_INSIGHTS = 5;

export interface InsightResult {
  status: "ok" | "not_enough_data";
  cached: boolean;
  stats: InsightStats;
  insight: (InsightOutput & { model: string; generatedAt: string }) | null;
  reason?: "not_enough_data";
}
