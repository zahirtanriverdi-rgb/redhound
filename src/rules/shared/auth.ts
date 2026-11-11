import ts from 'typescript';
import { calleeName, descendants } from '../../ast.js';

/** Methods that change state. Public read-only GET endpoints are common and not flagged. */
export const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Function and middleware names that show the code establishes who is calling. */
const AUTH_NAME_PATTERNS = [
  /^(auth|protect|currentUser|getServerSession|getToken|getAuth|verify|jwtVerify|jwt|checkJwt|validateRequest|constructEvent|constructEventAsync|ensureLoggedIn|isAuthenticated|isLoggedIn|isAdmin)$/,
  /^(get|require|verify|check|assert|ensure|validate)(Current)?(Auth|User|Session|Token|Admin|Signature|ApiKey|Jwt|Role|Permission|Login|LoggedIn|SignedIn|Owner|Member|Shop|Vendor|Customer|Staff|Scope)/i,
  /^(authenticate|authorize|authorise)/i,
  /^(with|has)(Auth|Session|User|Role|Permission)/,
  /[a-z](Auth|Authenticated|Authorized|Authed)$/, // tenantAuth, apiKeyAuth
  // getCurrentAppUser, requireSignedInAccount, getAdminApiUser: a word saying "the caller" first.
  /^(get|require|ensure|verify|assert|check)(Current|Signed|Logged|Authed|Authenticated|Session|App|Admin|Api)\w*(User|Session|Admin|Account|Principal|Viewer|Identity)$/,
  /^([a-z]+)?guard$|Guard$/i,
  /^get(Optional)?(User|Session|Operator|Customer|Account|Principal|Viewer)\b/,
  /^(loggedIn|signedIn|authenticated)[A-Z]|[a-z](Owns|IsOwner|OwnedBy)[A-Z]?/,
];

/**
 * Paths that must work without a session: signing in, signing up, one-time codes,
 * third-party callbacks. Flagging them would only be noise.
 */
export const PUBLIC_PATH_PATTERN =
  /(^|\/)(auth|login|log-in|signin|sign-in|logout|register|signup|sign-up|forgot[^/]*|reset[^/]*|password[^/]*|otp|magic-link|verify[^/]*|callback|oauth|refresh|token|webhooks?|unsubscribe|subscribe|health[^/]*|csp-report)(\/|$)/i;

/** Header and cookie names whose presence shows the code reads a credential or a webhook signature. */
const AUTH_HEADER_PATTERN =
  /^(authorization|x-api-key|stripe-signature|svix-signature|x-hub-signature(-256)?)$|(^|[_-])(access[_-]?token|auth[_-]?token|session[_-]?(id|token)?|sid|jwt)$/i;

/**
 * `getUser()`, `getSupportNoticeUser({...})`, `getSessionUser(req)` return the caller, but
 * `getUser(params.id)` looks up someone else. Only the first kind counts as an auth check.
 */
const USER_LOOKUP_PATTERN = /^get\w*(User|Session|Viewer|Principal|Account|Admin)$/;
const CALLER_ARGUMENT_PATTERN = /^(req|request|headers|cookies|ctx|context|event)$/;

export function isAuthName(name: string): boolean {
  return AUTH_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

/** How many calls into helpers defined in the same file to follow. */
const MAX_HELPER_DEPTH = 3;

const helperCache = new WeakMap<ts.SourceFile, ReadonlyMap<string, ts.Node>>();

/**
 * True when the code under `node` calls an auth function or reads a credential header,
 * directly or inside a helper function defined in the same file.
 */
export function hasAuthEvidence(node: ts.Node, ast: ts.SourceFile): boolean {
  const helpers = localHelpers(ast);
  const search = (current: ts.Node, depth: number, seen: ReadonlySet<string>): boolean =>
    descendants(current).some((child) => {
      if (ts.isStringLiteralLike(child)) return AUTH_HEADER_PATTERN.test(child.text);
      if (!ts.isCallExpression(child)) return false;

      const name = calleeName(child);
      if (name === undefined) return false;
      if (USER_LOOKUP_PATTERN.test(name)) return looksUpCaller(child);
      if (isAuthName(name)) return true;

      const helper = ts.isIdentifier(child.expression) ? helpers.get(name) : undefined;
      if (helper === undefined || depth <= 0 || seen.has(name)) return false;
      return search(helper, depth - 1, new Set([...seen, name]));
    });
  return search(node, MAX_HELPER_DEPTH, new Set());
}

function looksUpCaller(call: ts.CallExpression): boolean {
  const first = call.arguments[0];
  if (first === undefined || ts.isObjectLiteralExpression(first)) return true;
  return ts.isIdentifier(first) && CALLER_ARGUMENT_PATTERN.test(first.text);
}

/** The expression a file-level variable is initialised with, such as a middleware bundle. */
export function localDefinition(name: string, ast: ts.SourceFile): ts.Expression | undefined {
  for (const node of descendants(ast)) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      return node.initializer;
    }
  }
  return undefined;
}

/** Functions declared in the file by name: `function f() {}` and `const f = () => {}`. */
function localHelpers(ast: ts.SourceFile): ReadonlyMap<string, ts.Node> {
  const cached = helperCache.get(ast);
  if (cached !== undefined) return cached;

  const helpers = new Map<string, ts.Node>();
  for (const node of descendants(ast)) {
    if (ts.isFunctionDeclaration(node) && node.name !== undefined && node.body !== undefined) {
      helpers.set(node.name.text, node.body);
    }
    const isFunctionVariable =
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer));
    if (isFunctionVariable) {
      const declaration = node as ts.VariableDeclaration;
      helpers.set((declaration.name as ts.Identifier).text, declaration.initializer!);
    }
  }
  helperCache.set(ast, helpers);
  return helpers;
}
