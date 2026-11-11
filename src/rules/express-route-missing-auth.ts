import ts from 'typescript';
import { calleeName, descendants, locationOf } from '../ast.js';
import type { Finding, Rule, SourceFile } from '../types.js';
import {
  MUTATING_METHODS,
  PUBLIC_PATH_PATTERN,
  hasAuthEvidence,
  isAuthName,
  localDefinition,
} from './shared/auth.js';
import { unverifiedStripeEvent } from './shared/stripe.js';

/** `req.user`, `req.session`, ...: identity set by an auth middleware registered elsewhere. */
const REQUEST_IDENTITY_PROPERTIES = new Set([
  'user',
  'userId',
  'auth',
  'session',
  'operator',
  'account',
  'principal',
  'person',
  'currentUser',
]);
const REQUEST_NAME_PATTERN = /^(req|request)$/;

/** Route parameters that usually point at one user's record. */
const ID_PARAMETER_PATTERN = /:[A-Za-z]*(id|Id|ID|code|slug)\b/;

const REMEDIATION_EXAMPLE = `- router.delete('/api/products/:id', async (req, res) => {
+ router.delete('/api/products/:id', authenticateUser, async (req, res) => {
+   const product = await db.product.findUnique({ where: { id: req.params.id } })
+   if (product?.ownerId !== req.user.id) return res.sendStatus(404)
    await db.product.delete({ where: { id: req.params.id } })
    res.sendStatus(204)
  })`;

interface Route {
  readonly method: string;
  readonly path: string;
  readonly call: ts.CallExpression;
  readonly middleware: readonly ts.Expression[];
  readonly handler: ts.ArrowFunction | ts.FunctionExpression;
}

export const expressRouteMissingAuth: Rule = {
  id: 'express-route-missing-auth',
  title: 'Express route changes data without an auth check',
  severity: 'high',
  description:
    'Every Express route is reachable by anyone who knows the URL. A route that creates, ' +
    'changes or deletes data needs an auth middleware or an explicit check in the handler.',

  check(file: SourceFile): readonly Finding[] {
    const { ast } = file;
    if (ast === undefined) return [];
    // An unverified Stripe webhook gets the more specific stripe-webhook-unverified finding.
    if (hasRouterWideAuth(ast) || unverifiedStripeEvent(ast) !== undefined) return [];

    return descendants(ast)
      .flatMap(routeOf)
      .filter((route) => !PUBLIC_PATH_PATTERN.test(route.path))
      .filter((route) => !route.middleware.some((m) => isAuthMiddleware(m, ast)))
      .filter((route) => !hasAuthEvidence(route.handler, ast) && !readsRequestIdentity(route.handler))
      .map((route) => ({
        ruleId: this.id,
        title: this.title,
        severity: this.severity,
        file: file.path,
        ...locationOf(ast, route.call),
        message: messageFor(route),
        remediation: {
          summary:
            'Add your auth middleware to the route (or to the whole router with router.use) ' +
            'and check that the record belongs to req.user before changing it.',
          example: REMEDIATION_EXAMPLE,
        },
      }));
  },
};

/**
 * `router.post('/path', ...middleware, (req, res) => {...})`. The last argument must be an
 * inline function: that is what separates a route from an HTTP client call such as
 * `axios.post('/path', body)`, and it is the only handler whose body the rule can read.
 */
function routeOf(node: ts.Node): readonly Route[] {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return [];

  const method = node.expression.name.text.toUpperCase();
  const [pathArgument, ...rest] = node.arguments;
  const handler = rest.at(-1);
  const path = pathArgument === undefined ? undefined : routePath(pathArgument);
  const isInlineHandler =
    handler !== undefined && (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler));

  if (!MUTATING_METHODS.has(method) || path === undefined || !isInlineHandler) return [];
  return [{ method, path, call: node, middleware: rest.slice(0, -1), handler }];
}

function routePath(argument: ts.Expression): string | undefined {
  if (ts.isStringLiteralLike(argument)) return argument.text;
  // `${base}/devices/:id`: keep the static parts, which carry the meaning.
  if (ts.isTemplateExpression(argument)) {
    return argument.head.text + argument.templateSpans.map((span) => span.literal.text).join('');
  }
  return undefined;
}

/** `authenticateUser`, `requireShop('x')`, `passport.authenticate('jwt')`, `...guard`. */
function isAuthMiddleware(expression: ts.Expression, ast: ts.SourceFile): boolean {
  if (ts.isSpreadElement(expression)) return isAuthMiddleware(expression.expression, ast);
  if (ts.isIdentifier(expression)) {
    if (isAuthName(expression.text)) return true;
    // `const upload = [tenantAuth(), grant('upload')]`: a bundle defined in the file.
    const definition = localDefinition(expression.text, ast);
    return definition !== undefined && hasAuthEvidence(definition, ast);
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return isAuthName(expression.name.text) || isAuthMiddleware(expression.expression, ast);
  }
  if (ts.isCallExpression(expression)) {
    const name = calleeName(expression);
    return (name !== undefined && isAuthName(name)) || isAuthMiddleware(expression.expression, ast);
  }
  return false;
}

/** `router.use(requireAdmin)` guards every route registered on that router in the file. */
function hasRouterWideAuth(ast: ts.SourceFile): boolean {
  return descendants(ast).some(
    (node) =>
      ts.isCallExpression(node) &&
      calleeName(node) === 'use' &&
      node.arguments.some((argument) => isAuthMiddleware(argument, ast)),
  );
}

function readsRequestIdentity(handler: ts.Node): boolean {
  return descendants(handler).some(
    (node) =>
      ts.isPropertyAccessExpression(node) &&
      REQUEST_IDENTITY_PROPERTIES.has(node.name.text) &&
      ts.isIdentifier(node.expression) &&
      REQUEST_NAME_PATTERN.test(node.expression.text),
  );
}

function messageFor(route: Route): string {
  const base =
    `${route.method} ${route.path} has no auth middleware and the handler never checks ` +
    'who is calling. Anyone who knows the URL can run it.';
  return ID_PARAMETER_PATTERN.test(route.path)
    ? `${base} The path takes a record id (${route.path.match(ID_PARAMETER_PATTERN)?.[0]}), so check that the record belongs to the caller as well.`
    : base;
}
