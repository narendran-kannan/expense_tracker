import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { AI_MODELS, AI_PRIVACY, type AiModelKind } from "@/lib/ai-config";

/**
 * OpenRouter is the single AI provider for this app (replaced @ai-sdk/google).
 *
 * The client is created lazily so that importing this module during a build or
 * in a unit test that never calls the model does not require an API key.
 */
let client: ReturnType<typeof createOpenRouter> | undefined;

export function getOpenRouter() {
  if (!client) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENROUTER_API_KEY is not set. Add it to .env (see .env.example)."
      );
    }
    client = createOpenRouter({
      apiKey,
      appName: "expense-tracker",
      appUrl: process.env.AUTH_URL ?? "http://localhost:3003",
      // We talk to the OpenRouter API directly (not a 3rd-party compatible gateway).
      compatibility: "strict",
    });
  }
  return client;
}

/**
 * Resolve the language model for a task.
 *
 * - `strict: true` keeps OpenRouter's JSON-schema mode strict, which is what
 *   `generateObject` relies on for reliable structured output.
 * - `provider.zdr` / `provider.data_collection` enforce the privacy policy from
 *   `AI_PRIVACY`: no prompt retention upstream and no training on the data.
 *   If no endpoint for the model satisfies the policy, OpenRouter returns
 *   "No endpoints found matching your data policy" instead of quietly falling
 *   back to a retaining provider.
 */
export function getAiModel(kind: AiModelKind = "extraction"): LanguageModel {
  const policy = AI_PRIVACY[kind];
  return getOpenRouter()(AI_MODELS[kind], {
    structuredOutputs: { strict: true },
    provider: {
      zdr: policy.zdr,
      data_collection: policy.dataCollectionDeny ? "deny" : "allow",
    },
  });
}

/** Convenience wrappers so call sites read like the old `google(...)` ones. */
export const extractionModel = () => getAiModel("extraction");
export const insightsModel = () => getAiModel("insights");

/** Test seam: clear the memoised client between tests. */
export function resetOpenRouterClient() {
  client = undefined;
}
