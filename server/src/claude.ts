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

/** Turns a free-text meal description into structured items. Swapped for a fake in tests. */
export type MealEstimator = (input: { text: string; localTime: string }) => Promise<Estimate>;

export function userMessage({ text, localTime }: { text: string; localTime: string }) {
  return `Local time: ${localTime}\n\n${text}`;
}

export function createMealEstimator(client: Pick<Anthropic, "messages"> = new Anthropic()): MealEstimator {
  return async (input) => {
    const message = await client.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: "medium", format: zodOutputFormat(MealSchema) },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage(input) }],
    });
    // Refusal / max_tokens / schema failures are handled in task 03.
    if (!message.parsed_output) throw new Error(`No parsed output (stop_reason: ${message.stop_reason})`);
    return {
      meal: message.parsed_output,
      model: message.model,
      response: message,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    };
  };
}
