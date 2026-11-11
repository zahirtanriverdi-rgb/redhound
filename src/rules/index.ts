import type { Rule } from '../types.js';
import { expressRouteMissingAuth } from './express-route-missing-auth.js';
import { firebaseOpenRules } from './firebase-open-rules.js';
import { llmPromptInjection } from './llm-prompt-injection.js';
import { nextjsRouteMissingAuth } from './nextjs-route-missing-auth.js';
import { publicEnvSecret } from './public-env-secret.js';
import { stripeWebhookUnverified } from './stripe-webhook-unverified.js';
import { supabaseServiceRoleClient } from './supabase-service-role-client.js';

/** Every built-in rule. To add one, create a file in this folder and list it here. */
export const builtinRules: readonly Rule[] = [
  supabaseServiceRoleClient,
  publicEnvSecret,
  nextjsRouteMissingAuth,
  expressRouteMissingAuth,
  stripeWebhookUnverified,
  llmPromptInjection,
  firebaseOpenRules,
];
