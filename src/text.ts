import type { SourceLocation } from './ast.js';

/** 1-based line and column of a character offset in plain text. */
export function locationAt(content: string, offset: number): SourceLocation {
  const before = content.slice(0, offset);
  const lastLineBreak = before.lastIndexOf('\n');
  return {
    line: before.split('\n').length,
    column: offset - lastLineBreak,
  };
}
