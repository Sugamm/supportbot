export interface TrajectoryCase {
  input: string;
  /** Order matters. Empty means: call nothing and decline. */
  expectedTools: string[];
  note?: string;
}

export const trajectorySet: TrajectoryCase[] = [
  { input: "refund my order 4471", expectedTools: ["lookup_order", "issue_refund"] },
  { input: "where is my order 5589?", expectedTools: ["lookup_order"] },
  {
    input: "what's the weather on Mars?",
    expectedTools: [],
    note: "refuse, call nothing",
  },
  {
    input: "I want a refund for order 9999",
    expectedTools: ["lookup_order"],
    note: "exists but not refund-eligible - look up, then refuse",
  },
  { input: "let me talk to a human", expectedTools: ["escalate_to_human"] },
  { input: "cancel my subscription", expectedTools: ["escalate_to_human"] },
];
