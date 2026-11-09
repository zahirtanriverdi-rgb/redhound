import { descendants, envVariableName, locationOf } from '../ast.js';
import type { Finding, Rule, SourceFile } from '../types.js';
import { SERVICE_ROLE_PATTERN, publicPrefixOf } from './shared/env.js';

/**
 * Names that are secret whatever the provider. A bare `API_KEY` is deliberately absent:
 * Firebase, Stripe publishable, PostHog and Maps keys are public by design.
 */
const GENERIC_SECRET_PATTERN =
  /SECRET|PRIVATE_KEY|PASSWORD|PASSWD|(DATABASE|DB|POSTGRES|MYSQL|MONGODB|MONGO|REDIS)_(URL|URI)/;

/** Providers whose API keys are server-only and billed per use. */
const SERVER_ONLY_PROVIDER_KEY_PATTERN =
  /^(OPENAI|ANTHROPIC|GEMINI|GROQ|MISTRAL|COHERE|DEEPSEEK|XAI|PERPLEXITY|OPENROUTER|TOGETHER|REPLICATE|HUGGINGFACE|ELEVENLABS|PINECONE|RESEND|SENDGRID|MAILGUN|POSTMARK|TWILIO)_(API_)?(KEY|TOKEN|AUTH_TOKEN)$/;

export const publicEnvSecret: Rule = {
  id: 'public-env-secret',
  title: 'Secret exposed through a public environment variable',
  severity: 'critical',
  description:
    'Variables with a public prefix (NEXT_PUBLIC_, VITE_, ...) are copied into the browser ' +
    'bundle at build time. Anyone can read them from the page source.',

  check(file: SourceFile): readonly Finding[] {
    const { ast } = file;
    if (ast === undefined) return [];

    return descendants(ast).flatMap((node) => {
      const name = envVariableName(node);
      const prefix = name === undefined ? undefined : publicPrefixOf(name);
      if (name === undefined || prefix === undefined) return [];

      const privateName = name.slice(prefix.length);
      if (!isSecretName(privateName)) return [];

      return [
        {
          ruleId: this.id,
          title: this.title,
          severity: this.severity,
          file: file.path,
          ...locationOf(ast, node),
          message:
            `"${name}" looks like a secret, but the ${prefix} prefix makes the bundler copy ` +
            'its value into browser JavaScript where anyone can read it.',
          remediation: {
            summary:
              `Rotate the secret now, rename the variable to ${privateName} and read it only ` +
              'in server-side code. Have the browser call your own endpoint instead.',
            example: remediationExample(name, privateName),
          },
        },
      ];
    });
  },
};

function isSecretName(privateName: string): boolean {
  // The service role key has its own, more specific rule.
  if (SERVICE_ROLE_PATTERN.test(privateName)) return false;
  return (
    GENERIC_SECRET_PATTERN.test(privateName) || SERVER_ONLY_PROVIDER_KEY_PATTERN.test(privateName)
  );
}

function remediationExample(name: string, privateName: string): string {
  return `- // browser code
- const client = createClient(process.env.${name})
+ // browser code: no secret, call your own endpoint
+ const response = await fetch('/api/your-endpoint', { method: 'POST', body })
+
+ // server-only code (route handler, server action)
+ const client = createClient(process.env.${privateName})`;
}
