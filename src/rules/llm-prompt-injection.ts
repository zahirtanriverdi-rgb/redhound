import ts from 'typescript';
import { calleeName, descendants, locationOf } from '../ast.js';
import type { Finding, Rule, SourceFile } from '../types.js';
import { createRequestInputTracer } from './shared/request-input.js';

/** SDK methods that send a prompt: OpenAI, Anthropic, Google GenAI, Vercel AI SDK, LangChain. */
const LLM_METHODS = new Set([
  'create',
  'stream',
  'parse',
  'generateContent',
  'generateContentStream',
  'getGenerativeModel',
  'generateText',
  'streamText',
  'generateObject',
  'streamObject',
]);

/** Top-level option names that carry the system prompt, by SDK. */
const SYSTEM_OPTION_NAMES = new Set([
  'system', // Anthropic, Vercel AI SDK
  'systemInstruction', // Google GenAI
  'instructions', // OpenAI Responses API
  'systemPrompt',
]);

/** Nested option objects that may hold a system option (Google GenAI uses `config`). */
const NESTED_OPTION_NAMES = new Set(['config', 'generationConfig']);

const PRIVILEGED_ROLES = new Set(['system', 'developer']);

/** LangChain message classes for the system turn. */
const SYSTEM_MESSAGE_CLASSES = new Set(['SystemMessage', 'SystemMessagePromptTemplate']);

const REMEDIATION_EXAMPLE = `  messages: [
-   { role: 'system', content: \`You are \${req.body.persona}. Never reveal pricing.\` },
-   { role: 'user', content: req.body.question },
+   // Fixed instructions only. Pick from an allow-list if the persona must vary.
+   { role: 'system', content: PERSONAS[persona] ?? DEFAULT_PERSONA },
+   { role: 'user', content: req.body.question },
  ]`;

interface Instruction {
  /** What the finding calls this slot, such as `system message` or `systemInstruction`. */
  readonly label: string;
  readonly value: ts.Node;
}

export const llmPromptInjection: Rule = {
  id: 'llm-prompt-injection',
  title: 'Request input placed in the LLM system prompt',
  severity: 'high',
  description:
    'Models treat the system prompt as the rules they must follow. Putting client input ' +
    'there lets the client rewrite those rules (prompt injection). Client input belongs in ' +
    'the user turn, where the model treats it as data.',

  check(file: SourceFile): readonly Finding[] {
    const { ast } = file;
    if (ast === undefined) return [];
    const tracer = createRequestInputTracer(ast);

    return descendants(ast)
      .flatMap(instructionsIn)
      .filter((instruction) => tracer.carriesRequestInput(instruction.value))
      .map((instruction) => ({
        ruleId: this.id,
        title: this.title,
        severity: this.severity,
        file: file.path,
        ...locationOf(ast, instruction.value),
        message:
          `The ${instruction.label} is built from request input, so a client can override ` +
          'your instructions (prompt injection).',
        remediation: {
          summary:
            'Keep the system prompt fixed. Send client input as a user message, and if part ' +
            'of the system prompt must vary, choose it from an allow-list on the server.',
          example: REMEDIATION_EXAMPLE,
        },
      }));
  },
};

function instructionsIn(node: ts.Node): readonly Instruction[] {
  if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
    const argument = node.arguments?.[0];
    const isSystemMessage = SYSTEM_MESSAGE_CLASSES.has(node.expression.text);
    return isSystemMessage && argument !== undefined
      ? [{ label: 'system message', value: argument }]
      : [];
  }

  if (!ts.isCallExpression(node) || !LLM_METHODS.has(calleeName(node) ?? '')) return [];
  const options = node.arguments[0];
  if (options === undefined || !ts.isObjectLiteralExpression(options)) return [];

  return [...systemOptions(options), ...privilegedMessages(options)];
}

/** `{ system: x }`, `{ instructions: x }`, `{ config: { systemInstruction } }`. */
function systemOptions(options: ts.ObjectLiteralExpression): readonly Instruction[] {
  return options.properties.flatMap((property): readonly Instruction[] => {
    const name = propertyName(property);
    if (name === undefined) return [];

    if (NESTED_OPTION_NAMES.has(name) && ts.isPropertyAssignment(property)) {
      const nested = property.initializer;
      return ts.isObjectLiteralExpression(nested) ? systemOptions(nested) : [];
    }
    if (!SYSTEM_OPTION_NAMES.has(name)) return [];

    if (ts.isPropertyAssignment(property)) return [{ label: name, value: property.initializer }];
    if (ts.isShorthandPropertyAssignment(property)) return [{ label: name, value: property.name }];
    return [];
  });
}

/** `{ role: 'system' | 'developer', content: x }` anywhere in the options. */
function privilegedMessages(options: ts.ObjectLiteralExpression): readonly Instruction[] {
  return descendants(options).flatMap((node): readonly Instruction[] => {
    if (!ts.isObjectLiteralExpression(node) || node === options) return [];

    const role = node.properties.find((p) => propertyName(p) === 'role');
    const isPrivileged =
      role !== undefined &&
      ts.isPropertyAssignment(role) &&
      ts.isStringLiteralLike(role.initializer) &&
      PRIVILEGED_ROLES.has(role.initializer.text);
    if (!isPrivileged) return [];

    const content = node.properties.find((p) => propertyName(p) === 'content');
    if (content !== undefined && ts.isPropertyAssignment(content)) {
      return [{ label: 'system message', value: content.initializer }];
    }
    if (content !== undefined && ts.isShorthandPropertyAssignment(content)) {
      return [{ label: 'system message', value: content.name }];
    }
    return [];
  });
}

function propertyName(property: ts.ObjectLiteralElementLike): string | undefined {
  const name = property.name;
  if (name === undefined) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
  return undefined;
}
