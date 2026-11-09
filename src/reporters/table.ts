import pc from 'picocolors';
import { SEVERITIES, type Finding, type ScanResult, type Severity } from '../types.js';
import { countBySeverity } from './json.js';

const INDENT = '  ';
const SEVERITY_LABEL_WIDTH = Math.max(...SEVERITIES.map((severity) => severity.length));

const SEVERITY_COLORS: Readonly<Record<Severity, (text: string) => string>> = {
  critical: (text) => pc.bold(pc.red(text)),
  high: pc.red,
  medium: pc.yellow,
  low: pc.blue,
};

export function formatTable(result: ScanResult): string {
  const fileCount = `${result.filesScanned} ${plural(result.filesScanned, 'file')}`;
  if (result.findings.length === 0) {
    return `${pc.green('No issues found')} in ${fileCount}.${suppressedNote(result)}\n`;
  }

  const blocks = result.findings.map(formatFinding);
  const summary = `Scanned ${fileCount}: ${summarise(result)}.${suppressedNote(result)}`;
  return `${[...blocks, pc.bold(summary)].join('\n\n')}\n`;
}

function formatFinding(finding: Finding): string {
  const label = finding.severity.toUpperCase().padEnd(SEVERITY_LABEL_WIDTH);
  const location = `${finding.file}:${finding.line}:${finding.column}`;
  const example = finding.remediation.example
    ?.split('\n')
    .map((line) => `${INDENT}${INDENT}${colorDiffLine(line)}`);

  return [
    `${SEVERITY_COLORS[finding.severity](label)}  ${pc.bold(finding.title)}`,
    `${INDENT}${pc.cyan(location)}  ${pc.dim(finding.ruleId)}`,
    `${INDENT}${finding.message}`,
    `${INDENT}${pc.bold('Fix:')} ${finding.remediation.summary}`,
    ...(example ?? []),
  ].join('\n');
}

function colorDiffLine(line: string): string {
  if (line.startsWith('+')) return pc.green(line);
  if (line.startsWith('-')) return pc.red(line);
  return pc.dim(line);
}

function summarise(result: ScanResult): string {
  const counts = countBySeverity(result);
  const parts = [...SEVERITIES]
    .reverse()
    .filter((severity) => counts[severity] > 0)
    .map((severity) => `${counts[severity]} ${severity}`);
  const total = result.findings.length;
  return `${total} ${plural(total, 'issue')} (${parts.join(', ')})`;
}

function suppressedNote(result: ScanResult): string {
  return result.suppressed > 0 ? ` ${result.suppressed} suppressed by redhound-ignore.` : '';
}

function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}
