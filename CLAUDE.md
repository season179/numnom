# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Chrome extension (Manifest V3) that detects HTML `<table>` elements with "open" and "close" columns on web pages, displays the count via a badge on the extension icon, and allows users to download the tables as CSV files. Built with TypeScript, uses Bun as the runtime/bundler, Biome for linting/formatting, and PapaParse for CSV conversion.

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
   - Runs on tradingview.com at document_idle
   - Detects tables with both "open" and "close" columns (case-insensitive)
   - Uses MutationObserver to detect dynamically added tables
   - Sends `TableCountMessage` to background script for badge updates
   - Responds to `GetTablesMessage` from popup with table data
   - Converts tables to CSV using PapaParse library

2. **Background Service Worker** (src/background/index.ts)
   - Listens for messages from content scripts
   - Updates badge text, color, and title using Chrome Action API
   - Green badge (#00AA00) when tables found, empty badge otherwise

3. **Popup** (src/popup/index.ts + public/popup.html)
   - Opens when user clicks extension icon
   - Requests table data from active tab's content script
   - Displays list of detected tables with row/column counts
   - Provides download buttons for each table
   - Generates CSV files with timestamp in filename

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
  }>;
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
1. Navigate to tradingview.com
2. Badge should show count of tables with "open" and "close" columns
3. Click the extension icon to open popup
4. Popup displays list of detected tables
5. Click "Download CSV" button to export table data

## Git Status Notes

Recent commits focused on table detection improvements. Project appears to be restructured from legacy files (background.js, content.js, manifest.json at root) to TypeScript source structure.
