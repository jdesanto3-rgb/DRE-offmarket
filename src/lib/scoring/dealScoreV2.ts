export interface ScoreInput {
  signals: Array<{
    signal_type: string;
    stage?: string | null;
  }>;
  equity_percent?: number | null;
  absentee_owner?: boolean | null;
  vacant?: boolean | null;
  owner_occupied?: boolean | null;
  county?: string | null;
}

export interface ScoreResult {
  score: number;
  band: "HOT" | "WARM" | "WATCH" | "LOW";
  breakdown: {
    distress: number;
    equity: number;
    motivation: number;
    market: number;
  };
  reasons: string[];
}

const DISTRESS_SCORES: Record<string, number> = {
  show_cause_notice: 40,
  pre_foreclosure: 38,
  forfeited_notice: 30,
  foreclosure_signal: 25,
  tax_delinquent_list: 20,
};

const TARGET_COUNTIES = ["LIVINGSTON", "OAKLAND", "WASHTENAW"];

export function computeDealScore(input: ScoreInput): ScoreResult {
  const reasons: string[] = [];

  // DISTRESS — take max signal (max 40)
  let distress = 0;
  for (const sig of input.signals) {
    const key = sig.stage === "lis_pendens" ? "pre_foreclosure" : sig.signal_type;
    const val = DISTRESS_SCORES[key] || 0;
    if (val > distress) {
      distress = val;
      reasons.push(`Distress: ${key} (+${val})`);
    }
  }
  // Remove non-max distress reasons, keep only the highest
  if (reasons.length > 1) {
    const maxReason = reasons[reasons.length - 1];
    reasons.length = 0;
    reasons.push(maxReason);
  }

  // EQUITY — max 30
  let equity = 0;
  if (input.equity_percent != null) {
    if (input.equity_percent >= 80) {
      equity = 30;
      reasons.push("Equity: 80%+ (+30)");
    } else if (input.equity_percent >= 60) {
      equity = 22;
      reasons.push("Equity: 60-79% (+22)");
    } else if (input.equity_percent >= 40) {
      equity = 15;
      reasons.push("Equity: 40-59% (+15)");
    } else if (input.equity_percent >= 20) {
      equity = 8;
      reasons.push("Equity: 20-39% (+8)");
    }
  }

  // MOTIVATION — max 20
  let motivation = 0;
  if (input.absentee_owner) {
    motivation += 10;
    reasons.push("Motivation: absentee owner (+10)");
  }
  if (input.vacant) {
    motivation += 10;
    reasons.push("Motivation: vacant (+10)");
  }
  if (!input.absentee_owner && !input.vacant && input.owner_occupied === false) {
    motivation += 5;
    reasons.push("Motivation: non-owner-occupied (+5)");
  }
  motivation = Math.min(motivation, 20);

  // MARKET — max 10
  let market = 0;
  if (input.county && TARGET_COUNTIES.includes(input.county.toUpperCase())) {
    market = 10;
    reasons.push(`Market: target county ${input.county} (+10)`);
  }

  const score = distress + equity + motivation + market;

  let band: ScoreResult["band"];
  if (score >= 85) band = "HOT";
  else if (score >= 70) band = "WARM";
  else if (score >= 50) band = "WATCH";
  else band = "LOW";

  return {
    score,
    band,
    breakdown: { distress, equity, motivation, market },
    reasons,
  };
}
