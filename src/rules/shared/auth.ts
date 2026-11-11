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
  /^([a-z]+)?guard$|Guard$/i,
  /^get(Optional)?(User|Session|Operator|Customer|Account|Principal|Viewer)\b/,
  /^(loggedIn|signedIn|authenticated)[A-Z]|[a-z](Owns|IsOwner|OwnedBy)[A-Z]?/,
];

/** Header names whose presence shows the code reads a credential or a webhook signature. */
const AUTH_HEADER_PATTERN =
  /^(authorization|x-api-key|stripe-signature|svix-signature|x-hub-signature(-256)?)$/i;

export function isAuthName(name: string): boolean {
  return AUTH_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

/** True when the code under `node` calls an auth function or reads a credential header. */
export function hasAuthEvidence(node: ts.Node): boolean {
  return descendants(node).some((child) => {
    if (ts.isCallExpression(child)) {
      const name = calleeName(child);
      return name !== undefined && isAuthName(name);
    }
    return ts.isStringLiteralLike(child) && AUTH_HEADER_PATTERN.test(child.text);
  });
}
