# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Chrome extension (Manifest V3) that detects HTML `<table>` elements on web pages and displays the count via a badge on the extension icon. Built with TypeScript, uses Bun as the runtime/bundler, and Biome for linting/formatting.

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
Content Script → Background Service Worker → Chrome API (badge update)

1. **Content Script** (src/content/index.ts)
   - Runs on all URLs at document_idle
   - Detects tables via `document.querySelectorAll('table')`
   - Uses MutationObserver to detect dynamically added tables
   - Sends `TableCountMessage` to background script

2. **Background Service Worker** (src/background/index.ts)
   - Listens for messages from content scripts
   - Updates badge text, color, and title using Chrome Action API
   - Green badge (#00AA00) when tables found, empty badge otherwise

3. **Message Interface**
   ```typescript
   interface TableCountMessage {
     action: 'updateBadge';
     tableCount: number;
   }
   ```
   This interface is duplicated in both files (no shared types currently).

### Build Process
Build script runs three sequential steps:
1. `build:clean` - Remove dist/, recreate directory
2. `build:scripts` - Bundle TypeScript files to dist/content.js and dist/background.js
3. `build:copy` - Copy manifest.json and icon.png to dist/

## TypeScript Configuration

- Target: ES2022, module: ESNext
- Path alias: `@/*` maps to `src/*`
- Types: chrome, bun-types
- Strict mode enabled with additional checks (noUnusedLocals, noUncheckedIndexedAccess)

## Testing in Chrome

After building, load unpacked extension from `dist/` directory at chrome://extensions/ with Developer Mode enabled.

## Git Status Notes

Recent commits focused on table detection improvements. Project appears to be restructured from legacy files (background.js, content.js, manifest.json at root) to TypeScript source structure.
