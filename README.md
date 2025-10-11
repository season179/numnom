# Table Detector Chrome Extension

A modern Chrome extension built with TypeScript, Bun, and Biome that detects HTML `<table>` elements on web pages and displays an indicator badge.

## Features

- Automatically scans pages for `<table>` elements
- Shows a green badge with the count of tables found
- Updates dynamically when tables are added/removed
- Non-intrusive - doesn't modify page content
- Built with TypeScript for type safety
- Fast builds with Bun
- Code quality enforced with Biome linter

## Prerequisites

- [Bun](https://bun.sh) installed (`curl -fsSL https://bun.sh/install | bash`)
- Chrome or Chromium-based browser

## Development Setup

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Build the extension:**
   ```bash
   bun run build
   ```

3. **Development workflow:**
   ```bash
   # Run linter and formatter
   bun run lint
   
   # Auto-fix linting issues
   bun run lint:fix
   
   # Format code
   bun run format
   
   # Check and build
   bun run check
   ```

## How to Load in Chrome

1. **Build the extension first:**
   ```bash
   bun run build
   ```

2. **Open Chrome Extensions page:**
   - Navigate to `chrome://extensions/`
   - Or: Menu → More Tools → Extensions

3. **Enable Developer Mode:**
   - Toggle "Developer mode" switch in the top-right corner

4. **Load the extension:**
   - Click "Load unpacked"
   - Select the `dist` directory

5. **Test it:**
   - Visit any webpage with tables (e.g., Wikipedia)
   - Look at the extension icon in your toolbar
   - You should see a green badge with the number of tables

## Project Structure

```
.
├── src/
│   ├── content/
│   │   └── index.ts         # Content script (table detection)
│   └── background/
│       └── index.ts         # Service worker (badge updates)
├── public/
│   ├── manifest.json        # Extension configuration
│   └── icon.png            # Extension icon
├── dist/                    # Build output (gitignored)
├── package.json            # Dependencies and scripts
├── tsconfig.json           # TypeScript configuration
├── biome.json              # Biome linter/formatter config
└── README.md               # This file
```

## Available Scripts

- `bun run build` - Build the extension for production
- `bun run dev` - Build in development mode
- `bun run lint` - Check code with Biome
- `bun run lint:fix` - Auto-fix linting issues
- `bun run format` - Format code with Biome
- `bun run check` - Lint, format, and build

## How It Works

1. **Content Script** (`src/content/index.ts`) runs on every page
2. Counts `<table>` elements using `document.querySelectorAll('table')`
3. Sends count to **Background Script** (`src/background/index.ts`)
4. Background script updates the badge on the extension icon
5. Green badge with number = tables found
6. No badge = no tables on page

## Technology Stack

- **TypeScript** - Type-safe JavaScript
- **Bun** - Fast JavaScript runtime and bundler
- **Biome** - Fast linter and formatter (replaces ESLint + Prettier)
- **Chrome Extension Manifest V3** - Latest extension format

## About the Icon

The `icon.png` is currently a placeholder. Chrome will show a default icon. To add a custom icon:
- Create or download a 128x128 PNG image
- Replace `public/icon.png`
- Rebuild with `bun run build`
- Reload the extension in Chrome
