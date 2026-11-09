import { SEVERITIES, type Severity } from './types.js';

export function severityRank(severity: Severity): number {
  return SEVERITIES.indexOf(severity);
}

export function meetsThreshold(severity: Severity, minimum: Severity): boolean {
  return severityRank(severity) >= severityRank(minimum);
}
