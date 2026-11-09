import ts from 'typescript';

const ENV_OBJECTS = new Set(['process.env', 'import.meta.env']);
const USE_CLIENT_DIRECTIVE = 'use client';

export interface SourceLocation {
  readonly line: number;
  readonly column: number;
}

/** The node itself followed by every node beneath it, in source order. */
export function descendants(node: ts.Node): readonly ts.Node[] {
  const children: ts.Node[] = [];
  ts.forEachChild(node, (child) => {
    children.push(child);
  });
  return [node, ...children.flatMap(descendants)];
}

export function locationOf(ast: ts.SourceFile, node: ts.Node): SourceLocation {
  const position = ast.getLineAndCharacterOfPosition(node.getStart(ast));
  return { line: position.line + 1, column: position.character + 1 };
}

/** True when the file opens with a `'use client'` directive (React client component). */
export function hasUseClientDirective(ast: ts.SourceFile): boolean {
  for (const statement of ast.statements) {
    const isDirective =
      ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression);
    if (!isDirective) return false;
    if (statement.expression.text === USE_CLIENT_DIRECTIVE) return true;
  }
  return false;
}

/**
 * The variable name when the node reads an environment variable
 * (`process.env.NAME`, `process.env['NAME']`, `import.meta.env.NAME`).
 */
export function envVariableName(node: ts.Node): string | undefined {
  if (ts.isPropertyAccessExpression(node) && isEnvObject(node.expression)) {
    return node.name.text;
  }
  const isStringLookup =
    ts.isElementAccessExpression(node) &&
    isEnvObject(node.expression) &&
    ts.isStringLiteralLike(node.argumentExpression);
  return isStringLookup ? node.argumentExpression.text : undefined;
}

/** The last name in a call target: `getUser` for `supabase.auth.getUser()`. */
export function calleeName(call: ts.CallExpression): string | undefined {
  const target = call.expression;
  if (ts.isIdentifier(target)) return target.text;
  if (ts.isPropertyAccessExpression(target)) return target.name.text;
  return undefined;
}

export function hasExportModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  const modifiers = ts.getModifiers(node) ?? [];
  return modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

function isEnvObject(expression: ts.Expression): boolean {
  return ENV_OBJECTS.has(expression.getText().replace(/\s+/g, ''));
}
