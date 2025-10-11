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

// Run initial detection
detectTables();

// Set up observer for dynamic changes
setupObserver();

// Listen for messages from popup
chrome.runtime.onMessage.addListener(
  (
    message: GetTablesMessage,
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
    }
    return true; // Keep message channel open for async response
  }
);
