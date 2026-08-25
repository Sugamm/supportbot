import type { Classification } from "@/lib/types";

export interface ClassificationCase {
  input: string;
  expected: Classification;
  /** Shown as a hint chip in the results table for the tricky rows. */
  note?: string;
}

export const classificationSet: ClassificationCase[] = [
  { input: "my payment failed twice this week", expected: { category: "billing", severity: 4 } },
  {
    input: "love the new dashboard, huge improvement",
    expected: { category: "praise", severity: 1 },
  },
  {
    input: "cancelling today, this is completely unusable",
    expected: { category: "churn_risk", severity: 5 },
  },
  { input: "how do I export my invoices?", expected: { category: "billing", severity: 2 } },
  {
    input: "the app crashed and I lost an hour of work",
    expected: { category: "technical", severity: 4 },
  },
  {
    input: "you people are useless, fix this garbage now",
    expected: { category: "technical", severity: 3 },
    note: "anger != severity",
  },
  {
    input: "what's the weather on Mars?",
    expected: { category: "out_of_scope", severity: 1 },
    note: "negative case",
  },
  {
    input: "what's my current account balance?",
    expected: { category: "out_of_scope", severity: 1 },
    note: "negative case - no account access",
  },
  {
    input: "thinking about the team plan, what's included?",
    expected: { category: "sales", severity: 2 },
  },
  {
    input: "I was double charged, need this refunded",
    expected: { category: "billing", severity: 4 },
  },
  { input: "great support last time, thank you", expected: { category: "praise", severity: 1 } },
  {
    input: "your uptime is terrible, we're evaluating competitors",
    expected: { category: "churn_risk", severity: 4 },
    note: "competitor mention outranks the topic",
  },
];
