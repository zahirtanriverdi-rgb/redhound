import ts from 'typescript';
import { calleeName, descendants, locationOf } from '../ast.js';
import type { Finding, Rule, SourceFile } from '../types.js';
import { createRequestInputTracer, type RequestInputTracer } from './shared/request-input.js';

/**
 * Methods that run SQL text: pg, mysql2, sqlite, better-sqlite3, knex, Sequelize,
 * pg-promise, postgres.js and Prisma's unsafe variants. Several names are generic
 * (`get`, `run`), so the SQL text itself is also required to look like SQL.
 */
const SQL_METHODS = new Set([
  'query',
  'execute',
  'raw',
  'unsafe',
  '$queryRawUnsafe',
  '$executeRawUnsafe',
  'exec',
  'prepare',
  'all',
  'get',
  'run',
  'any',
  'many',
  'one',
  'oneOrNone',
  'none',
]);

const SQL_TEXT_PATTERN =
  /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|WHERE|ORDER\s+BY|GROUP\s+BY|VALUES|LIMIT)\b/i;

/** How many variables to follow when the SQL text is built before the call. */
const MAX_QUERY_DEPTH = 3;

const REMEDIATION_EXAMPLE = `- await pool.query(\`SELECT * FROM users WHERE email = '\${req.body.email}'\`)
+ await pool.query('SELECT * FROM users WHERE email = $1', [req.body.email])

  // Identifiers (columns, sort order) cannot be parameters: pick them from an allow-list.
- await pool.query(\`SELECT * FROM users ORDER BY \${req.query.sort}\`)
+ const SORTABLE = { name: 'name', newest: 'created_at' } as const
+ const column = SORTABLE[req.query.sort as keyof typeof SORTABLE] ?? 'created_at'
+ await pool.query(\`SELECT * FROM users ORDER BY \${column}\`)`;

/** The SQL text of a query, split into what the code wrote and what it interpolated. */
interface QueryText {
  readonly staticText: string;
  readonly dynamicParts: readonly ts.Expression[];
}

export const sqlInjection: Rule = {
  id: 'sql-injection',
  title: 'Request input written into SQL text',
  severity: 'critical',
  description:
    'Building SQL from client input lets the client change the query itself: read other ' +
    "users' data, bypass a login, or delete tables. Values must travel as parameters.",

  check(file: SourceFile): readonly Finding[] {
    const { ast } = file;
    if (ast === undefined) return [];
    const tracer = createRequestInputTracer(ast);

    return descendants(ast).flatMap((node): readonly Finding[] => {
      const sqlArgument = sqlArgumentOf(node);
      if (sqlArgument === undefined) return [];

      const text = queryText(sqlArgument, tracer, MAX_QUERY_DEPTH);
      if (!SQL_TEXT_PATTERN.test(text.staticText)) return [];

      const injected = text.dynamicParts.find((part) => tracer.carriesRequestInput(part));
      if (injected === undefined) return [];

      return [
        {
          ruleId: this.id,
          title: this.title,
          severity: this.severity,
          file: file.path,
          ...locationOf(ast, node),
          message:
            `\`${injected.getText()}\` comes from the request and is written straight into ` +
            'the SQL text, so a client can rewrite the query.',
          remediation: {
            summary:
              'Pass values as query parameters ($1 or ?). For column names and sort ' +
              'directions, map the input to a fixed allow-list instead.',
            example: REMEDIATION_EXAMPLE,
          },
        },
      ];
    });
  },
};

function sqlArgumentOf(node: ts.Node): ts.Expression | undefined {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return undefined;
  return SQL_METHODS.has(calleeName(node) ?? '') ? node.arguments[0] : undefined;
}

/**
 * Splits `\`SELECT ... ${x}\``, `'SELECT ' + x` and a variable holding either into static
 * text and interpolated parts. Tagged templates (`sql\`...\``) are safe and yield nothing.
 */
function queryText(expression: ts.Expression, tracer: RequestInputTracer, depth: number): QueryText {
  if (ts.isParenthesizedExpression(expression)) return queryText(expression.expression, tracer, depth);
  if (ts.isStringLiteralLike(expression)) return { staticText: expression.text, dynamicParts: [] };

  if (ts.isTemplateExpression(expression)) {
    return {
      staticText: [expression.head.text, ...expression.templateSpans.map((s) => s.literal.text)].join(' '),
      dynamicParts: expression.templateSpans.map((span) => span.expression),
    };
  }

  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = queryText(expression.left, tracer, depth);
    const right = queryText(expression.right, tracer, depth);
    return {
      staticText: `${left.staticText} ${right.staticText}`,
      dynamicParts: [...left.dynamicParts, ...right.dynamicParts],
    };
  }

  if (ts.isIdentifier(expression) && depth > 0) {
    const parts = tracer.sourcesOf(expression).map((source) => queryText(source, tracer, depth - 1));
    return {
      staticText: parts.map((part) => part.staticText).join(' '),
      dynamicParts: parts.flatMap((part) => part.dynamicParts),
    };
  }

  // Calls, tagged templates and anything else: no SQL text the rule can see.
  return { staticText: '', dynamicParts: ts.isTaggedTemplateExpression(expression) ? [] : [expression] };
}
