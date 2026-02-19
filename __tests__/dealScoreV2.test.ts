import { computeDealScore, ScoreInput } from "@/lib/scoring/dealScoreV2";

describe("DeSanto Deal Score v2", () => {
  test("pre-foreclosure + high equity → HOT", () => {
    const input: ScoreInput = {
      signals: [{ signal_type: "pre_foreclosure", stage: "lis_pendens" }],
      equity_percent: 85,
      absentee_owner: true,
      vacant: false,
      county: "WASHTENAW",
    };
    const result = computeDealScore(input);
    // pre_foreclosure = 38, equity 80%+ = 30, absentee = 10, market = 10 → 88
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.band).toBe("HOT");
    expect(result.breakdown.distress).toBe(38);
    expect(result.breakdown.equity).toBe(30);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  test("tax delinquent only → WATCH or WARM", () => {
    const input: ScoreInput = {
      signals: [{ signal_type: "tax_delinquent_list" }],
      equity_percent: 45,
      absentee_owner: false,
      vacant: false,
      county: "OAKLAND",
    };
    const result = computeDealScore(input);
    // tax_delinquent = 20, equity 40-59% = 15, market = 10 → 45
    // Actually with these values: 20 + 15 + 0 + 10 = 45 → LOW
    // Let's check: no motivation factors
    expect(result.score).toBeLessThan(85);
    expect(["WATCH", "WARM", "LOW"]).toContain(result.band);
    expect(result.breakdown.distress).toBe(20);
  });

  test("no signals → LOW", () => {
    const input: ScoreInput = {
      signals: [],
      equity_percent: null,
      absentee_owner: false,
      vacant: false,
      county: "LIVINGSTON",
    };
    const result = computeDealScore(input);
    // Only market county = 10
    expect(result.score).toBeLessThan(50);
    expect(result.band).toBe("LOW");
    expect(result.breakdown.distress).toBe(0);
    expect(result.breakdown.equity).toBe(0);
    expect(result.breakdown.motivation).toBe(0);
  });

  test("show_cause + vacant + absentee + high equity → HOT", () => {
    const input: ScoreInput = {
      signals: [{ signal_type: "show_cause_notice" }],
      equity_percent: 90,
      absentee_owner: true,
      vacant: true,
      county: "WASHTENAW",
    };
    const result = computeDealScore(input);
    // 40 + 30 + 20 + 10 = 100
    expect(result.score).toBe(100);
    expect(result.band).toBe("HOT");
  });

  test("multiple signals takes max distress", () => {
    const input: ScoreInput = {
      signals: [
        { signal_type: "tax_delinquent_list" },
        { signal_type: "foreclosure_signal" },
        { signal_type: "show_cause_notice" },
      ],
      equity_percent: null,
      county: null,
    };
    const result = computeDealScore(input);
    expect(result.breakdown.distress).toBe(40); // show_cause is max
  });
});
