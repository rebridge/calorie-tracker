import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { MODEL, SYSTEM_PROMPT, createMealEstimator } from "./claude.js";

const meal = {
  meal_type: "breakfast" as const,
  items: [
    {
      name: "Black coffee",
      portion: "1 cup",
      calories: 2,
      protein_g: 0.3,
      carbs_g: 0,
      fat_g: 0,
      confidence: "high" as const,
      assumption: null,
    },
  ],
  not_food_reason: null,
};

describe("createMealEstimator", () => {
  it("calls messages.parse with the spec'd request and returns the parsed meal", async () => {
    const response = {
      model: MODEL,
      stop_reason: "end_turn",
      usage: { input_tokens: 412, output_tokens: 230 },
      parsed_output: meal,
    };
    const parse = vi.fn().mockResolvedValue(response);
    const estimate = createMealEstimator({ messages: { parse } } as unknown as Pick<Anthropic, "messages">);

    const result = await estimate({ text: "black coffee", localTime: "08:14" });

    expect(parse).toHaveBeenCalledOnce();
    const params = parse.mock.calls[0]![0];
    expect(params).toMatchObject({
      model: "claude-haiku-5-5",
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: "Local time: 08:14\n\nblack coffee" }],
      output_config: { effort: "medium", format: { type: "json_schema" } },
    });
    expect(params.thinking).toBeUndefined();
    expect(result).toEqual({ meal, model: MODEL, response, inputTokens: 412, outputTokens: 230 });
  });
});
