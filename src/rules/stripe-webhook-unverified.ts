import { locationOf } from '../ast.js';
import type { Finding, Rule, SourceFile } from '../types.js';
import { unverifiedStripeEvent } from './shared/stripe.js';

const REMEDIATION_EXAMPLE = `  export async function POST(request: Request) {
-   const event = await request.json()
+   const payload = await request.text() // raw body: parsing it first breaks the signature
+   const signature = request.headers.get('stripe-signature') ?? ''
+   let event
+   try {
+     event = stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET)
+   } catch {
+     return new Response('Invalid signature', { status: 400 })
+   }

    if (event.type === 'checkout.session.completed') {`;

export const stripeWebhookUnverified: Rule = {
  id: 'stripe-webhook-unverified',
  title: 'Stripe webhook acts on events without verifying the signature',
  severity: 'critical',
  description:
    'A webhook URL is public. Without signature verification anyone can post a fake ' +
    '"payment succeeded" event and get paid features for free.',

  check(file: SourceFile): readonly Finding[] {
    const { ast } = file;
    if (ast === undefined) return [];

    const eventLiteral = unverifiedStripeEvent(ast);
    if (eventLiteral === undefined) return [];

    return [
      {
        ruleId: this.id,
        title: this.title,
        severity: this.severity,
        file: file.path,
        ...locationOf(ast, eventLiteral),
        message:
          'This code acts on Stripe events read straight from the request body. ' +
          'Anyone can send a forged event to the webhook URL.',
        remediation: {
          summary:
            'Build the event with stripe.webhooks.constructEvent() from the raw body, the ' +
            'stripe-signature header and your webhook secret, and reject the request when it throws.',
          example: REMEDIATION_EXAMPLE,
        },
      },
    ];
  },
};
