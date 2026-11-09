import ts from 'typescript';
import { calleeName, descendants, hasExportModifier, locationOf } from '../ast.js';
import type { Finding, Rule, SourceFile } from '../types.js';

// App Router route handlers: any `route.ts` below an `app/` directory (also under `src/`).
const ROUTE_FILE_PATTERN = /(^|\/)app\/(.+\/)?route\.(ts|tsx|js|jsx|mjs)$/;

/** Methods that change state. Public read-only GET endpoints are common and not flagged. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Call names that show the handler establishes who is calling. */
const AUTH_CALL_PATTERNS = [
  /^(auth|protect|currentUser|getServerSession|getToken|getAuth|verify|jwtVerify|validateRequest|constructEvent|constructEventAsync)$/,
  /^(get|require|verify|check|assert|ensure|validate)(Current)?(Auth|User|Session|Token|Admin|Signature|ApiKey|Jwt|Role|Permission)/i,
  /^(authenticate|authorize)/i,
];

/** Header names whose presence shows the handler reads a credential or a webhook signature. */
const AUTH_HEADER_PATTERN =
  /^(authorization|x-api-key|stripe-signature|svix-signature|x-hub-signature(-256)?)$/i;

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
    if (!ROUTE_FILE_PATTERN.test(file.path)) return [];

    return file.ast.statements
      .flatMap(inlineHandlers)
      .filter((handler) => !hasAuthEvidence(handler.body))
      .map((handler) => ({
        ruleId: this.id,
        title: this.title,
        severity: this.severity,
        file: file.path,
        ...locationOf(file.ast, handler.nameNode),
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

function hasAuthEvidence(handlerBody: ts.Node): boolean {
  return descendants(handlerBody).some((node) => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node);
      return name !== undefined && AUTH_CALL_PATTERNS.some((pattern) => pattern.test(name));
    }
    return ts.isStringLiteralLike(node) && AUTH_HEADER_PATTERN.test(node.text);
  });
}
