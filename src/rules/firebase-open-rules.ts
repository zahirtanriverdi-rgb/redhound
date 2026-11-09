import { locationAt } from '../text.js';
import type { Finding, Rule, Severity, SourceFile } from '../types.js';

/** `firestore.rules`, `storage.rules` and other Firebase rules-language files. */
const RULES_LANGUAGE_FILE_PATTERN = /\.rules$/;
const REALTIME_DATABASE_FILE_PATTERN = /\.rules\.json$/;

/** `allow <operations>;` or `allow <operations>: if <condition>;` */
const ALLOW_STATEMENT_PATTERN = /\ballow\s+([a-z,\s]+?)\s*(?::\s*if\s+([^;]*?))?\s*;/g;

/** The rule Firebase generates for "test mode": open to everyone until a date. */
const TEST_MODE_CONDITION_PATTERN = /^request\.time\s*<\s*timestamp\.date\(/;

/** `".read": true` or `".write": true` in Realtime Database rules. */
const REALTIME_OPEN_RULE_PATTERN = /"\.(read|write)"\s*:\s*(?:true|"true")/g;

const LINE_COMMENT_PATTERN = /\/\/.*$/gm;
const READ_OPERATIONS = new Set(['read', 'get', 'list']);

const RULES_LANGUAGE_EXAMPLE = `  match /users/{userId} {
-   allow read, write: if true;
+   allow read, write: if request.auth != null && request.auth.uid == userId;
  }`;

const REALTIME_DATABASE_EXAMPLE = `  "users": {
    "$uid": {
-     ".read": true,
-     ".write": true
+     ".read": "auth != null && auth.uid === $uid",
+     ".write": "auth != null && auth.uid === $uid"
    }
  }`;

interface OpenRule {
  readonly offset: number;
  readonly allowsWrite: boolean;
  readonly isTestMode: boolean;
}

export const firebaseOpenRules: Rule = {
  id: 'firebase-open-rules',
  title: 'Firebase security rules allow access without authentication',
  severity: 'critical',
  description:
    'Firebase databases and storage buckets are reachable straight from the internet. ' +
    'Security rules are the only thing between a stranger and the data.',

  check(file: SourceFile): readonly Finding[] {
    const isRealtimeDatabase = REALTIME_DATABASE_FILE_PATTERN.test(file.path);
    if (!isRealtimeDatabase && !RULES_LANGUAGE_FILE_PATTERN.test(file.path)) return [];

    // Blank out comments but keep every offset, so a commented-out rule is not reported.
    const code = file.content.replace(LINE_COMMENT_PATTERN, (comment) => ' '.repeat(comment.length));
    const openRules = isRealtimeDatabase ? realtimeOpenRules(code) : rulesLanguageOpenRules(code);

    return openRules.map((rule) => ({
      ruleId: this.id,
      title: this.title,
      severity: severityOf(rule),
      file: file.path,
      ...locationAt(file.content, rule.offset),
      message: messageFor(rule),
      remediation: {
        summary:
          'Require a signed-in user and compare request.auth.uid with the owner of the data. ' +
          'Keep public read access only for content that is meant to be public.',
        example: isRealtimeDatabase ? REALTIME_DATABASE_EXAMPLE : RULES_LANGUAGE_EXAMPLE,
      },
    }));
  },
};

function rulesLanguageOpenRules(code: string): readonly OpenRule[] {
  return [...code.matchAll(ALLOW_STATEMENT_PATTERN)].flatMap((match) => {
    const condition = match[2]?.trim();
    const isTestMode = condition !== undefined && TEST_MODE_CONDITION_PATTERN.test(condition);
    const isOpen = condition === undefined || condition === 'true' || isTestMode;
    if (!isOpen) return [];

    const operations = (match[1] ?? '').split(',').map((operation) => operation.trim());
    const allowsWrite = operations.some((operation) => !READ_OPERATIONS.has(operation));
    return [{ offset: match.index, allowsWrite, isTestMode }];
  });
}

function realtimeOpenRules(code: string): readonly OpenRule[] {
  return [...code.matchAll(REALTIME_OPEN_RULE_PATTERN)].map((match) => ({
    offset: match.index,
    allowsWrite: match[1] === 'write',
    isTestMode: false,
  }));
}

/** Public read access is often intentional; open writes and test mode never are. */
function severityOf(rule: OpenRule): Severity {
  return rule.allowsWrite || rule.isTestMode ? 'critical' : 'medium';
}

function messageFor(rule: OpenRule): string {
  if (rule.isTestMode) {
    return (
      'This is the Firebase test mode rule: everyone has full access until the date passes, ' +
      'and then every request is denied.'
    );
  }
  return rule.allowsWrite
    ? 'Anyone on the internet can create, change and delete the data this rule covers, without signing in.'
    : 'Anyone on the internet can read the data this rule covers, without signing in. Keep it only if this data is meant to be public.';
}
