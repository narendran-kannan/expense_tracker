import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: vi.fn(() => {
    const provider = (modelId: string, settings?: unknown) => ({
      modelId,
      settings,
    });
    return provider;
  }),
}));

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("ai config", () => {
  it("defaults the extraction model to the benchmark winner", async () => {
    const { AI_MODELS } = await import("./ai-config");
    expect(AI_MODELS.extraction).toBe("deepseek/deepseek-v4.1-flash-1017");
    // every default must have ZDR endpoints while AI_PRIVACY.zdr is on
    expect(AI_MODELS.insights).toBe("google/gemini-3.5-flash-lite");
  });

  it("enforces ZDR and no data collection by default", async () => {
    const { AI_PRIVACY } = await import("./ai-config");
    expect(AI_PRIVACY).toEqual({
      extraction: { zdr: true, dataCollectionDeny: true },
      insights: { zdr: true, dataCollectionDeny: true },
    });
  });

  it("can relax the privacy policy explicitly", async () => {
    vi.stubEnv("OPENROUTER_ZDR", "false");
    vi.stubEnv("OPENROUTER_DENY_DATA_COLLECTION", "false");
    const { AI_PRIVACY } = await import("./ai-config");
    expect(AI_PRIVACY.extraction).toEqual({ zdr: false, dataCollectionDeny: false });
    expect(AI_PRIVACY.insights).toEqual({ zdr: false, dataCollectionDeny: false });
  });

  it("can relax ZDR for insights only, keeping extraction strict", async () => {
    vi.stubEnv("OPENROUTER_ZDR_INSIGHTS", "false");
    const { AI_PRIVACY } = await import("./ai-config");
    expect(AI_PRIVACY.extraction.zdr).toBe(true);
    expect(AI_PRIVACY.insights.zdr).toBe(false);
    expect(AI_PRIVACY.insights.dataCollectionDeny).toBe(true);
  });

  it("honours OPENROUTER_MODEL_* overrides", async () => {
    vi.stubEnv("OPENROUTER_MODEL_EXTRACTION", "deepseek/deepseek-v4.1-flash");
    vi.stubEnv("OPENROUTER_MODEL_INSIGHTS", "deepseek/deepseek-v4.1-flash-1017");
    const { AI_MODELS } = await import("./ai-config");
    expect(AI_MODELS.extraction).toBe("deepseek/deepseek-v4.1-flash");
    expect(AI_MODELS.insights).toBe("deepseek/deepseek-v4.1-flash-1017");
  });
});

describe("getAiModel", () => {
  it("returns the OpenRouter model for a task with strict structured outputs and ZDR", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    const { extractionModel } = await import("./ai");
    const model = extractionModel() as unknown as {
      modelId: string;
      settings: {
        structuredOutputs: { strict: boolean };
        provider: { zdr: boolean; data_collection: string };
      };
    };
    expect(model.modelId).toBe("deepseek/deepseek-v4.1-flash-1017");
    expect(model.settings.structuredOutputs.strict).toBe(true);
    expect(model.settings.provider.zdr).toBe(true);
    expect(model.settings.provider.data_collection).toBe("deny");
  });

  it("does not let a call opt back into data retention silently", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    vi.stubEnv("OPENROUTER_ZDR", "false");
    const { insightsModel } = await import("./ai");
    const model = insightsModel() as unknown as {
      settings: { provider: { zdr: boolean; data_collection: string } };
    };
    expect(model.settings.provider.zdr).toBe(false);
    expect(model.settings.provider.data_collection).toBe("deny");
  });

  it("uses the insights model for the insights task", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    const { insightsModel } = await import("./ai");
    const model = insightsModel() as unknown as { modelId: string };
    expect(model.modelId).toBe("google/gemini-3.5-flash-lite");
  });

  it("throws a helpful error when OPENROUTER_API_KEY is missing", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const { extractionModel } = await import("./ai");
    expect(() => extractionModel()).toThrow(/OPENROUTER_API_KEY is not set/);
  });
});
