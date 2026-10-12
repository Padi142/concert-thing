import type { DecisionBindingService } from "../env";

const MODEL = "@cf/cloudflare/clef";

/** Clef accepts at most this many questions in one request. */
export const MAX_QUESTIONS = 64;

export type Question =
  | { type: "noul"; instructions: string }
  | { type: "choice"; instructions: string; criteria: Record<string, string> };

export type Answers = Record<string, unknown>;

function probability(value: unknown): number | null {
  return typeof value === "number" && value >= 0 && value <= 1 ? value : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export async function ask(ai: DecisionBindingService, state: unknown, questions: Record<string, Question>): Promise<Answers> {
  const response = record(await ai.run(MODEL, { model: "clef", state, questions }));
  return record(response?.answers) ?? {};
}

/** Probability that a noul question is true, or null when it was not answered. */
export function yesProbability(answer: unknown): number | null {
  return probability(record(answer)?.noul);
}

/** The option a choice question settled on, with that option's own probability. */
export function chosenOption(answer: unknown): { option: string; probability: number } | null {
  const fields = record(answer);
  const option = fields?.choice;
  if (typeof option !== "string") return null;
  const chosen = probability(record(fields?.probabilities)?.[option]);
  return chosen === null ? null : { option, probability: chosen };
}
