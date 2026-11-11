import type { Finding } from '../types.js';

const SAME_LINE_DIRECTIVE = /redhound-ignore(?!-next-line)\b(.*)/;
const NEXT_LINE_DIRECTIVE = /redhound-ignore-next-line\b(.*)/;

/** Rule ids are kebab-case with at least two words, which keeps free-text reasons from matching. */
const RULE_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)+$/;

/**
 * True when a comment hides the finding:
 *
 *   // redhound-ignore-next-line                      every rule, on the next line
 *   // redhound-ignore-next-line rule-id -- reason    only that rule
 *   someCode(); // redhound-ignore                    every rule, on this line
 */
export function isSuppressed(finding: Finding, lines: readonly string[]): boolean {
  const lineIndex = finding.line - 1;
  return (
    covers(lines[lineIndex], SAME_LINE_DIRECTIVE, finding.ruleId) ||
    covers(lines[lineIndex - 1], NEXT_LINE_DIRECTIVE, finding.ruleId)
  );
}

function covers(line: string | undefined, directive: RegExp, ruleId: string): boolean {
  const match = line === undefined ? null : directive.exec(line);
  if (match === null) return false;

  // `-- reason` ends the rule list, so dashed words in the reason are not read as rule ids.
  const ruleIds = (match[1] ?? '')
    .split(/\s--\s|\s--$/)[0]!
    .split(/[\s,]+/)
    .filter((token) => RULE_ID_PATTERN.test(token));
  return ruleIds.length === 0 || ruleIds.includes(ruleId);
}
