import { createRequire } from 'node:module';
import path from 'node:path';
import { Command, CommanderError, Option } from 'commander';
import { errorMessage } from './errors.js';
import { formatJson } from './reporters/json.js';
import { formatTable } from './reporters/table.js';
import { scan } from './scanner/scan.js';
import { SEVERITIES, type ScanResult, type Severity } from './types.js';

export const EXIT_CLEAN = 0;
export const EXIT_FINDINGS = 1;
export const EXIT_ERROR = 2;

const FORMATS = ['table', 'json'] as const;
type Format = (typeof FORMATS)[number];

const FORMATTERS: Readonly<Record<Format, (result: ScanResult) => string>> = {
  table: formatTable,
  json: formatJson,
};

/** Where the CLI writes, so tests can capture output without touching the process. */
export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

interface ScanFlags {
  readonly path?: string;
  readonly format: Format;
  readonly severity: Severity;
}

/** Runs the CLI and resolves to the process exit code. Never throws. */
export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  let exitCode = EXIT_CLEAN;

  const program = new Command()
    .name('redhound')
    .description('Security scanner for AI-generated and vibe-coded apps.')
    .version(readVersion())
    .exitOverride()
    .configureOutput({ writeOut: io.stdout, writeErr: io.stderr });

  program
    .command('scan')
    .description('Scan a directory for security issues')
    .argument('[path]', 'directory to scan')
    .option('-p, --path <dir>', 'directory to scan (same as the argument)')
    .addOption(new Option('-f, --format <format>', 'output format').choices(FORMATS).default('table'))
    .addOption(
      new Option('-s, --severity <level>', 'minimum severity to report')
        .choices(SEVERITIES)
        .default('low'),
    )
    .action(async (pathArgument: string | undefined, flags: ScanFlags) => {
      const root = path.resolve(pathArgument ?? flags.path ?? '.');
      const result = await scan({ root, minSeverity: flags.severity });

      io.stdout(FORMATTERS[flags.format](result));
      for (const error of result.errors) {
        io.stderr(`warning: could not scan ${error.file}: ${error.message}\n`);
      }
      exitCode = result.findings.length > 0 ? EXIT_FINDINGS : EXIT_CLEAN;
    });

  try {
    await program.parseAsync([...argv], { from: 'user' });
    return exitCode;
  } catch (error: unknown) {
    if (error instanceof CommanderError) {
      // Commander has already printed its own message (help, version or a usage error).
      return error.exitCode === 0 ? EXIT_CLEAN : EXIT_ERROR;
    }
    io.stderr(`error: ${errorMessage(error)}\n`);
    return EXIT_ERROR;
  }
}

function readVersion(): string {
  const manifest: unknown = createRequire(import.meta.url)('../package.json');
  const version = (manifest as { version?: unknown }).version;
  if (typeof version !== 'string') throw new Error('package.json has no version field');
  return version;
}
