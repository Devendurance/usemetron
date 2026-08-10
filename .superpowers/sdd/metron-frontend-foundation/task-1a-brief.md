# Task 1A — Mechanical shadcn setup

Work in `C:\Users\USER\Documents\ideas\celo-agentic-hack`. At the time this historical brief was authored, the workspace was treated as non-Git; do not commit as part of this task.

1. Read `AGENTS.md`.
2. Run exactly this non-interactive initialization from the project root:
   `npx shadcn@latest init --template next --preset base-nova --base base --pointer --no-monorepo --yes`
3. Run `npx shadcn@latest info --json` and confirm Base UI, Tailwind v4, Lucide, RSC, and the actual aliases/paths.
4. Add official shadcn components with:
   `npx shadcn@latest add button input tabs table sheet switch alert badge skeleton separator field empty spinner --yes`
5. Read every generated component and check imports/API composition. Do not customize them beyond fixing generated errors.
6. Do not edit route pages, root layout, or create Metron-specific components.
7. Run `npm run lint` and `npx tsc --noEmit --incremental false`.

Write `.superpowers/sdd/metron-frontend-foundation/task-1a-report.md` with status, files changed, packages added, commands/exit codes, and concerns. Return only the short status contract.
