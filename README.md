# Table Detector Chrome Extension

A simple Chrome extension that detects HTML `<table>` elements on web pages and displays an indicator badge.

## Features

- Automatically scans pages for `<table>` elements
- Shows a green badge with the count of tables found
- Updates dynamically when tables are added/removed
- Non-intrusive - doesn't modify page content

## How to Load in Chrome

1. **Open Chrome Extensions page:**
   - Navigate to `chrome://extensions/`
   - Or: Menu → More Tools → Extensions

2. **Enable Developer Mode:**
   - Toggle "Developer mode" switch in the top-right corner

3. **Load the extension:**
   - Click "Load unpacked"
   - Select this directory (`tradingview`)

4. **Test it:**
   - Visit any webpage with tables (e.g., Wikipedia)
   - Look at the extension icon in your toolbar
   - You should see a green badge with the number of tables

## Files Structure

```
.
├── manifest.json    # Extension configuration
├── content.js       # Detects tables on web pages
├── background.js    # Updates badge indicator
├── icon.png         # Extension icon (placeholder)
└── README.md        # This file
```

## About the Icon

The `icon.png` is currently a placeholder. Chrome will show a default icon. To add a custom icon:
- Create or download a 128x128 PNG image
- Replace the existing `icon.png` file
- Reload the extension in Chrome

## How It Works

1. **Content Script** (`content.js`) runs on every page
2. Counts `<table>` elements using `document.querySelectorAll('table')`
3. Sends count to **Background Script** (`background.js`)
4. Background script updates the badge on the extension icon
5. Green badge with number = tables found
6. No badge = no tables on page
