import ts from 'typescript';
import { calleeName, descendants } from '../../ast.js';

const REQUEST_NAME_PATTERN = /^(req|request)$/;
const REQUEST_INPUT_PROPERTIES = new Set(['body', 'query', 'params', 'headers', 'cookies']);
const REQUEST_BODY_READERS = new Set(['json', 'formData', 'text']);

/** How many variable hops to follow back from an expression to the request. */
const MAX_TRACE_DEPTH = 5;

/**
 * Answers "does this expression carry data the client sent?" within one file.
 *
 * Variables are resolved by name across the file, which is simple and fast but can
 * mix up two variables with the same name in different functions.
 */
export interface RequestInputTracer {
  carriesRequestInput(expression: ts.Node): boolean;
}

export function createRequestInputTracer(ast: ts.SourceFile): RequestInputTracer {
  const sources = variableSources(ast);

  const carries = (expression: ts.Node, visited: ReadonlySet<string>): boolean =>
    descendants(expression).some((node) => {
      if (isDirectRequestInput(node)) return true;
      if (!ts.isIdentifier(node) || !isValueReference(node)) return false;

      const name = node.text;
      if (visited.has(name) || visited.size >= MAX_TRACE_DEPTH) return false;
      const next = new Set([...visited, name]);
      return (sources.get(name) ?? []).some((source) => carries(source, next));
    });

  return { carriesRequestInput: (expression) => carries(expression, new Set()) };
}

/** `req.body`, `req.query.x`, `request.headers`, `await request.json()`. */
function isDirectRequestInput(node: ts.Node): boolean {
  if (ts.isPropertyAccessExpression(node) && isRequestIdentifier(node.expression)) {
    return REQUEST_INPUT_PROPERTIES.has(node.name.text);
  }
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    return (
      isRequestIdentifier(node.expression.expression) &&
      REQUEST_BODY_READERS.has(calleeName(node) ?? '')
    );
  }
  return false;
}

function isRequestIdentifier(node: ts.Node): boolean {
  return ts.isIdentifier(node) && REQUEST_NAME_PATTERN.test(node.text);
}

/** Every expression assigned to each variable name in the file. */
function variableSources(ast: ts.SourceFile): ReadonlyMap<string, readonly ts.Expression[]> {
  const pairs = descendants(ast).flatMap((node): Array<[string, ts.Expression]> => {
    if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
      return boundNames(node.name).map((name) => [name, node.initializer!]);
    }
    const isAssignment =
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left);
    return isAssignment ? [[(node.left as ts.Identifier).text, node.right]] : [];
  });

  const sources = new Map<string, ts.Expression[]>();
  for (const [name, expression] of pairs) {
    sources.set(name, [...(sources.get(name) ?? []), expression]);
  }
  return sources;
}

/** `x`, and every name inside `{ a, b: { c } }` or `[d, e]`. */
function boundNames(name: ts.BindingName): readonly string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : boundNames(element.name),
  );
}

/** False for the `x` in `obj.x` and `{ x: 1 }`, which name a property rather than a variable. */
function isValueReference(identifier: ts.Identifier): boolean {
  const parent = identifier.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === identifier) return false;
  if (ts.isPropertyAssignment(parent) && parent.name === identifier) return false;
  return true;
}
