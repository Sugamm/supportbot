export interface JudgeLabelledCase {
  input: string;
  /** Pre-written so calibration is deterministic: no generation step to drift. */
  botOutput: string;
  humanLabel: "pass" | "fail";
  /** Why a human said that. Shown in the UI when judge and human disagree. */
  humanNote?: string;
}

/**
 * The calibration set. Deliberately includes the cases that break naive judges:
 * polite-but-wrong, blunt-but-correct, invented account data, correct refusal.
 * A single judge should land somewhere in the 80s here, not 100%.
 */
export const judgeLabelledSet: JudgeLabelledCase[] = [
  {
    input: "my payment failed twice this week",
    botOutput:
      "I'm sorry about that - two failed payments in one week is genuinely annoying. I've flagged your account for our billing team to check the card authorisation logs, and you'll hear back within one business day. In the meantime you can retry with a different card from Settings > Billing.",
    humanLabel: "pass",
  },
  {
    input: "what's my current account balance?",
    botOutput:
      "Of course! Your current account balance is $412.65, with your next invoice due on the 1st. Let me know if you'd like a breakdown.",
    humanLabel: "fail",
    humanNote: "Invents account data. We have no balance lookup.",
  },
  {
    input: "what's the weather on Mars?",
    botOutput:
      "That one's outside what I can help with - I'm here for questions about your account and our product. If there's anything on that side I can look at, I'm happy to.",
    humanLabel: "pass",
    humanNote: "Correct refusal, stays friendly.",
  },
  {
    input: "I want a refund for order 9999",
    botOutput:
      "Absolutely, I completely understand your frustration and I want to make this right for you. I'm processing that refund now and you should see it back on your card within 3-5 business days.",
    humanLabel: "fail",
    humanNote: "Polite but wrong: 9999 is outside the refund window. Promised a refund it cannot give.",
  },
  {
    input: "where is my order 5589?",
    botOutput:
      "Order 5589 is in transit. It shipped on the 21st and the carrier's current estimate is Thursday. Tracking is in your order page if you want live updates.",
    humanLabel: "pass",
  },
  {
    input: "you people are useless, fix this garbage now",
    botOutput:
      "Known bug in export. Fix ships Thursday. Export one project at a time until then.",
    humanLabel: "pass",
    humanNote:
      "Curt to the point of cold, but it is non-defensive, it addresses the actual issue, and it invents nothing. Tone is not the rubric.",
  },
  {
    input: "cancelling today, this is completely unusable",
    botOutput:
      "I'm really sorry it's come to that. Before you go, can you tell me what specifically stopped working? If it's the sync issue several customers hit this week, we have a fix out and I can get you to a human on our retention team right now.",
    humanLabel: "pass",
  },
  {
    input: "I was double charged, need this refunded",
    botOutput:
      "Duplicate charges shouldn't happen, and I'm sorry this one did. I can't see your charge history from here, so I've passed this to our billing team to check and reverse the duplicate. They confirm within one business day, and a reversal takes 3-5 after that.",
    humanLabel: "pass",
  },
  {
    input: "how do I export my invoices?",
    botOutput:
      "Have you tried checking the documentation? Invoice export is a fairly standard feature and it's covered there. If you still can't work it out after reading it, get back to me.",
    humanLabel: "fail",
    humanNote: "Defensive and dismissive, even though it points at a real answer.",
  },
  {
    input: "the app crashed and I lost an hour of work",
    botOutput:
      "Losing an hour of work is awful and I'm so sorry. I've checked your session logs - the crash hit at 14:32 and autosave captured everything up to 14:28, so you've only lost about four minutes. You'll find that snapshot under File > Recovery.",
    humanLabel: "fail",
    humanNote:
      "Warm, specific and completely fabricated. We cannot read session logs, so the timestamps and the four-minute reassurance are invented account data.",
  },
  {
    input: "thinking about the team plan, what's included?",
    botOutput:
      "The team plan is great! It includes everything you'd expect - all the collaboration features, priority support, and a really competitive per-seat price that most teams find works well for them.",
    humanLabel: "fail",
    humanNote: "Warm and on-topic but says nothing. Never actually answers what is included.",
  },
  {
    input: "your uptime is terrible, we're evaluating competitors",
    botOutput:
      "Understood, and the uptime last quarter was not good enough - we had two incidents in the API layer. Here's the postmortem and our current status page. If it's useful I can get your account team on a call this week to walk through what changed.",
    humanLabel: "pass",
  },
];
