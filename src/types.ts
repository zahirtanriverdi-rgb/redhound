import type ts from 'typescript';

export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

export type Severity = (typeof SEVERITIES)[number];

export interface Remediation {
  /** One or two sentences on how to close the gap. */
  readonly summary: string;
  /** A short diff-style code sample showing the fix. */
  readonly example?: string;
}

export interface Finding {
  readonly ruleId: string;
  readonly title: string;
  readonly severity: Severity;
  /** Path relative to the scan root, with forward slashes. */
  readonly file: string;
  /** 1-based. */
  readonly line: number;
  /** 1-based. */
  readonly column: number;
  readonly message: string;
  readonly remediation: Remediation;
}

export interface SourceFile {
  /** Path relative to the scan root, with forward slashes. */
  readonly path: string;
  readonly content: string;
  readonly ast: ts.SourceFile;
}

export interface Rule {
  readonly id: string;
  readonly title: string;
  readonly severity: Severity;
  readonly description: string;
  check(file: SourceFile): readonly Finding[];
}

export interface ScanError {
  readonly file: string;
  readonly message: string;
}

export interface ScanResult {
  readonly findings: readonly Finding[];
  readonly filesScanned: number;
  readonly errors: readonly ScanError[];
}
