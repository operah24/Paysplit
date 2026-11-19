import type {
  SplitRuleDestinationType,
  SplitRuleMethod,
} from '../../split-rules/entities/split-rule.entity';
import { MIN_AMOUNT_MINOR, applyBps } from '../../../shared/utils/money.util';
import type { SkippedRule } from '../entities/split-run.entity';

export interface PlannableRule {
  id: string;
  name: string;
  priority: number;
  destinationType: SplitRuleDestinationType;
  method: SplitRuleMethod;
  fixedAmount: number | null;
  percentageBps: number | null;

  destinationExists: boolean;

  destinationActive: boolean;
}

export interface PlannedSplit<R extends PlannableRule> {
  rule: R;

  amount: number;

  fee: number;
}

export interface SplitPlan<R extends PlannableRule> {
  items: PlannedSplit<R>[];
  skipped: SkippedRule[];

  remaining: number;
}

export interface PlanInput<R extends PlannableRule> {
  rules: R[];

  baseAmount: number;

  available: number;

  payoutFee: number;
}

export function planSplit<R extends PlannableRule>(input: PlanInput<R>): SplitPlan<R> {
  const rules = [...input.rules].sort((a, b) => a.priority - b.priority);
  const items: PlannedSplit<R>[] = [];
  const skipped: SkippedRule[] = [];
  let remaining = Math.max(0, input.available);

  for (const rule of rules) {
    const amount =
      rule.method === 'fixed'
        ? (rule.fixedAmount ?? 0)
        : applyBps(input.baseAmount, rule.percentageBps ?? 0);
    const skip = (reason: SkippedRule['reason']) =>
      skipped.push({ ruleId: rule.id, ruleName: rule.name, amount, reason });

    if (!rule.destinationExists) {
      skip('destination_missing');
      continue;
    }
    if (!rule.destinationActive) {
      skip('destination_paused');
      continue;
    }
    if (amount < MIN_AMOUNT_MINOR) {
      skip('below_minimum');
      continue;
    }
    const fee = rule.destinationType === 'beneficiary' ? Math.max(0, input.payoutFee) : 0;
    if (amount + fee > remaining) {
      skip('insufficient_funds');
      continue;
    }
    items.push({ rule, amount, fee });
    remaining -= amount + fee;
  }

  return { items, skipped, remaining };
}
