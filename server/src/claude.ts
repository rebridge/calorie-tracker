import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MealSchema, type Meal } from "@calorie-tracker/shared";

export const MODEL = "claude-haiku-5-5";

export const SYSTEM_PROMPT =
  "You are a nutrition estimator. Break the user's description into individual food or drink items. " +
  "Use standard US nutrition data. When a portion is vague, assume a typical serving, state the assumption, " +
  "and lower the confidence. Only set meal_type if the user says it.";

export interface Estimate {
  meal: Meal;
  model: string;
  /** The full API response, stored as the audit trail. */
  response: unknown;
  inputTokens: number;
  outputTokens: number;
}

/** Why a model call produced nothing usable. Every kind maps to a 502; nothing is saved. */
export type ModelFailure = "refusal" | "max_tokens" | "schema" | "api_error";

export class ModelError extends Error {
  constructor(
    readonly kind: ModelFailure,
    message: string,
    /** Debug context for the server log. Never includes the API key. */
    readonly context: Record<string, unknown> = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ModelError";
  }
}

/**
 * Turns a free-text meal description into structured items. Swapped for a fake in tests.
 * Rejects with a `ModelError` when the model gives nothing usable.
 */
export type MealEstimator = (input: EstimateInput) => Promise<Estimate>;

/**
 * What the model is told about when the meal was eaten: today's local time, or for a backdated entry
 * the day's label ("Mon, Oct 13") and no time, since the time it's logged says nothing about the meal.
 */
export type EstimateInput = { text: string } & ({ localTime: string } | { pastDay: string });

export function userMessage(input: EstimateInput) {
  const context = "localTime" in input ? `Local time: ${input.localTime}` : `Logging for a past day (${input.pastDay})`;
  return `${context}\n\n${input.text}`;
}

export function createMealEstimator(client: Pick<Anthropic, "messages"> = new Anthropic()): MealEstimator {
  const format = zodOutputFormat(MealSchema);

  return async (input) => {
    // The SDK throws inside parse() when the text isn't valid MealSchema JSON, which would hide the
    // stop_reason. Capture the parse error instead so a refusal or a truncated reply is reported as such.
    let parseError: unknown;
    const lenientFormat = {
      ...format,
      parse(content: string): Meal | null {
        try {
          return format.parse(content);
        } catch (err) {
          parseError = err;
          return null;
        }
      },
    };

    let message;
    try {
      message = await client.messages.parse({
        model: MODEL,
        max_tokens: 4000,
        output_config: { effort: "medium", format: lenientFormat },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage(input) }],
      });
    } catch (err) {
      // Thrown after the SDK's default 2 retries for 429/5xx/connection errors.
      const context =
        err instanceof Anthropic.APIError
          ? { status: err.status, request_id: err.requestID, type: err.type }
          : { cause: String(err) };
      throw new ModelError("api_error", "The model API call failed", context, { cause: err });
    }

    const context = {
      id: message.id,
      request_id: message._request_id,
      stop_reason: message.stop_reason,
      usage: message.usage,
    };
    if (message.stop_reason === "refusal") throw new ModelError("refusal", "The model declined to answer", context);
    if (message.stop_reason === "max_tokens") throw new ModelError("max_tokens", "The model's reply was cut off", context);
    if (!message.parsed_output) {
      throw new ModelError(
        "schema",
        "The model's reply didn't match the expected format",
        { ...context, parse_error: parseError ? String(parseError) : "no text block" },
        { cause: parseError },
      );
    }

    return {
      meal: message.parsed_output,
      model: message.model,
      response: message,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    };
  };
}
