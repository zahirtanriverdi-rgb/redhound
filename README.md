# Redhound

**Open-source CLI security scanner for AI-generated and vibe-coded apps.**

Redhound reads your codebase the way an attacker would. It looks for the security gaps that AI coding assistants (Cursor, Claude Code, Copilot, v0, Lovable, Bolt) tend to leave behind, tells you exactly where they are, and shows you how to close them.

> **Status: early development.** Nothing is published to npm yet. The rule list and CLI below describe what we are building. Contributors are very welcome — see [Contributing](#contributing).

## Why Redhound?

AI assistants write code that works, but "works" is not "safe". Apps built quickly with AI share a recognisable set of flaws that general-purpose scanners often miss, because the flaws are specific to the stack these apps are built on: Next.js, Supabase, Firebase, Stripe, Vercel.

Redhound focuses on that gap:

| Area | What Redhound looks for |
|------|-------------------------|
| **Supabase** | Tables without Row Level Security, `service_role` key used in client code |
| **Next.js** | Secrets leaked through `NEXT_PUBLIC_*`, API routes and server actions with no auth check |
| **Auth** | Checks that exist only in the UI while the endpoint stays open |
| **Access control** | IDOR: records fetched by `id` with no ownership check |
| **Stripe** | Webhooks that do not verify the signature |
| **Firebase** | Wide-open security rules (`allow read, write: if true`) |
| **Secrets** | Hardcoded API keys and tokens (OpenAI, AWS, database URIs) |
| **Dangerous calls** | `eval()`, `child_process.exec()` with user input, unsafe deserialisation |
| **LLM apps** | User input concatenated straight into the system prompt (prompt injection) |

Every finding comes with a fix: a short explanation and a code diff, not just a warning.

## Planned usage

```bash
npx redhound scan .
```

```bash
npx redhound scan --path ./src --severity high --format json
```

| Flag | Description |
|------|-------------|
| `--path` | Directory to scan (default: current directory) |
| `--format` | `table` (default), `json`, `sarif` |
| `--severity` | Minimum severity to report: `low`, `medium`, `high`, `critical` |

## Try it from source

The CLI already runs from a clone, with two rules so far: `supabase-service-role-client` and `nextjs-route-missing-auth`.

```bash
git clone https://github.com/zahirtanriverdi-rgb/redhound.git
cd redhound
npm install
npm run build
node dist/bin.js scan /path/to/your/app
```

Exit code is `0` when the scan is clean, `1` when issues are found and `2` on an error, so it can gate a CI job.

### Adding a rule

1. Create `src/rules/<rule-id>.ts` exporting an object that implements `Rule` from [src/types.ts](src/types.ts).
2. List it in [src/rules/index.ts](src/rules/index.ts).
3. Add `vulnerable/` and `safe/` samples under `tests/fixtures/<rule-id>/` and a test in `tests/rules/`.
4. Run `npm test`.

## Roadmap

- [ ] **Phase 1 — CLI and core rules.** TypeScript CLI, rule engine, first stack-specific rules with fix suggestions, terminal and JSON output.
- [ ] **Phase 2 — Application-level analysis.** Prompt injection checks for LLM apps, opt-in security probes against your own `localhost` dev server.
- [ ] **Phase 3 — Integrations.** SARIF export for GitHub Code Scanning, official GitHub Action, pre-commit mode that scans only changed files.
- [ ] **Phase 4 — Community.** Rule authoring guide, `CONTRIBUTING.md`, `SECURITY.md`.

## Contributing

The project is at the very start, which is the best time to shape it. Useful ways to help:

- **Suggest a rule.** Seen an AI assistant produce the same insecure pattern twice? Open an issue with a minimal example.
- **Share vulnerable samples.** Small, realistic snippets (vulnerable and fixed versions) become our test fixtures.
- **Write a rule.** Each rule will live in its own file behind a common interface, with fixtures as tests.
- **Try it on your project** once the first release is out, and report false positives.

Open an issue or start a discussion — every idea is read.

## Responsible use

Redhound is a defensive tool. Use it only on code and environments that you own or have explicit permission to audit. Dynamic checks are limited to local development servers by design.
