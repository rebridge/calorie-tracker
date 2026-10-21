import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { MODEL, ModelError, SYSTEM_PROMPT, createMealEstimator, userMessage } from "./claude.js";

const input = { text: "black coffee", localTime: "08:14" };

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

    const result = await estimate(input);

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

describe("userMessage", () => {
  it("leads with the local time for today", () => {
    expect(userMessage({ text: "black coffee", localTime: "08:14" })).toBe("Local time: 08:14\n\nblack coffee");
  });

  it("names the day and carries no time for a past day", () => {
    const message = userMessage({ text: "chicken burrito", pastDay: "Mon, Oct 13" });
    expect(message).toBe("Logging for a past day (Mon, Oct 13)\n\nchicken burrito");
    expect(message).not.toMatch(/Local time|\d:\d\d/);
  });
});

describe("createMealEstimator for a past day", () => {
  it("sends the past-day message to the model", async () => {
    const parse = vi.fn().mockResolvedValue({
      model: MODEL,
      stop_reason: "end_turn",
      usage: { input_tokens: 1, output_tokens: 1 },
      parsed_output: meal,
    });
    const estimate = createMealEstimator({ messages: { parse } } as unknown as Pick<Anthropic, "messages">);

    await estimate({ text: "chicken burrito", pastDay: "Mon, Oct 13" });

    expect(parse.mock.calls[0]![0].messages).toEqual([
      { role: "user", content: "Logging for a past day (Mon, Oct 13)\n\nchicken burrito" },
    ]);
  });
});

/** A real SDK client whose HTTP layer is faked, so stop reasons, parsing and API errors go through the SDK. */
function fakeApi(respond: () => Response) {
  const fetch = vi.fn(async () => respond());
  const client = new Anthropic({ apiKey: "sk-ant-test", fetch, maxRetries: 0 });
  return { fetch, estimate: createMealEstimator(client) };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "request-id": "req_123" } });

const message = (text: string, stop_reason = "end_turn") =>
  json({
    id: "msg_123",
    type: "message",
    role: "assistant",
    model: MODEL,
    content: [{ type: "text", text }],
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 400, output_tokens: 250 },
  });

async function failure(promise: Promise<unknown>): Promise<ModelError> {
  const err = await promise.then(
    () => expect.fail("expected the estimate to fail"),
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ModelError);
  return err as ModelError;
}

describe("createMealEstimator failures", () => {
  it("parses a valid reply through the real SDK", async () => {
    const { estimate } = fakeApi(() => message(JSON.stringify(meal)));
    expect((await estimate(input)).meal).toEqual(meal);
  });

  it("tolerates enum values the SDK's JSON schema can't enforce, and stores the reply as sent", async () => {
    const raw = JSON.stringify({
      ...meal,
      meal_type: " Breakfast ",
      items: [{ ...meal.items[0], confidence: "HIGH" }],
    });
    const { estimate } = fakeApi(() => message(raw));
    const result = await estimate(input);
    expect(result.meal.meal_type).toBe("breakfast");
    expect(result.meal.items[0]!.confidence).toBe("high");
    expect(JSON.stringify(result.response)).toContain(JSON.stringify(raw).slice(1, -1));
  });

  it("treats an unknown meal_type as null and an unknown confidence as low", async () => {
    const { estimate } = fakeApi(() =>
      message(JSON.stringify({ ...meal, meal_type: "brunch", items: [{ ...meal.items[0], confidence: "very sure" }] })),
    );
    const result = await estimate(input);
    expect(result.meal.meal_type).toBeNull();
    expect(result.meal.items[0]!.confidence).toBe("low");
  });

  it("still rejects a non-string confidence", async () => {
    const { estimate } = fakeApi(() => message(JSON.stringify({ ...meal, items: [{ ...meal.items[0], confidence: 3 }] })));
    expect((await failure(estimate(input))).kind).toBe("schema");
  });

  it("rejects a refusal", async () => {
    const { estimate } = fakeApi(() => message("I can't help with that.", "refusal"));
    const err = await failure(estimate(input));
    expect(err.kind).toBe("refusal");
    expect(err.context).toMatchObject({ id: "msg_123", stop_reason: "refusal" });
  });

  it("rejects a reply cut off at max_tokens", async () => {
    const { estimate } = fakeApi(() => message(JSON.stringify(meal).slice(0, 40), "max_tokens"));
    expect((await failure(estimate(input))).kind).toBe("max_tokens");
  });

  it("rejects max_tokens even if the truncated JSON happens to parse", async () => {
    const { estimate } = fakeApi(() => message(JSON.stringify(meal), "max_tokens"));
    expect((await failure(estimate(input))).kind).toBe("max_tokens");
  });

  it.each([
    ["invalid JSON", "{not json"],
    ["the wrong shape", JSON.stringify({ items: [{ name: "Coffee" }] })],
  ])("rejects %s as a schema failure", async (_, text) => {
    const { estimate } = fakeApi(() => message(text));
    const err = await failure(estimate(input));
    expect(err.kind).toBe("schema");
    expect(err.context.parse_error).toMatch(/Failed to parse structured output/);
  });

  it.each([401, 400, 500, 529])("rejects an API %i as api_error", async (status) => {
    const { estimate } = fakeApi(() => json({ type: "error", error: { type: "api_error", message: "nope" } }, status));
    const err = await failure(estimate(input));
    expect(err.kind).toBe("api_error");
    expect(err.context).toMatchObject({ status, request_id: "req_123" });
    expect(JSON.stringify(err.context)).not.toContain("sk-ant-test");
  });

  it("rejects a network failure as api_error", async () => {
    const { estimate } = fakeApi(() => {
      throw new TypeError("fetch failed");
    });
    expect((await failure(estimate(input))).kind).toBe("api_error");
  });
});
