import ts from 'typescript';
import { descendants, locationOf } from '../ast.js';
import type { Finding, Rule, SourceFile } from '../types.js';
import { createRequestInputTracer, type RequestInputTracer } from './shared/request-input.js';

const CHILD_PROCESS_MODULES = new Set(['child_process', 'node:child_process']);

/** Always run the command string through `/bin/sh`. */
const SHELL_METHODS = new Set(['exec', 'execSync']);

/** Run a program directly, unless the `shell` option is turned on. */
const DIRECT_METHODS = new Set(['execFile', 'execFileSync', 'spawn', 'spawnSync']);

const REMEDIATION_EXAMPLE = `- exec(\`ffmpeg -i uploads/\${req.body.file} out.mp4\`)
+ // No shell: each array item is one argument, so ";" or "$(...)" stay plain text.
+ const file = path.basename(String(req.body.file))
+ execFile('ffmpeg', ['-i', path.join('uploads', file), 'out.mp4'])`;

/** Names this file uses for child_process functions and for the module itself. */
interface ChildProcessBindings {
  /** Local name to child_process export, such as `runFile` to `execFile`. */
  readonly functions: ReadonlyMap<string, string>;
  /** Local names bound to the whole module: `cp` in `const cp = require('child_process')`. */
  readonly namespaces: ReadonlySet<string>;
}

interface ProcessCall {
  readonly method: string;
  readonly call: ts.CallExpression;
}

export const commandInjection: Rule = {
  id: 'command-injection',
  title: 'Request input reaches a shell command',
  severity: 'critical',
  description:
    'A shell treats characters such as ";", "&&" and "$(...)" as the start of a new command. ' +
    'Client input in a shell command, or in the choice of program, lets the client run any ' +
    'command on the server.',

  check(file: SourceFile): readonly Finding[] {
    const { ast } = file;
    if (ast === undefined) return [];
    const bindings = childProcessBindings(ast);
    if (bindings.functions.size === 0 && bindings.namespaces.size === 0) return [];
    const tracer = createRequestInputTracer(ast);

    return descendants(ast).flatMap((node): readonly Finding[] => {
      const processCall = processCallOf(node, bindings);
      const message = processCall === undefined ? undefined : problemWith(processCall, tracer);
      if (processCall === undefined || message === undefined) return [];

      return [
        {
          ruleId: this.id,
          title: this.title,
          severity: this.severity,
          file: file.path,
          ...locationOf(ast, processCall.call),
          message,
          remediation: {
            summary:
              'Use execFile or spawn with a fixed program and an array of arguments, and no ' +
              'shell option. Validate file names and pick programs from an allow-list.',
            example: REMEDIATION_EXAMPLE,
          },
        },
      ];
    });
  },
};

function problemWith(processCall: ProcessCall, tracer: RequestInputTracer): string | undefined {
  const { method, call } = processCall;
  const [command, args] = call.arguments;
  if (command === undefined) return undefined;
  const fromRequest = (node: ts.Node | undefined): boolean =>
    node !== undefined && tracer.carriesRequestInput(node);

  if (SHELL_METHODS.has(method)) {
    return fromRequest(command)
      ? `\`${method}\` runs its command through a shell, and \`${command.getText()}\` contains ` +
          'request input. A client can append its own commands.'
      : undefined;
  }
  if (fromRequest(command)) {
    return `The request decides which program \`${method}\` runs (\`${command.getText()}\`).`;
  }
  return enablesShell(call) && fromRequest(args)
    ? `\`${method}\` is called with shell: true, so request input in its arguments is read by ` +
        'a shell and can start new commands.'
    : undefined;
}

function processCallOf(node: ts.Node, bindings: ChildProcessBindings): ProcessCall | undefined {
  if (!ts.isCallExpression(node)) return undefined;
  const callee = node.expression;

  let method: string | undefined;
  if (ts.isIdentifier(callee)) method = bindings.functions.get(callee.text);
  if (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    bindings.namespaces.has(callee.expression.text)
  ) {
    method = callee.name.text;
  }

  const isChecked = method !== undefined && (SHELL_METHODS.has(method) || DIRECT_METHODS.has(method));
  return isChecked ? { method: method!, call: node } : undefined;
}

/** `{ shell: true }` or `{ shell: '/bin/bash' }` among the call's arguments. */
function enablesShell(call: ts.CallExpression): boolean {
  return call.arguments.some(
    (argument) =>
      ts.isObjectLiteralExpression(argument) &&
      argument.properties.some(
        (property) =>
          ts.isPropertyAssignment(property) &&
          property.name.getText() === 'shell' &&
          property.initializer.kind !== ts.SyntaxKind.FalseKeyword,
      ),
  );
}

function childProcessBindings(ast: ts.SourceFile): ChildProcessBindings {
  const functions = new Map<string, string>();
  const namespaces = new Set<string>();

  for (const node of descendants(ast)) {
    if (ts.isImportDeclaration(node) && isChildProcessSpecifier(node.moduleSpecifier)) {
      const clause = node.importClause;
      if (clause?.name !== undefined) namespaces.add(clause.name.text);
      const named = clause?.namedBindings;
      if (named !== undefined && ts.isNamespaceImport(named)) namespaces.add(named.name.text);
      if (named !== undefined && ts.isNamedImports(named)) {
        for (const element of named.elements) {
          functions.set(element.name.text, (element.propertyName ?? element.name).text);
        }
      }
    }

    const isRequire =
      ts.isVariableDeclaration(node) &&
      node.initializer !== undefined &&
      ts.isCallExpression(node.initializer) &&
      node.initializer.expression.getText() === 'require' &&
      node.initializer.arguments[0] !== undefined &&
      isChildProcessSpecifier(node.initializer.arguments[0]);
    if (!isRequire) continue;

    const name = (node as ts.VariableDeclaration).name;
    if (ts.isIdentifier(name)) namespaces.add(name.text);
    if (ts.isObjectBindingPattern(name)) {
      for (const element of name.elements) {
        if (!ts.isIdentifier(element.name)) continue;
        const imported = element.propertyName !== undefined ? element.propertyName.getText() : element.name.text;
        functions.set(element.name.text, imported);
      }
    }
  }
  return { functions, namespaces };
}

function isChildProcessSpecifier(node: ts.Node): boolean {
  return ts.isStringLiteralLike(node) && CHILD_PROCESS_MODULES.has(node.text);
}
