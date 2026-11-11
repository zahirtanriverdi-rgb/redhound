import ts from 'typescript';
import { calleeName, descendants } from '../../ast.js';

const REQUEST_NAME_PATTERN = /^(req|request)$/;
/** `url` and `nextUrl` carry the query string, which the client controls. */
const REQUEST_INPUT_PROPERTIES = new Set(['body', 'query', 'params', 'headers', 'cookies', 'url', 'nextUrl']);
const REQUEST_BODY_READERS = new Set(['json', 'formData', 'text']);

/** Calls whose result is a number or boolean, whatever went in. */
const CASTING_FUNCTIONS = new Set(['Number', 'parseInt', 'parseFloat', 'Boolean', 'isNaN']);

/** Operators whose result is a boolean, so no input text survives them. */
const BOOLEAN_OPERATORS = new Set([
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.InstanceOfKeyword,
  ts.SyntaxKind.InKeyword,
]);

/** How many variables and helper calls to follow back from an expression. */
const MAX_TRACE_DEPTH = 8;

/**
 * Answers "does this expression carry text the client sent?" within one file.
 *
 * Variables are resolved with the TypeScript binder, so each name is looked up in its own
 * scope. Values that cross into another file (imports) are not followed.
 */
export interface RequestInputTracer {
  carriesRequestInput(expression: ts.Node): boolean;
  /** Every expression assigned to the variable this identifier refers to. */
  sourcesOf(identifier: ts.Identifier): readonly ts.Expression[];
}

/** Parameters of a helper being followed, bound to the arguments of the call. */
type Bindings = ReadonlyMap<ts.Symbol, BoundArgument>;

interface BoundArgument {
  readonly expression: ts.Expression;
  readonly bindings: Bindings;
}

const NO_BINDINGS: Bindings = new Map();
const tracers = new WeakMap<ts.SourceFile, RequestInputTracer>();

/** One tracer per file, shared by every rule that needs it. */
export function createRequestInputTracer(ast: ts.SourceFile): RequestInputTracer {
  const cached = tracers.get(ast);
  if (cached !== undefined) return cached;

  const checker = createChecker(ast);
  const sources = variableSources(ast, checker);
  const sourcesOfSymbol = (symbol: ts.Symbol | undefined): readonly ts.Expression[] =>
    symbol === undefined ? [] : (sources.get(symbol) ?? []);

  const carries = (node: ts.Node, bindings: Bindings, depth: number): boolean => {
    if (depth <= 0) return false;
    if (isDirectRequestInput(node)) return true;
    if (isInputFree(node) || isAllowListLookup(node) || isStaticKeyList(node)) return false;

    if (ts.isConditionalExpression(node)) {
      // Only the chosen branch reaches the output, not the condition.
      return carries(node.whenTrue, bindings, depth) || carries(node.whenFalse, bindings, depth);
    }
    if (ts.isIdentifier(node)) return isValueReference(node) && carriesVariable(node, bindings, depth);
    if (ts.isCallExpression(node)) {
      const helper = localFunction(node);
      if (helper !== undefined) return helperReturnsInput(helper, node, bindings, depth);
    }

    let found = false;
    ts.forEachChild(node, (child) => {
      found ||= carries(child, bindings, depth);
    });
    return found;
  };

  /** The variable an identifier refers to, including the `x` in the shorthand `{ x }`. */
  const variableSymbol = (identifier: ts.Identifier): ts.Symbol | undefined => {
    const parent = identifier.parent;
    return ts.isShorthandPropertyAssignment(parent) && parent.name === identifier
      ? checker.getShorthandAssignmentValueSymbol(parent)
      : checker.getSymbolAtLocation(identifier);
  };

  const carriesVariable = (identifier: ts.Identifier, bindings: Bindings, depth: number): boolean => {
    const symbol = variableSymbol(identifier);
    if (symbol === undefined) return false;
    const bound = bindings.get(symbol);
    if (bound !== undefined) return carries(bound.expression, bound.bindings, depth - 1);
    return sourcesOfSymbol(symbol).some((source) => carries(source, NO_BINDINGS, depth - 1));
  };

  /** `marks(ids.length)` where `marks` is defined in this file: follow what it returns. */
  const helperReturnsInput = (
    helper: ts.SignatureDeclaration & { body?: ts.Node },
    call: ts.CallExpression,
    bindings: Bindings,
    depth: number,
  ): boolean => {
    const parameterBindings = new Map<ts.Symbol, BoundArgument>();
    helper.parameters.forEach((parameter, index) => {
      const symbol = checker.getSymbolAtLocation(parameter.name);
      const argument = call.arguments[index];
      if (symbol !== undefined && argument !== undefined) {
        parameterBindings.set(symbol, { expression: argument, bindings });
      }
    });
    return returnedExpressions(helper).some((returned) =>
      carries(returned, parameterBindings, depth - 1),
    );
  };

  const localFunction = (call: ts.CallExpression): (ts.SignatureDeclaration & { body?: ts.Node }) | undefined => {
    if (!ts.isIdentifier(call.expression)) return undefined;
    const symbol = checker.getSymbolAtLocation(call.expression);
    const declaration = symbol?.valueDeclaration;
    if (declaration !== undefined && ts.isFunctionDeclaration(declaration)) return declaration;
    return sourcesOfSymbol(symbol).find(
      (source): source is ts.ArrowFunction | ts.FunctionExpression =>
        ts.isArrowFunction(source) || ts.isFunctionExpression(source),
    );
  };

  /** `MAP[input]` where MAP is an object or array literal: the result is a value the server wrote. */
  const isAllowListLookup = (node: ts.Node): boolean =>
    ts.isElementAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    isLiteralCollection(sourcesOfSymbol(checker.getSymbolAtLocation(node.expression)));

  /** `Object.keys(x)` where x is an object literal: the keys are fixed in the code. */
  const isStaticKeyList = (node: ts.Node): boolean => {
    if (!ts.isCallExpression(node) || node.expression.getText() !== 'Object.keys') return false;
    const argument = node.arguments[0];
    if (argument === undefined) return false;
    if (ts.isObjectLiteralExpression(argument)) return hasStaticKeys(argument);
    if (!ts.isIdentifier(argument)) return false;
    const argumentSources = sourcesOfSymbol(checker.getSymbolAtLocation(argument));
    return (
      argumentSources.length > 0 &&
      argumentSources.every((source) => ts.isObjectLiteralExpression(source) && hasStaticKeys(source))
    );
  };

  const tracer: RequestInputTracer = {
    carriesRequestInput: (expression) => carries(expression, NO_BINDINGS, MAX_TRACE_DEPTH),
    sourcesOf: (identifier) => sourcesOfSymbol(variableSymbol(identifier)),
  };
  tracers.set(ast, tracer);
  return tracer;
}

/** A checker over this one file only: enough to resolve local names, cheap to build. */
function createChecker(ast: ts.SourceFile): ts.TypeChecker {
  const host: ts.CompilerHost = {
    getSourceFile: (fileName) => (fileName === ast.fileName ? ast : undefined),
    fileExists: (fileName) => fileName === ast.fileName,
    readFile: () => undefined,
    writeFile: () => undefined,
    getDefaultLibFileName: () => 'lib.d.ts',
    getCurrentDirectory: () => '',
    getCanonicalFileName: (fileName) => fileName,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
  };
  const options: ts.CompilerOptions = { noLib: true, noResolve: true, allowJs: true, types: [] };
  return ts.createProgram([ast.fileName], options, host).getTypeChecker();
}

/** `req.body`, `req.query.x`, `request.headers`, `request.url`, `await request.json()`. */
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

/** Expressions whose value cannot contain client-written text. */
function isInputFree(node: ts.Node): boolean {
  if (ts.isTypeOfExpression(node)) return true;
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) return true;
  if (ts.isBinaryExpression(node) && BOOLEAN_OPERATORS.has(node.operatorToken.kind)) return true;
  if (ts.isPropertyAccessExpression(node) && node.name.text === 'length') return true;
  if (!ts.isCallExpression(node)) return false;

  const callee = node.expression;
  if (ts.isIdentifier(callee) && CASTING_FUNCTIONS.has(callee.text)) return true;
  if (ts.isPropertyAccessExpression(callee) && callee.expression.getText() === 'Math') return true;
  return isLiteralMap(node);
}

/** `ids.map(() => '?')`: one fixed string per item, such as SQL placeholders. */
function isLiteralMap(call: ts.CallExpression): boolean {
  const callback = call.arguments[0];
  if (calleeName(call) !== 'map' || callback === undefined) return false;
  if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) return false;
  const returned = returnedExpressions(callback);
  return returned.length > 0 && returned.every((expression) => ts.isStringLiteralLike(expression));
}

/** The expression of an arrow body, or of each `return` in a function body (not nested ones). */
function returnedExpressions(fn: ts.SignatureDeclaration & { body?: ts.Node }): readonly ts.Expression[] {
  const body = fn.body;
  if (body === undefined) return [];
  if (!ts.isBlock(body)) return [body as ts.Expression];

  const found: ts.Expression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node) && node.expression !== undefined) found.push(node.expression);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return found;
}

function isLiteralCollection(sources: readonly ts.Expression[]): boolean {
  return (
    sources.length > 0 &&
    sources.every((source) => ts.isObjectLiteralExpression(source) || ts.isArrayLiteralExpression(source))
  );
}

function hasStaticKeys(object: ts.ObjectLiteralExpression): boolean {
  return object.properties.every(
    (property) => !ts.isSpreadAssignment(property) && !ts.isComputedPropertyName(property.name ?? property),
  );
}

function isRequestIdentifier(node: ts.Node): boolean {
  return ts.isIdentifier(node) && REQUEST_NAME_PATTERN.test(node.text);
}

/** Every expression assigned to each variable, keyed by the variable's symbol. */
function variableSources(
  ast: ts.SourceFile,
  checker: ts.TypeChecker,
): ReadonlyMap<ts.Symbol, readonly ts.Expression[]> {
  const sources = new Map<ts.Symbol, ts.Expression[]>();
  const add = (nameNode: ts.Node, expression: ts.Expression): void => {
    const symbol = checker.getSymbolAtLocation(nameNode);
    if (symbol !== undefined) sources.set(symbol, [...(sources.get(symbol) ?? []), expression]);
  };

  for (const node of descendants(ast)) {
    if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
      for (const name of boundIdentifiers(node.name)) add(name, node.initializer);
    }
    const isAssignment =
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left);
    if (isAssignment) add(node.left, node.right);
  }
  return sources;
}

/** `x`, and every identifier inside `{ a, b: { c } }` or `[d, e]`. */
function boundIdentifiers(name: ts.BindingName): readonly ts.Identifier[] {
  if (ts.isIdentifier(name)) return [name];
  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : boundIdentifiers(element.name),
  );
}

/** False for the `x` in `obj.x` and `{ x: 1 }`, which name a property rather than a variable. */
function isValueReference(identifier: ts.Identifier): boolean {
  const parent = identifier.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === identifier) return false;
  if (ts.isPropertyAssignment(parent) && parent.name === identifier) return false;
  return true;
}
