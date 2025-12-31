# Full CSV Download Feature

## Problem Solved
Many financial data tables use lazy loading/virtual scrolling - only visible rows are rendered in the DOM. A simple export would only capture currently visible rows, resulting in incomplete data exports.

## Solution Implemented
Added an **automated scroll & collect** feature that:
1. Programmatically scrolls the table container to force all rows to load
2. Collects unique rows during scrolling (handles virtual scrolling deduplication)
3. Shows real-time progress with row count
4. Generates complete CSV from all collected data

## UI Features

### 1. Single Download Button
- **Download** button auto-scrolls to collect ALL rows before downloading
- Progress bar fills the button itself during download
- Shows percentage, row count, and inline cancel option

### 2. Progress-in-Button Pattern
- Button transforms during download: `72% | 150 rows | Cancel`
- Green progress fill animates inside the button
- Click "Cancel" text to stop download

### 3. Dark Terminal Theme
- Dark background (#0d1117) with JetBrains Mono font
- Color-coded table type indicators:
  - Green left border = Price tables
  - Blue left border = Dividend tables
- Type badges with matching accent colors

## How It Works

### Technical Flow
```
1. User clicks "Download" button
2. Button enters downloading state (shows progress)
3. Content script finds scrollable container (table parent or window)
4. Auto-scrolls incrementally (80% viewport height per step)
5. Waits 300ms after each scroll for content to load
6. Collects newly rendered rows after each scroll
7. Deduplicates rows using content hash (Map)
8. Progress updates fill the button in real-time
9. Stops when:
   - Reaches bottom of scroll container
   - No new rows detected for 5 consecutive attempts
   - Maximum 200 scroll attempts reached (safety limit)
   - User clicks "Cancel" text
10. Generates CSV and triggers download
11. Button resets to default state
```

### Key Technical Details

#### Scroll Detection
- Detects scrollable container by checking `overflow: auto/scroll` on parents
- Falls back to window scrolling if no scrollable parent found
- Handles both element scrolling and window scrolling

#### Row Deduplication
- Virtual scrolling may re-render same rows at different positions
- Uses content-based hashing (`row.join('|')`) to identify unique rows
- Stores rows in Map with hash as key to ensure uniqueness

#### Progress Calculation
```typescript
progress = Math.min(95, (scrollTop / scrollHeight) * 100)
```
- Caps at 95% during scrolling
- Reaches 100% only when complete

#### Safety Mechanisms
- Max 200 scroll attempts (prevents infinite loops)
- Stops after 5 attempts with no new rows
- User cancellation via flag check in scroll loop
- Timeout on each scroll step (300ms)

## Files Modified

### 1. `src/content/index.ts`
**Added:**
- New message interfaces: `StartFullDownloadMessage`, `CancelDownloadMessage`, `ProgressUpdate`
- `downloadCancelled` flag for cancellation state
- `findScrollableContainer()` - Detects scrollable parent element
- `hashRow()` - Creates unique identifier for row deduplication
- `scrollAndCollectRows()` - Main scroll & collect algorithm
- `handleFullDownload()` - Orchestrates full download process
- Updated message listener to handle new actions

**Key Functions:**
```typescript
// Finds where to scroll (table parent or window)
findScrollableContainer(table: HTMLTableElement): Element | null

// Auto-scrolls and collects all unique rows
scrollAndCollectRows(table, onProgress): Promise<string[][]>

// Entry point for full download
handleFullDownload(tableIndex: number): Promise<void>
```

### 2. `src/popup/index.ts`
**Key Functions:**
- `updateProgress()` - Updates progress fill inside button
- `startFullDownload()` - Initiates download and sets button to downloading state
- `cancelDownload()` - Sends cancellation message to content script
- `renderTables()` - Generates table cards with single download button

**Progress-in-Button Logic:**
- Button has `.downloading` class during download
- `.progress-fill` element width updated in real-time
- `.btn-text` shows `72% | 150 rows | Cancel` during download
- Click detection on `.cancel-action` span triggers cancellation

### 3. `public/popup.html`
**CSS Architecture:**
- CSS variables for consistent theming (see `:root` block)
- `.download-btn` - Relative positioned button container
- `.progress-fill` - Absolutely positioned progress bar inside button
- `.btn-text` - Z-indexed text layer above progress fill
- `.table-type-badge` - Color-coded type indicators

**Visual Design:**
- Dark background (#0d1117) with card-based layout (#161b22)
- JetBrains Mono font for terminal aesthetic
- Color-coded left borders on table cards
- Single full-width download button per table

## Usage Instructions

### For End Users
1. Navigate to a page with financial tables (price tables with "open"/"close" columns, or dividend tables)
2. Click extension icon to open dark-themed popup
3. Each detected table shows:
   - Table name and type badge (Price/Dividend)
   - Row and column count
   - Green "Download" button
4. Click "Download" to start auto-scroll collection:
   - Button fills with progress (green bar)
   - Shows: `72% | 150 rows | Cancel`
   - Click "Cancel" text to stop if needed
5. CSV file downloads automatically when complete

### For Developers Testing
1. **Rebuild extension:**
   ```bash
   bun run build
   ```

2. **Reload extension in Chrome:**
   - Go to `chrome://extensions/`
   - Click reload icon on "NumNom" extension

3. **Test on a financial data page:**
   - Open a page with large data table
   - Open extension popup (should show dark theme)
   - Verify color-coded table badges
   - Click "Download" button
   - Watch progress fill the button
   - Verify CSV has all rows

4. **Console Logs to Monitor:**
   ```
   NumNom: Starting scroll & collect
   NumNom: Scrollable container: [element]
   NumNom: Scroll progress: X%, Rows: Y
   NumNom: Reached bottom of scroll
   NumNom: Collection complete. Total unique rows: Z
   ```

## Performance Characteristics

### Speed
Download time depends on data size:
- 100 rows: ~3-5 seconds
- 1000 rows: ~15-30 seconds
- 5000+ rows: ~60+ seconds

### Memory
- Stores all unique rows in memory during collection
- Large tables (10K+ rows) may use 10-50MB temporarily
- Memory released after download completes

### Compatibility
- Works with any lazy-loaded/virtual scrolled table
- Handles both element scrolling and window scrolling
- Compatible with most financial data table implementations

## Known Limitations

1. **Speed**: Large datasets take time (scrolling is real-time)
2. **Browser Focus**: Extension must remain in focus during download
3. **Page Navigation**: Navigating away cancels the process
4. **Virtual Scrolling Assumptions**: Assumes rows are removed when scrolled away (standard behavior)

## Future Improvements (Optional)

1. **Resume capability**: Save progress and resume if interrupted
2. **Smart scrolling**: Detect if table is already fully loaded
3. **Parallel collection**: Use Intersection Observer instead of scrolling
4. **API interception**: Hook into the data API (if accessible)
5. **Progress persistence**: Show progress even if popup closes

## Troubleshooting

### "No new rows detected"
- Table may already be fully loaded
- Check if scrollable container was correctly detected
- Look for console logs showing scroll attempts

### "Download incomplete"
- Increase `maxNoNewRowsAttempts` (currently 5)
- Increase scroll delay (currently 300ms)
- Check if virtual scrolling is removing rows unexpectedly

### "Progress stuck at X%"
- May indicate scrolling issue
- Check console for errors
- Try canceling and restarting

### CSV has duplicate rows
- Should not happen due to deduplication
- Check `hashRow()` implementation
- Report as bug if reproducible
