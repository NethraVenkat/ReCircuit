import { describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";
import { generateStructured } from "../generate-structured.js";
import { LlmOutputError } from "../types.js";
import { registerFakeFixture, clearFakeFixtures } from "../adapters/fake.js";

describe("packages/llm: generateStructured & Adapters", () => {
  beforeEach(() => {
    clearFakeFixtures();
    process.env.LLM_PROVIDER = "fake";
  });

  const SimpleSchema = z.object({
    message: z.string(),
    count: z.number(),
  });

  it("successfully parses valid structured output from fake provider", async () => {
    registerFakeFixture("simple_test", JSON.stringify({ message: "Hello world", count: 42 }));

    const result = await generateStructured({
      schema: SimpleSchema,
      system: "System prompt",
      user: "simple_test user prompt",
      testFixtureName: "simple_test",
    });

    expect(result.message).toBe("Hello world");
    expect(result.count).toBe(42);
  });

  it("handles markdown code fences in LLM response", async () => {
    registerFakeFixture(
      "fence_test",
      "```json\n" + JSON.stringify({ message: "In fence", count: 7 }) + "\n```"
    );

    const result = await generateStructured({
      schema: SimpleSchema,
      system: "System",
      user: "fence_test prompt",
      testFixtureName: "fence_test",
    });

    expect(result.message).toBe("In fence");
    expect(result.count).toBe(7);
  });

  it("retries once when first attempt produces malformed JSON and succeeds on second attempt", async () => {
    registerFakeFixture("retry_test", [
      "Not JSON at all: { error", // First attempt
      JSON.stringify({ message: "Recovered", count: 99 }), // Second attempt (retry)
    ]);

    const result = await generateStructured({
      schema: SimpleSchema,
      system: "System prompt",
      user: "retry_test user prompt",
      testFixtureName: "retry_test",
    });

    expect(result.message).toBe("Recovered");
    expect(result.count).toBe(99);
  });

  it("throws typed LlmOutputError when retry also fails validation", async () => {
    registerFakeFixture("fail_test", [
      "Bad JSON attempt 1",
      "Bad JSON attempt 2",
    ]);

    await expect(
      generateStructured({
        schema: SimpleSchema,
        system: "System",
        user: "fail_test prompt",
        testFixtureName: "fail_test",
      })
    ).rejects.toThrow(LlmOutputError);
  });

  it("throws typed LlmConfigurationError when Anthropic or OpenAI is instantiated without an API key", async () => {
    const { AnthropicAdapter } = await import("../adapters/anthropic.js");
    const { OpenAiAdapter } = await import("../adapters/openai.js");
    const { LlmConfigurationError } = await import("../types.js");

    const savedKey = process.env.LLM_API_KEY;
    try {
      delete process.env.LLM_API_KEY;

      expect(() => new AnthropicAdapter("")).toThrow(LlmConfigurationError);
      expect(() => new OpenAiAdapter("")).toThrow(LlmConfigurationError);
    } finally {
      if (savedKey) process.env.LLM_API_KEY = savedKey;
    }
  });

  it("never falls back silently to fake when LLM_PROVIDER=anthropic is set without an API key", async () => {
    const { LlmConfigurationError } = await import("../types.js");

    const savedProvider = process.env.LLM_PROVIDER;
    const savedKey = process.env.LLM_API_KEY;

    try {
      process.env.LLM_PROVIDER = "anthropic";
      delete process.env.LLM_API_KEY;

      await expect(
        generateStructured({
          schema: SimpleSchema,
          system: "System",
          user: "test prompt",
        })
      ).rejects.toThrow(LlmConfigurationError);
    } finally {
      process.env.LLM_PROVIDER = savedProvider || "fake";
      if (savedKey) process.env.LLM_API_KEY = savedKey;
    }
  });
});
