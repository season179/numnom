/**
 * Content script that detects HTML tables on web pages
 */

import Papa from 'papaparse';

console.log('Table Detector: Content script loaded!');

interface TableCountMessage {
  action: 'updateBadge';
  tableCount: number;
}

interface GetTablesMessage {
  action: 'getTables';
}

interface StartFullDownloadMessage {
  action: 'startFullDownload';
  tableIndex: number;
}

interface CancelDownloadMessage {
  action: 'cancelDownload';
}

interface ProgressUpdate {
  action: 'downloadProgress';
  progress: number; // 0-100
  rowsCollected: number;
  status: 'scrolling' | 'complete' | 'error' | 'cancelled';
  csvData?: string;
  error?: string;
}

interface TablesResponse {
  tables: Array<{
    index: number;
    rows: number;
    columns: number;
    csvData: string;
  }>;
}

/**
 * Checks if a table has both "open" and "close" columns
 */
function hasOpenAndCloseColumns(table: HTMLTableElement): boolean {
  // Get all header cells from thead or first row
  const headerCells = Array.from(
    table.querySelectorAll('thead th, thead td, tr:first-child th, tr:first-child td')
  );

  // Extract text content and normalize to lowercase
  const columnNames = headerCells.map((cell) => cell.textContent?.trim().toLowerCase() || '');

  // Check if both "open" and "close" columns exist
  const hasOpen = columnNames.some((name) => name === 'open');
  const hasClose = columnNames.some((name) => name === 'close');

  return hasOpen && hasClose;
}

/**
 * Converts an HTML table to a 2D array of strings
 */
function tableToArray(table: HTMLTableElement): string[][] {
  const rows = Array.from(table.querySelectorAll('tr'));
  return rows.map((row) => {
    const cells = Array.from(row.querySelectorAll('th, td'));
    return cells.map((cell) => cell.textContent?.trim() || '');
  });
}

/**
 * Gets all valid tables and converts them to CSV format
 */
function getValidTables(): TablesResponse {
  console.log('Table Detector: getValidTables() called');
  const allTables = document.querySelectorAll('table');
  console.log(`Table Detector: Found ${allTables.length} total tables on page`);

  const validTables = Array.from(allTables).filter((table) =>
    hasOpenAndCloseColumns(table as HTMLTableElement)
  );
  console.log(`Table Detector: ${validTables.length} tables have "open" and "close" columns`);

  const tables = validTables.map((table, index) => {
    const data = tableToArray(table as HTMLTableElement);
    const csvData = Papa.unparse(data);
    const rows = data.length;
    const columns = data[0]?.length || 0;
    console.log(`Table Detector: Table ${index + 1} - ${rows} rows × ${columns} columns`);

    return {
      index,
      rows,
      columns,
      csvData,
    };
  });

  console.log('Table Detector: Returning tables response');
  return { tables };
}

/**
 * Detects tables on the current page and sends count to background script
 */
function detectTables(): void {
  const allTables = document.querySelectorAll('table');
  const validTables = Array.from(allTables).filter((table) =>
    hasOpenAndCloseColumns(table as HTMLTableElement)
  );
  const tableCount = validTables.length;

  const message: TableCountMessage = {
    action: 'updateBadge',
    tableCount,
  };

  chrome.runtime.sendMessage(message).catch((err) => {
    console.log('Table Detector: Failed to send message', err);
  });
}

/**
 * Sets up MutationObserver to detect dynamically added tables
 */
function setupObserver(): void {
  if (!document.body) {
    // Body not ready yet, wait a bit
    setTimeout(setupObserver, 100);
    return;
  }

  const observer = new MutationObserver(() => {
    detectTables();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  console.log('Table Detector: Observer initialized');
}

// State for cancellation
let downloadCancelled = false;

/**
 * Finds the scrollable container for a table
 */
function findScrollableContainer(table: HTMLTableElement): Element | null {
  let element: Element | null = table;

  while (element && element !== document.body) {
    const style = window.getComputedStyle(element);
    const overflowY = style.overflowY;
    const overflowX = style.overflow;

    // Check if element is scrollable
    if (
      (overflowY === 'auto' ||
        overflowY === 'scroll' ||
        overflowX === 'auto' ||
        overflowX === 'scroll') &&
      element.scrollHeight > element.clientHeight
    ) {
      return element;
    }

    element = element.parentElement;
  }

  // Fallback to window scrolling
  return document.documentElement;
}

/**
 * Creates a hash from row data for deduplication
 */
function hashRow(cells: string[]): string {
  return cells.join('|');
}

/**
 * Scrolls container and collects all table rows
 */
async function scrollAndCollectRows(
  table: HTMLTableElement,
  onProgress: (update: ProgressUpdate) => void
): Promise<string[][]> {
  downloadCancelled = false;
  const container = findScrollableContainer(table);
  const uniqueRows = new Map<string, string[]>();

  console.log('Table Detector: Starting scroll & collect');
  console.log('Table Detector: Scrollable container:', container);

  // Collect initial rows
  const initialData = tableToArray(table);
  for (const row of initialData) {
    uniqueRows.set(hashRow(row), row);
  }

  if (!container) {
    console.log('Table Detector: No scrollable container found');
    return Array.from(uniqueRows.values());
  }

  const isWindow = container === document.documentElement;
  const getScrollTop = () => (isWindow ? window.scrollY : (container as HTMLElement).scrollTop);
  const getScrollHeight = () =>
    isWindow ? document.documentElement.scrollHeight : container.scrollHeight;
  const getClientHeight = () => (isWindow ? window.innerHeight : container.clientHeight);
  const scrollBy = (amount: number) => {
    if (isWindow) {
      window.scrollBy({ top: amount, behavior: 'instant' });
    } else {
      (container as HTMLElement).scrollTop += amount;
    }
  };

  let lastRowCount = uniqueRows.size;
  let noNewRowsCount = 0;
  const maxNoNewRowsAttempts = 5;
  let scrollAttempts = 0;
  const maxScrollAttempts = 200; // Safety limit

  while (scrollAttempts < maxScrollAttempts && noNewRowsCount < maxNoNewRowsAttempts) {
    if (downloadCancelled) {
      console.log('Table Detector: Download cancelled');
      onProgress({
        action: 'downloadProgress',
        progress: 0,
        rowsCollected: uniqueRows.size,
        status: 'cancelled',
      });
      throw new Error('Download cancelled');
    }

    scrollAttempts++;

    // Scroll down by one viewport height
    const clientHeight = getClientHeight();
    scrollBy(clientHeight * 0.8);

    // Wait for content to load
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Collect newly rendered rows
    const currentData = tableToArray(table);
    for (const row of currentData) {
      uniqueRows.set(hashRow(row), row);
    }

    // Calculate progress
    const scrollTop = getScrollTop();
    const scrollHeight = getScrollHeight();
    const progress = Math.min(95, Math.round((scrollTop / scrollHeight) * 100));

    console.log(
      `Table Detector: Scroll progress: ${progress}%, Rows: ${uniqueRows.size}, ScrollTop: ${scrollTop}, ScrollHeight: ${scrollHeight}`
    );

    onProgress({
      action: 'downloadProgress',
      progress,
      rowsCollected: uniqueRows.size,
      status: 'scrolling',
    });

    // Check if we've reached the bottom
    if (scrollTop + clientHeight >= scrollHeight - 10) {
      console.log('Table Detector: Reached bottom of scroll');

      // Wait a bit more for any final content
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Final collection
      const finalData = tableToArray(table);
      for (const row of finalData) {
        uniqueRows.set(hashRow(row), row);
      }

      break;
    }

    // Check if we got new rows
    if (uniqueRows.size === lastRowCount) {
      noNewRowsCount++;
    } else {
      noNewRowsCount = 0;
      lastRowCount = uniqueRows.size;
    }
  }

  console.log(`Table Detector: Collection complete. Total unique rows: ${uniqueRows.size}`);
  return Array.from(uniqueRows.values());
}

/**
 * Handles full download request with scrolling
 */
async function handleFullDownload(tableIndex: number): Promise<void> {
  console.log(`Table Detector: Starting full download for table ${tableIndex}`);

  const allTables = document.querySelectorAll('table');
  const validTables = Array.from(allTables).filter((table) =>
    hasOpenAndCloseColumns(table as HTMLTableElement)
  );

  if (tableIndex >= validTables.length) {
    console.error('Table Detector: Invalid table index');
    chrome.runtime.sendMessage({
      action: 'downloadProgress',
      progress: 0,
      rowsCollected: 0,
      status: 'error',
      error: 'Invalid table index',
    } as ProgressUpdate);
    return;
  }

  const table = validTables[tableIndex] as HTMLTableElement;

  try {
    const allRows = await scrollAndCollectRows(table, (update) => {
      chrome.runtime.sendMessage(update).catch(console.error);
    });

    // Generate CSV from all collected rows
    const csvData = Papa.unparse(allRows);

    console.log(`Table Detector: Generated CSV with ${allRows.length} rows`);

    chrome.runtime.sendMessage({
      action: 'downloadProgress',
      progress: 100,
      rowsCollected: allRows.length,
      status: 'complete',
      csvData,
    } as ProgressUpdate);
  } catch (error) {
    console.error('Table Detector: Error during full download:', error);
    chrome.runtime.sendMessage({
      action: 'downloadProgress',
      progress: 0,
      rowsCollected: 0,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    } as ProgressUpdate);
  }
}

// Run initial detection
detectTables();

// Set up observer for dynamic changes
setupObserver();

// Listen for messages from popup
chrome.runtime.onMessage.addListener(
  (
    message: GetTablesMessage | StartFullDownloadMessage | CancelDownloadMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: TablesResponse) => void
  ) => {
    console.log('Table Detector: Received message:', message);

    if (message.action === 'getTables') {
      console.log('Table Detector: Processing getTables request');
      try {
        const response = getValidTables();
        console.log('Table Detector: Sending response with', response.tables.length, 'tables');
        sendResponse(response);
      } catch (err) {
        console.error('Table Detector: Error processing getTables:', err);
        sendResponse({ tables: [] });
      }
    } else if (message.action === 'startFullDownload') {
      console.log('Table Detector: Processing startFullDownload request');
      handleFullDownload(message.tableIndex);
      // Don't call sendResponse for async operation
    } else if (message.action === 'cancelDownload') {
      console.log('Table Detector: Processing cancelDownload request');
      downloadCancelled = true;
    }

    return true; // Keep message channel open for async response
  }
);
