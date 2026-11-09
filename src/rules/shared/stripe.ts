import ts from 'typescript';
import { calleeName, descendants } from '../../ast.js';

/** Stripe event types an app typically acts on. Matching one means the code handles Stripe events. */
const STRIPE_EVENT_TYPE_PATTERN =
  /^(checkout\.session\.(completed|expired|async_payment_succeeded|async_payment_failed)|payment_intent\.(succeeded|payment_failed|canceled)|customer\.subscription\.(created|updated|deleted)|invoice\.(paid|payment_succeeded|payment_failed|finalized)|charge\.(succeeded|failed|refunded))$/;

const SIGNATURE_VERIFIERS = new Set(['constructEvent', 'constructEventAsync']);
const REQUEST_NAME_PATTERN = /^(req|request)$/i;
const BODY_READERS = new Set(['json', 'text', 'arrayBuffer']);
const BODY_PROPERTIES = new Set(['body', 'rawBody']);

/**
 * The first Stripe event type literal in a file that reads an incoming request and acts on
 * Stripe events without ever verifying the signature. Undefined when the file is fine.
 *
 * Files that only handle event types (helpers called after verification) are not matched,
 * because they never read a request themselves.
 */
export function unverifiedStripeEvent(ast: ts.SourceFile): ts.Node | undefined {
  const nodes = descendants(ast);

  const isVerified = nodes.some(
    (node) => ts.isCallExpression(node) && SIGNATURE_VERIFIERS.has(calleeName(node) ?? ''),
  );
  if (isVerified || !nodes.some(readsRequestBody)) return undefined;

  return nodes.find(
    (node) => ts.isStringLiteralLike(node) && STRIPE_EVENT_TYPE_PATTERN.test(node.text),
  );
}

/** `request.json()`, `req.text()`, `req.body`, `req.rawBody`. */
function readsRequestBody(node: ts.Node): boolean {
  if (!ts.isPropertyAccessExpression(node)) return false;
  if (!ts.isIdentifier(node.expression) || !REQUEST_NAME_PATTERN.test(node.expression.text)) {
    return false;
  }
  const property = node.name.text;
  const isCalled = ts.isCallExpression(node.parent) && node.parent.expression === node;
  return isCalled ? BODY_READERS.has(property) : BODY_PROPERTIES.has(property);
}
