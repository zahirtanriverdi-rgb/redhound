import { descendants, envVariableName, hasUseClientDirective, locationOf } from '../ast.js';
import type { Finding, Rule, SourceFile } from '../types.js';
import { SERVICE_ROLE_PATTERN, publicPrefixOf } from './shared/env.js';

const REMEDIATION_EXAMPLE = `- // browser code
- const supabase = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY)
+ // browser code: the anon key is safe to ship, Row Level Security does the protecting
+ const supabase = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
+
+ // server-only code (route handler, server action): privileged work goes here
+ const supabaseAdmin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY)`;

export const supabaseServiceRoleClient: Rule = {
  id: 'supabase-service-role-client',
  title: 'Supabase service role key exposed to the browser',
  severity: 'critical',
  description:
    'The service role key bypasses Row Level Security. Anyone who can read it in the ' +
    'browser bundle has full read and write access to the whole database.',

  check(file: SourceFile): readonly Finding[] {
    const { ast } = file;
    if (ast === undefined) return [];
    const isClientFile = hasUseClientDirective(ast);

    return descendants(ast).flatMap((node) => {
      const name = envVariableName(node);
      if (name === undefined || !SERVICE_ROLE_PATTERN.test(name)) return [];

      const hasPublicPrefix = publicPrefixOf(name) !== undefined;
      if (!hasPublicPrefix && !isClientFile) return [];

      const reason = hasPublicPrefix
        ? `"${name}" has a public prefix, so the bundler inlines its value into browser JavaScript.`
        : `"${name}" is read in a "use client" file, which is shipped to the browser.`;

      return [
        {
          ruleId: this.id,
          title: this.title,
          severity: this.severity,
          file: file.path,
          ...locationOf(ast, node),
          message: `${reason} The service role key bypasses Row Level Security.`,
          remediation: {
            summary:
              'Rotate the key now, rename the variable without a public prefix, and use it ' +
              'only in server-side code. Use the anon key in the browser.',
            example: REMEDIATION_EXAMPLE,
          },
        },
      ];
    });
  },
};
