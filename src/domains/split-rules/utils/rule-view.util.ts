import { SplitRule, SplitRuleMethod, SplitRuleStatus } from '../entities/split-rule.entity';
import { applyBps, bpsToPercent, formatNaira } from '../../../shared/utils/money.util';

export interface LinkedRuleView {
  id: string;
  name: string;
  status: SplitRuleStatus;
  priority: number;
  method: SplitRuleMethod;

  value: number;

  displayValue: string;

  updatedAt: Date;
}

export function ruleValue(
  rule: Pick<SplitRule, 'method' | 'fixedAmount' | 'percentageBps'>,
): number {
  return rule.method === 'fixed' ? (rule.fixedAmount ?? 0) : bpsToPercent(rule.percentageBps ?? 0);
}

export function ruleDisplayValue(
  rule: Pick<SplitRule, 'method' | 'fixedAmount' | 'percentageBps'>,
): string {
  return rule.method === 'fixed'
    ? formatNaira(rule.fixedAmount ?? 0)
    : `${bpsToPercent(rule.percentageBps ?? 0)}%`;
}

export function plannedAmount(
  rule: Pick<SplitRule, 'method' | 'fixedAmount' | 'percentageBps'>,
  baseline: number | null,
): number | null {
  if (rule.method === 'fixed') return rule.fixedAmount ?? 0;
  return baseline === null ? null : applyBps(baseline, rule.percentageBps ?? 0);
}

export function toLinkedRuleView(rule: SplitRule | null | undefined): LinkedRuleView | null {
  if (!rule) return null;
  return {
    id: rule.id,
    name: rule.name,
    status: rule.status,
    priority: rule.priority,
    method: rule.method,
    value: ruleValue(rule),
    displayValue: ruleDisplayValue(rule),
    updatedAt: rule.updatedAt,
  };
}
