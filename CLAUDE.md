# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

- **Install**: `pnpm install --frozen-lockfile`
- **Lint**: `pnpm lint` (oxlint)
- **Lint fix**: `pnpm lint:fix`
- **Format**: `pnpm fmt` (oxfmt)
- **Run a bot script**: `tsx src/bot/<site>/<script>.ts`
- **Run arbitrary ts file**: `tsx <path>.ts`

## Code Architecture

Multi-site MediaWiki bot framework (TypeScript, ESM) running via GitHub Actions.

### Layer structure

```
src/
  api/          — MediaWiki API client instances + site config
    config.ts   — 6 wiki site credentials loaded from .env
    index.ts    — MediaWikiApi instances (zhapi, cmapi, vjpapi, uewapi, qwapi, elainaapi) + Login helper
    types.d.ts  — Config & SiteAccount types
  lib/          — Shared bot operations (wraps MediaWiki API calls)
    index.ts    — BotInstance class: aggregates all libs into one object
    batchQuery.ts       — Fetch page contents in batches with concurrency
    checkRedirects.ts   — Check if pages are redirects
    checkGlobalUsage.ts — Check cross-wiki file usage via prop=globalusage
    flagDelete.ts       — Tag pages for deletion (挂删)
    getJson.ts          — Parse page content as JSON config
    getEmbedded.ts      — Query list=embeddedin (what transcludes a page)
    getLinked.ts        — Query prop=linkshere (what links to a page)
    queryCategory.ts    — Query list=categorymembers (recursive subcat support)
  utils/        — Shared utilities
    baseApi.ts          — Base class taking MediaWikiApi for lib classes
    booleanFilter.ts    — Split Record<string,bool> into isTrue/isFalse arrays
    chunkArray.ts       — Split array into chunks
    splitAndJoin.ts     — Split array, join chunks with "|" (for API batch params)
    formatNamespace.ts  — Format namespace numbers for API parameters
    parseThread.ts      — Parse wiki discussion threads (section splitting by == headings ==)
    readAndWrite.ts     — Read/write files in the GitHub repo via Octokit
    recordTime.ts       — Persist/read task timestamps to data/time.yaml via GitHub API
  bot/          — Per-wiki bot scripts (each file is a standalone IIFE)
    mgp/        — MoegirlPedia
    vjp/        — Vocawiki
    uew/        — United Earth Wiki
    elaina/     — ElainaWiki
    modules/    — Shared bot modules (e.g., CleanSandbox)
    tmp/        — Ad-hoc/test scripts
data/
  time.yaml           — Timestamps for incremental task processing
  inUsedRedirect.json — Persistent tracking of in-use redirects
scripts/              — Repository maintenance scripts (scope generation, cleanup)
```

### Key patterns

- Each bot script under `src/bot/` is a **standalone top-level IIFE** that can be run directly with `npx tsx`
- Bot scripts format their own edits using wikiparser-node for AST-based wiki text manipulation
- Time-limited tasks use `getTimeData`/`updateTimeData` with timestamps stored in `data/time.yaml` for incremental processing
- `BotInstance` is the primary convenience wrapper — construct with an API instance, then call `.batchQuery()`, `.checkRedirect()`, `.checkGlobalUsage()`, `.flagDelete()`, `.getJson()`, `.getEmbedded()`, `.getLinked()`, `.queryCategory()`

### CI/CD (GitHub Actions workflows)

All task scheduling is via GitHub Actions. See `.github/workflows/` for details.

### Coding conventions

- Strict TypeScript with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`
- oxlint (NOT ESLint) for linting; oxfmt for formatting (100 col width, single quotes, trailing commas)
- `import type` for type-only imports
- Path alias `@/*` → `./src/*`
- All commits follow conventional commits with auto-generated scopes

### Commit conventions

Format: `<type>(<scope>): <description>`

Types: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `style`, `perf`, `ci`, `revert`

Scope format: `<SITE>/<script>` for bot scripts, `<area>/<module>` for shared code. See `.vscode/settings.json` for the full scope list. Omit scope for cross-cutting changes.

Examples:

- `feat(QW/internalLink): add internalLink bot and QW daily workflow`
- `chore(QW/internalLink): disable schedule for QW daily workflow`
- `fix(MGP/disambigLinks): handle empty namespace parameter`
- `chore: auto record last run time of removeExtraPipe`
