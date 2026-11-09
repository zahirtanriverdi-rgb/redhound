// Called by the webhook route after it has verified the signature.
export function planForEvent(eventType: string): 'pro' | 'free' | undefined {
  if (eventType === 'checkout.session.completed') return 'pro';
  if (eventType === 'customer.subscription.deleted') return 'free';
  return undefined;
}
