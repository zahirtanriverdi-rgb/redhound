import { describe, expect, test } from 'vitest';
import { stripeWebhookUnverified } from '../../src/rules/stripe-webhook-unverified.js';
import { scan } from '../../src/scanner/scan.js';
import { fixturePath } from '../helpers.js';

const rules = [stripeWebhookUnverified];
const VULNERABLE = fixturePath('stripe-webhook-unverified', 'vulnerable');
const SAFE = fixturePath('stripe-webhook-unverified', 'safe');

describe('stripe-webhook-unverified', () => {
  test('flags a Next.js route that trusts the event body without verifying it', async () => {
    const result = await scan({ root: VULNERABLE, rules });

    const finding = result.findings.find((f) => f.file === 'app/api/webhooks/stripe/route.ts');

    expect(finding).toMatchObject({ severity: 'critical', line: 6 });
    expect(finding?.remediation.example).toContain('constructEvent');
  });

  test('flags an Express handler that trusts req.body', async () => {
    const result = await scan({ root: VULNERABLE, rules });

    const finding = result.findings.find((f) => f.file === 'server.js');

    expect(finding).toMatchObject({ severity: 'critical', line: 8 });
  });

  test('reports one finding per file even when several event types are handled', async () => {
    const result = await scan({ root: VULNERABLE, rules });

    expect(result.findings).toHaveLength(2);
  });

  test('accepts verified webhooks and helpers that never read the request', async () => {
    const result = await scan({ root: SAFE, rules });

    expect(result.filesScanned).toBe(2);
    expect(result.findings).toEqual([]);
  });

  test('is reported instead of the generic missing-auth rule for the same handler', async () => {
    const result = await scan({ root: VULNERABLE });

    const routeRules = result.findings
      .filter((f) => f.file === 'app/api/webhooks/stripe/route.ts')
      .map((f) => f.ruleId);

    expect(routeRules).toEqual(['stripe-webhook-unverified']);
  });
});
