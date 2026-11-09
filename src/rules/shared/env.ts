/** Prefixes that make a bundler inline the variable into browser JavaScript. */
const PUBLIC_ENV_PREFIXES = ['NEXT_PUBLIC_', 'EXPO_PUBLIC_', 'VITE_', 'REACT_APP_', 'PUBLIC_'];

export const SERVICE_ROLE_PATTERN = /SERVICE_ROLE/i;

/** The public prefix an environment variable name starts with, if any. */
export function publicPrefixOf(name: string): string | undefined {
  return PUBLIC_ENV_PREFIXES.find((prefix) => name.startsWith(prefix));
}
