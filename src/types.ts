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
  /** Parsed syntax tree. Only present for JavaScript and TypeScript files. */
  readonly ast?: ts.SourceFile;
}

/**
 * For rules that need several files at once, such as database migrations where a table is
 * created in one file and secured in another.
 */
export interface ProjectCheck {
  /** Whether the rule needs to see this file (path relative to the scan root). */
  appliesTo(path: string): boolean;
  /** Runs once per scan with every file `appliesTo` accepted, sorted by path. */
  check(files: readonly SourceFile[]): readonly Finding[];
}

/** A rule implements `check` (one file at a time), `project` (all files together), or both. */
export interface Rule {
  readonly id: string;
  readonly title: string;
  readonly severity: Severity;
  readonly description: string;
  check?(file: SourceFile): readonly Finding[];
  readonly project?: ProjectCheck;
}

export interface ScanError {
  readonly file: string;
  readonly message: string;
}

export interface ScanResult {
  readonly findings: readonly Finding[];
  readonly filesScanned: number;
  /** Findings hidden by `redhound-ignore` comments. */
  readonly suppressed: number;
  readonly errors: readonly ScanError[];
}
