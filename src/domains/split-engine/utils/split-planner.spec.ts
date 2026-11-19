import { PlannableRule, planSplit } from './split-planner';

const rule = (overrides: Partial<PlannableRule> & Pick<PlannableRule, 'id'>): PlannableRule => ({
  name: overrides.id,
  priority: 1,
  destinationType: 'wallet',
  method: 'fixed',
  fixedAmount: 1_000_00,
  percentageBps: null,
  destinationExists: true,
  destinationActive: true,
  ...overrides,
});

describe('planSplit', () => {
  it('runs rules by priority (lower first) and applies percentages to the base amount', () => {
    const plan = planSplit({
      rules: [
        rule({
          id: 'b',
          priority: 2,
          method: 'percentage',
          fixedAmount: null,
          percentageBps: 1000,
        }),
        rule({ id: 'a', priority: 1, fixedAmount: 200_000_00 }),
      ],
      baseAmount: 850_000_00,
      available: 900_000_00,
      payoutFee: 0,
    });

    expect(plan.items.map((i) => [i.rule.id, i.amount])).toEqual([
      ['a', 200_000_00],
      ['b', 85_000_00],
    ]);
    expect(plan.remaining).toBe(900_000_00 - 285_000_00);
    expect(plan.skipped).toEqual([]);
  });

  it('skips a rule that does not fit and still runs smaller lower-priority rules', () => {
    const plan = planSplit({
      rules: [
        rule({ id: 'rent', priority: 1, fixedAmount: 300_000_00 }),
        rule({ id: 'big', priority: 2, fixedAmount: 500_000_00 }),
        rule({ id: 'small', priority: 3, fixedAmount: 50_000_00 }),
      ],
      baseAmount: 600_000_00,
      available: 600_000_00,
      payoutFee: 0,
    });

    expect(plan.items.map((i) => i.rule.id)).toEqual(['rent', 'small']);
    expect(plan.skipped).toEqual([
      { ruleId: 'big', ruleName: 'big', amount: 500_000_00, reason: 'insufficient_funds' },
    ]);
    expect(plan.remaining).toBe(250_000_00);
  });

  it('holds the fee reserve for beneficiary payouts only', () => {
    const plan = planSplit({
      rules: [
        rule({ id: 'mum', destinationType: 'beneficiary', fixedAmount: 100_000_00 }),
        rule({ id: 'save', priority: 2, fixedAmount: 100_000_00 }),
      ],
      baseAmount: 0,
      available: 200_000_00,
      payoutFee: 50_00,
    });

    expect(plan.items[0]).toMatchObject({ amount: 100_000_00, fee: 50_00 });

    expect(plan.skipped.map((s) => [s.ruleId, s.reason])).toEqual([['save', 'insufficient_funds']]);
  });

  it('skips paused/missing destinations and amounts under ₦1', () => {
    const plan = planSplit({
      rules: [
        rule({ id: 'paused', destinationType: 'beneficiary', destinationActive: false }),
        rule({ id: 'gone', destinationExists: false }),
        rule({ id: 'tiny', method: 'percentage', fixedAmount: null, percentageBps: 1 }),
      ],
      baseAmount: 500_00,
      available: 1_000_000_00,
      payoutFee: 0,
    });

    expect(plan.items).toEqual([]);
    expect(plan.skipped.map((s) => [s.ruleId, s.reason])).toEqual([
      ['paused', 'destination_paused'],
      ['gone', 'destination_missing'],
      ['tiny', 'below_minimum'],
    ]);
  });

  it('never plans more than is available', () => {
    const plan = planSplit({
      rules: [rule({ id: 'a', fixedAmount: 100_00 })],
      baseAmount: 0,
      available: 0,
      payoutFee: 0,
    });
    expect(plan.items).toEqual([]);
    expect(plan.remaining).toBe(0);
  });
});
