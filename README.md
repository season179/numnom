# NumNom Chrome Extension

A Chrome extension that detects financial tables (price and dividend data) on web pages, displays an indicator badge, and allows CSV export.

## Features

- Detects tables with price data (open/close columns) and dividend data
- Shows a green badge with the count of detected tables
- Quick CSV export of visible rows
- Full CSV export with auto-scroll for lazy-loaded tables
- Updates dynamically when tables are added/removed
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
   - Visit any webpage with financial tables
   - Look at the extension icon in your toolbar
   - You should see a green badge with the number of tables
   - Click the icon to download tables as CSV

## Table Detection

NumNom detects two types of tables:

### Price Tables
Tables with both "open" and "close" columns (case-insensitive)

### Dividend Tables
Tables with at least 4 of these columns:
- announced, financial year, subject, ex date, payment date, amount, indicator

## Project Structure

```
.
├── src/
│   ├── content/
│   │   └── index.ts         # Content script (table detection)
│   ├── background/
│   │   └── index.ts         # Service worker (badge updates)
│   └── popup/
│       └── index.ts         # Popup UI logic
├── public/
│   ├── manifest.json        # Extension configuration
│   ├── popup.html           # Popup UI
│   └── icon.png             # Extension icon
├── dist/                    # Build output (gitignored)
├── package.json             # Dependencies and scripts
├── tsconfig.json            # TypeScript configuration
├── biome.json               # Biome linter/formatter config
└── README.md                # This file
```

## Available Scripts

- `bun run build` - Build the extension for production
- `bun run dev` - Build in development mode
- `bun run lint` - Check code with Biome
- `bun run lint:fix` - Auto-fix linting issues
- `bun run format` - Format code with Biome
- `bun run check` - Lint, format, and build

## Technology Stack

- **TypeScript** - Type-safe JavaScript
- **Bun** - Fast JavaScript runtime and bundler
- **Biome** - Fast linter and formatter
- **PapaParse** - CSV generation
- **Chrome Extension Manifest V3** - Latest extension format
