import { locationAt } from '../text.js';
import type { Finding, Rule, Severity, SourceFile } from '../types.js';
import { ENABLE_RLS_ON_ALL_TABLES, type SqlStatement, splitSqlStatements } from './shared/sql.js';

const SQL_FILE_PATTERN = /\.sql$/;
const SUPABASE_PATH_PATTERN = /(^|\/)supabase\//;
/** SQL that only makes sense on Supabase, for schema files kept outside `supabase/`. */
const SUPABASE_SQL_PATTERN = /\bauth\.(uid|jwt|role)\s*\(|\bauth\.users\b|\bto\s+(anon|authenticated)\b/i;

/** Roles that bypass RLS anyway, so an open policy for them changes nothing. */
const PRIVILEGED_ROLES = new Set(['service_role', 'postgres', 'supabase_admin']);

/** Tables whose rows usually belong to one person, where public reads are a leak. */
const SENSITIVE_TABLE_PATTERN =
  /user|profile|account|customer|member|order|payment|invoice|billing|subscription|transaction|wallet|message|chat|conversation|address|phone|email|document|note|session|token|secret|key|private|medical|patient|booking|reservation/;

const NAME = String.raw`(?:"[^"]+"|[\w$]+)(?:\s*\.\s*(?:"[^"]+"|[\w$]+))?`;
const CREATE_TABLE = new RegExp(
  String.raw`^create\s+(?:(?:global|local)\s+)?(?:(temp|temporary)\s+|unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(${NAME})`,
  'i',
);
const ALTER_RLS = new RegExp(
  String.raw`^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(${NAME})\s+(enable|disable)\s+row\s+level\s+security`,
  'i',
);
const RENAME_TABLE = new RegExp(String.raw`^alter\s+table\s+(?:if\s+exists\s+)?(${NAME})\s+rename\s+to\s+(${NAME})`, 'i');
const DROP_TABLE = new RegExp(String.raw`^drop\s+table\s+(?:if\s+exists\s+)?((?:${NAME}\s*,\s*)*${NAME})`, 'i');
const CREATE_POLICY = new RegExp(String.raw`^create\s+policy\s+(${NAME})\s+on\s+(${NAME})([\s\S]*)$`, 'i');
const DROP_POLICY = new RegExp(String.raw`^drop\s+policy\s+(?:if\s+exists\s+)?(${NAME})\s+on\s+(${NAME})`, 'i');

const ENABLE_RLS_EXAMPLE = `  create table public.profiles (
    id uuid primary key references auth.users,
    full_name text
  );
+ alter table public.profiles enable row level security;
+
+ create policy "Users manage their own profile" on public.profiles
+   for all to authenticated
+   using ((select auth.uid()) = id)
+   with check ((select auth.uid()) = id);`;

const OWNER_POLICY_EXAMPLE = `- create policy "Anyone can edit posts" on public.posts
-   for update using (true);
+ create policy "Authors edit their own posts" on public.posts
+   for update to authenticated
+   using ((select auth.uid()) = author_id)
+   with check ((select auth.uid()) = author_id);`;

interface TableState {
  readonly name: string;
  readonly createdAt: SqlStatement;
  readonly rls: 'never' | 'enabled' | 'disabled';
}

interface OpenPolicy {
  readonly table: string;
  readonly name: string;
  readonly command: string;
  readonly statement: SqlStatement;
}

interface SchemaState {
  readonly tables: ReadonlyMap<string, TableState>;
  readonly policies: ReadonlyMap<string, OpenPolicy>;
}

export const supabaseRls: Rule = {
  id: 'supabase-rls',
  title: 'Supabase table readable or writable by anyone',
  severity: 'critical',
  description:
    'Supabase exposes every table in the public schema through its API, using a key that ' +
    'ships with the web app. Row Level Security policies are the only thing that stops a ' +
    'visitor from reading or changing every row.',

  project: {
    appliesTo: (path) => SQL_FILE_PATTERN.test(path),

    check(files: readonly SourceFile[]): readonly Finding[] {
      const supabaseFiles = files.filter(
        (file) => SUPABASE_PATH_PATTERN.test(file.path) || SUPABASE_SQL_PATTERN.test(file.content),
      );
      const statements = supabaseFiles.flatMap(splitSqlStatements);
      const state = statements.reduce(applyStatement, { tables: new Map(), policies: new Map() });

      const tableFindings = [...state.tables.values()]
        .filter((table) => table.rls !== 'enabled')
        .map((table) => tableFinding(supabaseRls, table, supabaseFiles));
      const policyFindings = [...state.policies.values()]
        .filter((policy) => state.tables.get(policy.table)?.rls !== 'never')
        .map((policy) => policyFinding(supabaseRls, policy, supabaseFiles));
      return [...tableFindings, ...policyFindings];
    },
  },
};

/** Applies one statement to the schema, returning the new state (the old one is untouched). */
function applyStatement(state: SchemaState, statement: SqlStatement): SchemaState {
  const { text } = statement;
  const tables = new Map(state.tables);
  const policies = new Map(state.policies);

  if (text === ENABLE_RLS_ON_ALL_TABLES) {
    for (const table of tables.values()) tables.set(table.name, { ...table, rls: 'enabled' });
    return { tables, policies };
  }

  const created = CREATE_TABLE.exec(text);
  if (created !== null && created[1] === undefined) {
    const name = publicName(created[2]!);
    if (name !== undefined && !tables.has(name)) tables.set(name, { name, createdAt: statement, rls: 'never' });
  }

  const altered = ALTER_RLS.exec(text);
  const alteredName = altered === null ? undefined : publicName(altered[1]!);
  const alteredTable = alteredName === undefined ? undefined : tables.get(alteredName);
  if (alteredTable !== undefined) {
    tables.set(alteredTable.name, { ...alteredTable, rls: altered![2]!.toLowerCase() === 'enable' ? 'enabled' : 'disabled' });
  }

  const renamed = RENAME_TABLE.exec(text);
  const from = renamed === null ? undefined : publicName(renamed[1]!);
  const to = renamed === null ? undefined : publicName(renamed[2]!);
  if (from !== undefined && to !== undefined && tables.has(from)) {
    tables.set(to, { ...tables.get(from)!, name: to });
    tables.delete(from);
  }

  const dropped = DROP_TABLE.exec(text);
  for (const name of dropped === null ? [] : dropped[1]!.split(',')) {
    const table = publicName(name.trim());
    if (table !== undefined) tables.delete(table);
  }

  const policy = CREATE_POLICY.exec(text);
  const openPolicy = policy === null ? undefined : openPolicyOf(policy, statement);
  if (openPolicy !== undefined) policies.set(policyKey(openPolicy.table, openPolicy.name), openPolicy);

  const droppedPolicy = DROP_POLICY.exec(text);
  const droppedTable = droppedPolicy === null ? undefined : publicName(droppedPolicy[2]!);
  if (droppedTable !== undefined) policies.delete(policyKey(droppedTable, unquote(droppedPolicy![1]!)));

  return { tables, policies };
}

/** A permissive policy whose condition is literally `true`, for roles RLS applies to. */
function openPolicyOf(match: RegExpExecArray, statement: SqlStatement): OpenPolicy | undefined {
  const table = publicName(match[2]!);
  const rest = match[3]!.toLowerCase();
  if (table === undefined || /\bas\s+restrictive\b/.test(rest)) return undefined;

  const command = /\bfor\s+(all|select|insert|update|delete)\b/.exec(rest)?.[1]?.toUpperCase() ?? 'ALL';
  const roles = /\bto\s+([\w\s,"]+?)(?=\s+(?:using|with)\b|$)/.exec(rest)?.[1];
  const roleNames = roles === undefined ? ['public'] : roles.split(',').map((role) => unquote(role.trim()));
  if (roleNames.every((role) => PRIVILEGED_ROLES.has(role))) return undefined;

  const usingTrue = /\busing\s*\(\s*true\s*\)/.test(rest);
  const checkTrue = /\bwith\s+check\s*\(\s*true\s*\)/.test(rest);
  const isOpen = command === 'INSERT' ? checkTrue : usingTrue;
  return isOpen ? { table, name: unquote(match[1]!), command, statement } : undefined;
}

function tableFinding(rule: Rule, table: TableState, files: readonly SourceFile[]): Finding {
  const state =
    table.rls === 'disabled'
      ? 'has Row Level Security disabled again by a later migration'
      : 'never has Row Level Security enabled';
  return {
    ruleId: rule.id,
    title: rule.title,
    severity: 'critical',
    file: table.createdAt.file,
    ...locationAt(contentOf(table.createdAt.file, files), table.createdAt.offset),
    message:
      `Table ${table.name} ${state}. Anyone with your project URL and anon key, which ship ` +
      'with the web app, can read, change and delete every row.',
    remediation: {
      summary:
        'Enable Row Level Security on the table and add policies that compare auth.uid() ' +
        'with the owner column. Without policies, RLS denies everything, which is safe.',
      example: ENABLE_RLS_EXAMPLE,
    },
  };
}

function policyFinding(rule: Rule, policy: OpenPolicy, files: readonly SourceFile[]): Finding {
  const severity = policySeverity(policy);
  const what =
    policy.command === 'SELECT'
      ? 'read every row'
      : policy.command === 'INSERT'
        ? 'insert rows'
        : `run ${policy.command === 'ALL' ? 'every operation, including UPDATE and DELETE,' : policy.command} on every row`;
  return {
    ruleId: rule.id,
    title: rule.title,
    severity,
    file: policy.statement.file,
    ...locationAt(contentOf(policy.statement.file, files), policy.statement.offset),
    message:
      `Policy "${policy.name}" on ${policy.table} uses true as its condition, so any visitor ` +
      `can ${what}.` +
      (severity === 'low' ? ' Keep it only if this table is meant to be public.' : ''),
    remediation: {
      summary:
        'Replace true with a condition on the caller, usually (select auth.uid()) = <owner ' +
        'column>, and limit the policy to the authenticated role.',
      example: OWNER_POLICY_EXAMPLE,
    },
  };
}

/** Writes are never safe to open; reads depend on whether the data is personal. */
function policySeverity(policy: OpenPolicy): Severity {
  if (policy.command === 'INSERT') return 'medium';
  if (policy.command !== 'SELECT') return 'critical';
  return SENSITIVE_TABLE_PATTERN.test(policy.table) ? 'high' : 'low';
}

/** `public.posts`, `"posts"` or `posts` -> `public.posts`; other schemas -> undefined. */
function publicName(name: string): string | undefined {
  const parts = name.split('.').map((part) => unquote(part.trim()));
  const [schema, table] = parts.length === 2 ? parts : ['public', parts[0]!];
  return schema === 'public' ? `public.${table}` : undefined;
}

function unquote(name: string): string {
  return name.startsWith('"') ? name.slice(1, -1) : name.toLowerCase();
}

function policyKey(table: string, name: string): string {
  return `${table}\u0000${name}`;
}

function contentOf(file: string, files: readonly SourceFile[]): string {
  return files.find((source) => source.path === file)?.content ?? '';
}
