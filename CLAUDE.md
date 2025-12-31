# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**NumNom** is a Chrome extension (Manifest V3) that detects financial tables on web pages and allows users to download them as CSV files. It detects two types of tables:

1. **Price tables**: Tables with both "open" and "close" columns
2. **Dividend tables**: Tables with dividend-related columns (announced, financial year, subject, ex date, payment date, amount, indicator)

Built with TypeScript, uses Bun as the runtime/bundler, Biome for linting/formatting, and PapaParse for CSV conversion.

## Build System

All commands use Bun (not npm/yarn):

- `bun install` - Install dependencies
- `bun run build` - Full build (clean, compile scripts, copy assets)
- `bun run dev` - Alias for build (no watch mode currently)
- `bun run lint` - Check code with Biome
- `bun run lint:fix` - Auto-fix linting issues
- `bun run format` - Format code with Biome
- `bun run check` - Lint, format, and build in sequence

Build output goes to `dist/` directory, which is gitignored.

## Code Quality

Uses **Biome** (not ESLint/Prettier):
- Enforces single quotes, 2-space indent, 100 char line width
- Strict TypeScript rules enabled in both tsconfig and Biome
- Run `bun run lint:fix` before committing
- Biome config: biome.json

## Architecture

### Message Passing Flow

Two independent flows:
1. Badge Update: Content Script → Background Service Worker → Chrome API
2. CSV Download: Popup → Content Script → CSV generation

### Components

1. **Content Script** (src/content/index.ts)
   - Runs on all URLs at document_idle
   - Detects price tables (open/close columns) and dividend tables
   - Uses MutationObserver to detect dynamically added tables
   - Sends `TableCountMessage` to background script for badge updates
   - Responds to `GetTablesMessage` from popup with table data
   - Supports full download with auto-scroll for lazy-loaded tables
   - Converts tables to CSV using PapaParse library

2. **Background Service Worker** (src/background/index.ts)
   - Listens for messages from content scripts
   - Updates badge text, color, and title using Chrome Action API
   - Green badge (#00AA00) when tables found, empty badge otherwise

3. **Popup** (src/popup/index.ts + public/popup.html)
   - Opens when user clicks extension icon
   - Dark terminal-inspired UI with JetBrains Mono font
   - Color-coded table indicators (green=price, blue=dividend)
   - Single Download button with progress-in-button pattern
   - Auto-scrolls to collect all rows from lazy-loaded tables
   - See `docs/FULL_DOWNLOAD_FEATURE.md` for technical details

### Message Interfaces
```typescript
interface TableCountMessage {
  action: 'updateBadge';
  tableCount: number;
}

interface GetTablesMessage {
  action: 'getTables';
}

interface TablesResponse {
  tables: Array<{
    index: number;
    rows: number;
    columns: number;
    csvData: string;
    type: 'price' | 'dividend';
  }>;
  ticker: string;
}
```
These interfaces are duplicated across files (no shared types currently).

### Build Process
Build script runs three sequential steps:
1. `build:clean` - Remove dist/, recreate directory
2. `build:scripts` - Bundle TypeScript files to dist/content.js, dist/background.js, and dist/popup.js
3. `build:copy` - Copy manifest.json, icon.png, and popup.html to dist/

## TypeScript Configuration

- Target: ES2022, module: ESNext
- Path alias: `@/*` maps to `src/*`
- Types: chrome, bun-types
- Strict mode enabled with additional checks (noUnusedLocals, noUncheckedIndexedAccess)

## Testing in Chrome

After building, load unpacked extension from `dist/` directory at chrome://extensions/ with Developer Mode enabled.

To test the extension:
1. Navigate to any page with financial tables (price or dividend data)
2. Badge should show count of detected tables
3. Click the extension icon to open dark-themed popup
4. Popup displays tables with color-coded type badges
5. Click Download to auto-scroll and export complete data
