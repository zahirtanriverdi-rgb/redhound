import ts from 'typescript';
import { hasExportModifier, locationOf } from '../ast.js';
import type { Finding, Rule, SourceFile } from '../types.js';
import { MUTATING_METHODS, hasAuthEvidence } from './shared/auth.js';
import { unverifiedStripeEvent } from './shared/stripe.js';

// App Router route handlers: any `route.ts` below an `app/` directory (also under `src/`).
const ROUTE_FILE_PATTERN = /(^|\/)app\/(.+\/)?route\.(ts|tsx|js|jsx|mjs)$/;

const REMEDIATION_EXAMPLE = `  export async function POST(request: Request) {
+   const session = await auth()
+   if (!session?.user) {
+     return new Response('Unauthorized', { status: 401 })
+   }
+
    const body = await request.json()
-   const post = await db.post.create({ data: body })
+   const post = await db.post.create({ data: { ...body, authorId: session.user.id } })
    return Response.json(post)
  }`;

interface Handler {
  readonly method: string;
  readonly nameNode: ts.Node;
  readonly body: ts.Node;
}

export const nextjsRouteMissingAuth: Rule = {
  id: 'nextjs-route-missing-auth',
  title: 'Next.js route handler changes data without an auth check',
  severity: 'high',
  description:
    'A route handler is a public HTTP endpoint. Hiding a button in the UI does not protect ' +
    'it: anyone can call the URL directly, so the handler itself must check who is calling.',

  check(file: SourceFile): readonly Finding[] {
    const { ast } = file;
    if (ast === undefined || !ROUTE_FILE_PATTERN.test(file.path)) return [];
    // An unverified Stripe webhook gets the more specific stripe-webhook-unverified finding.
    if (unverifiedStripeEvent(ast) !== undefined) return [];

    return ast.statements
      .flatMap(inlineHandlers)
      .filter((handler) => !hasAuthEvidence(handler.body))
      .map((handler) => ({
        ruleId: this.id,
        title: this.title,
        severity: this.severity,
        file: file.path,
        ...locationOf(ast, handler.nameNode),
        message:
          `${handler.method} handler never checks who is calling. ` +
          'Anyone who knows the URL can run it.',
        remediation: {
          summary:
            'Verify the session (or webhook signature) at the top of the handler and return ' +
            '401 when it is missing. Scope the query to the authenticated user.',
          example: REMEDIATION_EXAMPLE,
        },
      }));
  },
};

/**
 * Exported mutating handlers whose body is written inline. Handlers assigned from a call
 * such as `export const POST = withAuth(...)` are left alone: the wrapper may do the check.
 */
function inlineHandlers(statement: ts.Statement): readonly Handler[] {
  if (!hasExportModifier(statement)) return [];

  if (ts.isFunctionDeclaration(statement)) {
    const name = statement.name;
    if (name === undefined || !MUTATING_METHODS.has(name.text)) return [];
    return [{ method: name.text, nameNode: name, body: statement }];
  }

  if (!ts.isVariableStatement(statement)) return [];

  return statement.declarationList.declarations.flatMap((declaration) => {
    const { name, initializer } = declaration;
    const isInlineFunction =
      initializer !== undefined &&
      (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer));
    if (!ts.isIdentifier(name) || !MUTATING_METHODS.has(name.text) || !isInlineFunction) {
      return [];
    }
    return [{ method: name.text, nameNode: name, body: initializer }];
  });
}
