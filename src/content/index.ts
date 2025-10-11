/**
 * Content script that detects HTML tables on web pages
 */

interface TableCountMessage {
  action: 'updateBadge';
  tableCount: number;
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
  const columnNames = headerCells.map((cell) =>
    cell.textContent?.trim().toLowerCase() || ''
  );

  // Check if both "open" and "close" columns exist
  const hasOpen = columnNames.some((name) => name === 'open');
  const hasClose = columnNames.some((name) => name === 'close');

  return hasOpen && hasClose;
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
