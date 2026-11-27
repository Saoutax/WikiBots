# AGENTS.md

This file provides guidance to AI coding agents working with code in this repository. `CLAUDE.md` only points here, so keep all shared repository guidance in this file.

## Build & Run Commands

- **Install**: `pnpm install --frozen-lockfile`
- **Lint**: `pnpm lint` (oxlint)
- **Lint fix**: `pnpm lint:fix`
- **Format**: `pnpm fmt` (oxfmt)
- **Generate site READMEs**: `pnpm readme` (rebuilds `src/bot/<site>/README.md` from the workflows)
- **Typecheck**: `pnpm typecheck` (tsc --noEmit)
- **Test**: `pnpm test` (vitest, fully offline; watch mode: `pnpm test:watch`)
- **Run a bot script**: `tsx src/bot/<site>/<script>.ts`
- **Run an arbitrary TS file**: `tsx <path>.ts`

## Code Architecture

Multi-site MediaWiki bot framework (TypeScript, ESM) running via GitHub Actions.

### Layer structure

```
src/
  api/          — MediaWiki API clients and site configuration
    config.ts   — 6 wiki site credentials (zh, cm, vjp, uew, qw, elaina) read from process.env via dotenv
    instances.ts— MediaWikiApi instances (zhapi, cmapi, vjpapi, uewapi, qwapi, elainaapi)
    index.ts    — Re-exports API instances + Login helper
    login.ts    — Site login helper
    types.ts    — Config and SiteAccount types (site/account union literals)
  lib/          — MediaWiki page & query operations (no dependency on tasks/ or notify/)
    index.ts    — BotInstance class (lazily binds query, page, edit ops) + BaseApi/helpers re-exports
    base.ts     — Base class taking MediaWikiApi for lib and task classes
    query.ts    — QueryOps: batchQuery, checkGlobalUsage, getEmbedded, getLinked, queryCategory
    page.ts     — PageOps: checkExist, checkRedirect, getContent, getJson
    edit.ts     — EditOps: edit, flagDelete
    recentChanges.ts — Paginated recentchanges collector
    formatNamespace.ts — Format namespace numbers for API parameters
    splitAndJoin.ts    — Split an array and join chunks with "|" (for API batch parameters)
  wikitext/     — Pure wikitext / AST utilities (no network, no IO)
    extractChineseDate.ts      — Extract Chinese date strings
    getLatestTimestamp.ts      — Extract the latest signed timestamp (CST/UTC) from wikitext
    invisibleCharacter.ts      — Strip zero-width spaces / leading BOM while preserving literal tags
    normalizeHeadingSpacing.ts — Normalize heading spacing
    parseThread.ts             — Parse wiki discussion threads (split sections by == headings ==)
    template.ts                — Template name normalization and AST template lookup
    title.ts                   — Title comparison and normalization (sameTitle, normalizeTitleKey, deriveTalkPage)
    variantConverter.ts        — Convert text to zh-cn/zh-tw/zh-hk variants via opencc-js
  infra/        — Runtime & GitHub infrastructure (no wiki domain logic)
    booleanFilter.ts — Split Record<string, boolean> into isTrue/isFalse arrays
    delay.ts         — Promise-based sleep (default 3000 ms)
    github.ts        — Read/write files in the GitHub repo via Octokit
    logCapture.ts    — Capture console output into a bounded buffer + tailLog
    rateLimit.ts     — p-queue rate limiter wrapper
    state.ts         — Persist/read task timestamps in data/time.yaml via the GitHub API
    time.ts          — dayjs configured with the Asia/Shanghai timezone (re-exported)
  notify/       — Notification clients
    feishu.ts   — Feishu bot notification client (card + .log file upload)
  runner.ts     — Unified bot script entry point (login, timing, log capture, Feishu notify)
  tasks/        — Cross-site reusable bot tasks (CleanSandbox, InvisibleCharacter, archive, templateStyles, statusList)
  bot/          — Per-wiki executable bot scripts (each file is a standalone IIFE)
    mgp/        — MoegirlPedia
    vjp/        — Vocawiki
    uew/        — United Earth Wiki
    qw/         — QiuwenBaike
    elaina/     — ElainaWiki
    tmp/        — Ad-hoc local scripts (gitignored)
  config/       — Static JSON config files used by bot scripts
data/
  time.yaml           — Timestamps for incremental task processing
  inUsedRedirect.json — Persistent tracking of in-use redirects
scripts/              — Repository maintenance scripts (commit-scope generation, outdated-record cleanup, site README generation)
test/                 — Offline Vitest tests; mirrors src/ and adds bot script integration tests
```

### Key patterns

- Each bot script under `src/bot/` is a **standalone top-level IIFE** (`(async () => { await run({ api, site }, async () => { ... }); })()`) using `run` from `@/runner` that can be run directly with `npx tsx`.
- API access goes through `wiki-saikou`'s `MediaWikiApi` instances (`@/api`); `run(targets, task)` logs in, runs the task, and handles errors/notifications, while `BotInstance` (`@/lib`) wraps common page operations.
- Bot scripts format their own edits with wikiparser-node for AST-based wikitext manipulation.
- Time-limited tasks use `getTimeData`/`updateTimeData` from `@/infra` with timestamps stored in `data/time.yaml` for incremental processing.
- Multi-site tasks pass an array of `{ api, site }` targets to `run` and use the matching per-site API instances.
- Archive scripts share `archiveDiscussion` / `archiveList` helpers from `@/tasks`.
- `BotInstance` is the primary convenience wrapper — construct it with an API instance, then call `.batchQuery()`, `.checkExist()`, `.checkRedirect()`, `.checkGlobalUsage()`, `.flagDelete()`, `.getContent()`, `.getJson()`, `.getEmbedded()`, `.getLinked()`, `.queryCategory()`, or `.edit()`.

### CI/CD (GitHub Actions workflows)

All task scheduling is via GitHub Actions; see `.github/workflows/` for per-site daily workflows and repository maintenance. Workflows share the composite action `.github/actions/setup-bot` (pnpm + Node + dependencies). The `Code Analysis` workflow runs lint, typecheck, and unit tests; CodeQL analysis runs on the same trigger.

Site READMEs are generated, not written by hand. `scripts/generateSiteReadmes.ts` derives the task name, script link, and CST schedule for every job that runs `src/bot/<site>/*.ts`, so a `# 说明: ...` comment above the job (or on its first line) supplies the description column and is required. The `Generate READMEs` workflow runs `pnpm readme` on every branch after pushes that touch workflows or the generator, then commits the changed READMEs back to that branch via the GitHub API (`scripts/commitSiteReadmes.ts`, Octokit, requires `GITHUB_TOKEN` and `GITHUB_REF_NAME`; run only in Actions). Add or change a task in the workflow only; run `pnpm readme` locally before pushing if the branch will not run Actions.

## Coding conventions

- Strict TypeScript with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`.
- **oxlint** (NOT ESLint) for linting; **oxfmt** for formatting (100 column width, single quotes, trailing commas, arrow parens omitted).
- Lint rules affecting code style: `curly` (single-line `if`/`for`/`while` **must** use braces), `no-floating-promises` (unhandled promise rejections are errors), `import/no-duplicates` (no duplicate imports).
- Use `import type` for type-only imports.
- Path alias `@/*` → `./src/*`.
- All commits follow Conventional Commits with auto-generated scopes.

## Testing

- Unit tests live in `test/` and mirror `src/`; `vitest.config.ts` maps `@/*` to `./src/*`.
- Run `pnpm test` (CI runs it after lint and typecheck); use `pnpm test:watch` for watch mode.
- Tests must be fully offline: MediaWiki API responses come from `createApiStub()` in `test/helpers/api.ts`, and GitHub API calls are mocked with `vi.mock('octokit')`. Never rely on real network access or credentials.
- Simple modules (`src/utils`, `src/lib`, `src/api`, pure logic in `scripts/`) are unit-tested directly. Bot scripts are tested as offline integration tests under `test/bot/scripts/` using `test/helpers/bot.ts`: only the `@/api` instances and `run()` are mocked (to supply API fixtures), plus `delay`, `getTimeData`, and `updateTimeData` from `@/utils`. Everything else — wikiparser and text rewriting — runs for real, and assertions target the exact edited wikitext.
- Only scripts that heavily rewrite existing wikitext (archive scripts, link/template replacements) are covered. Simple scripts, report generators, and `src/bot/tmp/**` are intentionally not tested.
- Archive tests must assert complete pages before and after an edit: discussion pages via their full `text`, and archive pages via `editedPage(body, before)` from `test/helpers/bot.ts` to reconstruct the page after an append.
- Import the bot test harness once per test file as a named import (`import { runtime } from '../../../helpers/bot'`); it registers the `vi.mock` calls, so do not add a separate side-effect import (oxlint `import/no-duplicates`).

## Commit conventions

Format: `<type>(<scope>): <description>`

Types: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `style`, `perf`, `ci`, `revert`

Scope format: `<SITE>/<script>` for bot scripts, `<area>/<module>` for shared code. See `.vscode/settings.json` for the full scope list. Omit the scope for cross-cutting changes.

Examples:

- `feat(QW/internalLink): add internalLink bot and QW daily workflow`
- `chore(QW/internalLink): disable schedule for QW daily workflow`
- `fix(MGP/disambigLinks): handle empty namespace parameter`
- `chore: auto record last run time of removeExtraPipe`
