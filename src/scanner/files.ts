import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.next',
  '.turbo',
  '.vercel',
  'dist',
  'build',
  'out',
  'coverage',
]);

const SCRIPT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

/** Firebase security rules: `firestore.rules`, `storage.rules`, `database.rules.json`. */
const RULES_FILE_PATTERN = /\.rules(\.json)?$/;

/** JavaScript or TypeScript, which the scanner parses into a syntax tree. */
export function isScriptFile(filePath: string): boolean {
  return SCRIPT_EXTENSIONS.has(path.extname(filePath));
}

function isScannable(fileName: string): boolean {
  return isScriptFile(fileName) || RULES_FILE_PATTERN.test(fileName);
}

/** Throws a readable error unless `root` is an existing directory. */
export async function assertDirectory(root: string): Promise<void> {
  const stats = await stat(root).catch(() => undefined);
  if (stats === undefined) throw new Error(`Path does not exist: ${root}`);
  if (!stats.isDirectory()) throw new Error(`Path is not a directory: ${root}`);
}

/**
 * Scannable files under `root` as sorted relative paths with forward slashes.
 * Symbolic links are not followed, so a scan never leaves the root.
 */
export async function collectSourceFiles(root: string, relativeDir = ''): Promise<string[]> {
  const entries = await readdir(path.join(root, relativeDir), { withFileTypes: true });

  const nested = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const relativePath = relativeDir === '' ? entry.name : `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) {
        return IGNORED_DIRECTORIES.has(entry.name) ? [] : collectSourceFiles(root, relativePath);
      }
      return entry.isFile() && isScannable(entry.name) ? [relativePath] : [];
    }),
  );

  return nested.flat().sort();
}
