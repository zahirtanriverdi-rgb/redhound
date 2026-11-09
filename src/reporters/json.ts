import { SEVERITIES, type ScanResult, type Severity } from '../types.js';

const JSON_INDENT = 2;

export function countBySeverity(result: ScanResult): Readonly<Record<Severity, number>> {
  const count = (severity: Severity): number =>
    result.findings.filter((finding) => finding.severity === severity).length;
  return Object.fromEntries(SEVERITIES.map((s) => [s, count(s)])) as Record<Severity, number>;
}

export function formatJson(result: ScanResult): string {
  const report = {
    summary: {
      filesScanned: result.filesScanned,
      findings: result.findings.length,
      suppressed: result.suppressed,
      bySeverity: countBySeverity(result),
    },
    findings: result.findings,
    errors: result.errors,
  };
  return `${JSON.stringify(report, null, JSON_INDENT)}\n`;
}
