import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { errorMessage } from '../errors.js';
import { builtinRules } from '../rules/index.js';
import { meetsThreshold, severityRank } from '../severity.js';
import type { Finding, Rule, ScanError, ScanResult, Severity } from '../types.js';
import { assertDirectory, collectSourceFiles } from './files.js';

/** Larger files are almost always bundles or generated code, and slow to parse. */
const MAX_FILE_SIZE_BYTES = 1024 * 1024;

const SCRIPT_KINDS: Readonly<Record<string, ts.ScriptKind>> = {
  '.tsx': ts.ScriptKind.TSX,
  '.jsx': ts.ScriptKind.JSX,
  '.js': ts.ScriptKind.JS,
  '.mjs': ts.ScriptKind.JS,
  '.cjs': ts.ScriptKind.JS,
};

export interface ScanOptions {
  readonly root: string;
  readonly rules?: readonly Rule[];
  readonly minSeverity?: Severity;
}

interface FileOutcome {
  readonly scanned: boolean;
  readonly findings: readonly Finding[];
  readonly error?: ScanError;
}

const SKIPPED: FileOutcome = { scanned: false, findings: [] };

export async function scan(options: ScanOptions): Promise<ScanResult> {
  const { root, rules = builtinRules, minSeverity = 'low' } = options;
  await assertDirectory(root);

  const files = await collectSourceFiles(root);
  const outcomes: FileOutcome[] = [];
  for (const file of files) {
    outcomes.push(await scanFile(root, file, rules));
  }

  const findings = outcomes
    .flatMap((outcome) => outcome.findings)
    .filter((finding) => meetsThreshold(finding.severity, minSeverity))
    .sort(compareFindings);

  return {
    findings,
    filesScanned: outcomes.filter((outcome) => outcome.scanned).length,
    errors: outcomes.flatMap((outcome) => (outcome.error ? [outcome.error] : [])),
  };
}

async function scanFile(root: string, file: string, rules: readonly Rule[]): Promise<FileOutcome> {
  const absolutePath = path.join(root, file);
  try {
    const { size } = await stat(absolutePath);
    if (size > MAX_FILE_SIZE_BYTES) return SKIPPED;

    const content = await readFile(absolutePath, 'utf8');
    const scriptKind = SCRIPT_KINDS[path.extname(file)] ?? ts.ScriptKind.TS;
    const ast = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, scriptKind);
    const source = { path: file, content, ast };

    return { scanned: true, findings: rules.flatMap((rule) => rule.check(source)) };
  } catch (error: unknown) {
    return { scanned: false, findings: [], error: { file, message: errorMessage(error) } };
  }
}

/** Most severe first, then by file and line so output is stable. */
function compareFindings(a: Finding, b: Finding): number {
  return (
    severityRank(b.severity) - severityRank(a.severity) ||
    a.file.localeCompare(b.file) ||
    a.line - b.line
  );
}
