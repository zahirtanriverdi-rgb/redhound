import type { SourceFile } from '../../types.js';

export interface SqlStatement {
  readonly file: string;
  /** Offset of the statement's first character in the original file content. */
  readonly offset: number;
  /** The statement with comments and function bodies blanked out, trimmed. */
  readonly text: string;
}

/**
 * Stands for "enable RLS on every table that exists at this point". It is produced for a
 * DO block that loops over the schema's tables, whose names cannot be read statically.
 */
export const ENABLE_RLS_ON_ALL_TABLES = '/* redhound: enable row level security on all tables */';

const COMMENT_PATTERN = /--[^\n]*|\/\*[\s\S]*?\*\//g;
/** `$$ body $$` and `$tag$ body $tag$`: function and DO block bodies. */
const DOLLAR_BODY_PATTERN = /\$([A-Za-z_]*)\$([\s\S]*?)\$\1\$/g;
const STRING_LITERAL_PATTERN = /'((?:[^']|'')*)'/g;
const ARRAY_LITERAL_PATTERN = /array\s*\[([^\]]*)\]/gi;
const DYNAMIC_ENABLE_RLS_PATTERN = /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(public\s*\.\s*)?%I\s+enable\s+row\s+level\s+security/i;
const STATIC_STATEMENT_PATTERN = /^\s*(alter\s+table|create\s+policy|drop\s+policy)\b/i;

/**
 * Splits a SQL file into statements without a full parser.
 *
 * Comments and dollar-quoted bodies are blanked out, keeping every offset, so a CREATE TABLE
 * inside a function is not mistaken for a schema change. Statements a DO block runs with
 * EXECUTE are read back from its string literals and placed where the block starts.
 */
export function splitSqlStatements(file: SourceFile): readonly SqlStatement[] {
  const withoutComments = file.content.replace(COMMENT_PATTERN, blank);

  const executed: SqlStatement[] = [];
  const code = withoutComments.replace(DOLLAR_BODY_PATTERN, (whole: string, _tag: string, body: string, offset: number) => {
    executed.push(...executedStatements(body).map((text) => ({ file: file.path, offset, text })));
    return blank(whole);
  });

  return [...topLevelStatements(file.path, code), ...executed].sort((a, b) => a.offset - b.offset);
}

function topLevelStatements(filePath: string, code: string): readonly SqlStatement[] {
  const statements: SqlStatement[] = [];
  let start = 0;
  for (const part of code.split(';')) {
    const leading = part.length - part.trimStart().length;
    const text = part.trim();
    if (text !== '') statements.push({ file: filePath, offset: start + leading, text });
    start += part.length + 1;
  }
  return statements;
}

/** Schema statements a function or DO block body runs through EXECUTE. */
function executedStatements(body: string): readonly string[] {
  const literals = [...body.matchAll(STRING_LITERAL_PATTERN)].map((match) => match[1]!.replace(/''/g, "'"));

  return literals.flatMap((literal): readonly string[] => {
    if (DYNAMIC_ENABLE_RLS_PATTERN.test(literal)) {
      const tables = arrayLiteralNames(body);
      return tables.length > 0
        ? tables.map((table) => `alter table public.${table} enable row level security`)
        : [ENABLE_RLS_ON_ALL_TABLES];
    }
    const isStatic = !literal.includes('%') && STATIC_STATEMENT_PATTERN.test(literal);
    return isStatic ? [literal.trim().replace(/;\s*$/, '')] : [];
  });
}

/** Quoted names in `ARRAY['a','b']` literals, the usual way a DO block lists its tables. */
function arrayLiteralNames(body: string): readonly string[] {
  return [...body.matchAll(ARRAY_LITERAL_PATTERN)].flatMap((match) =>
    [...match[1]!.matchAll(STRING_LITERAL_PATTERN)].map((name) => name[1]!.trim()),
  );
}

function blank(text: string): string {
  return text.replace(/[^\n]/g, ' ');
}
