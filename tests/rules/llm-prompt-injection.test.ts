import { describe, expect, test } from 'vitest';
import { llmPromptInjection } from '../../src/rules/llm-prompt-injection.js';
import { scan } from '../../src/scanner/scan.js';
import { fixturePath } from '../helpers.js';

const rules = [llmPromptInjection];
const VULNERABLE = fixturePath('llm-prompt-injection', 'vulnerable');

describe('llm-prompt-injection', () => {
  test('flags request input placed in a system or developer instruction', async () => {
    const result = await scan({ root: VULNERABLE, rules });

    const flagged = result.findings.map((f) => `${f.file}:${f.line}`);

    expect(flagged).toEqual(['anthropic.js:9', 'app/api/support/route.ts:13', 'openai-chat.ts:12']);
  });

  test('follows variables back to the request, through destructuring and assignments', async () => {
    const result = await scan({ root: VULNERABLE, rules });

    const gemini = result.findings.find((f) => f.file === 'app/api/support/route.ts');
    const openai = result.findings.find((f) => f.file === 'openai-chat.ts');

    expect(gemini?.message).toContain('systemInstruction');
    expect(openai?.message).toContain('system message');
  });

  test('reports high severity with a fix that moves input to the user turn', async () => {
    const result = await scan({ root: VULNERABLE, rules });

    for (const finding of result.findings) {
      expect(finding.severity).toBe('high');
      expect(finding.remediation.example).toContain("role: 'user'");
    }
  });

  test('accepts user input in the user turn and server-side values in the system prompt', async () => {
    const result = await scan({ root: fixturePath('llm-prompt-injection', 'safe'), rules });

    expect(result.filesScanned).toBe(2);
    expect(result.findings).toEqual([]);
  });
});
