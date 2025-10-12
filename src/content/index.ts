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

type TableType = 'price' | 'dividend';

interface TablesResponse {
  tables: Array<{
    index: number;
    rows: number;
    columns: number;
    csvData: string;
    type: TableType;
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
 * Checks if a table has dividend columns:
 * Announced, Financial Year, Subject, EX Date, Payment Date, Amount, Indicator
 */
function hasDividendColumns(table: HTMLTableElement): boolean {
  // Get all header cells from thead or first row
  const headerCells = Array.from(
    table.querySelectorAll('thead th, thead td, tr:first-child th, tr:first-child td')
  );

  // Extract text content and normalize to lowercase
  const columnNames = headerCells.map((cell) => cell.textContent?.trim().toLowerCase() || '');

  // Check for key dividend columns (at least 4 of the 7)
  const requiredColumns = [
    'announced',
    'financial year',
    'subject',
    'ex date',
    'payment date',
    'amount',
    'indicator',
  ];

  const matchCount = requiredColumns.filter((required) =>
    columnNames.some((name) => name === required)
  ).length;

  // Consider it a dividend table if at least 4 of the 7 columns are present
  return matchCount >= 4;
}

/**
 * Determines the type of table based on its columns
 */
function getTableType(table: HTMLTableElement): TableType | null {
  if (hasOpenAndCloseColumns(table)) {
    return 'price';
  }
  if (hasDividendColumns(table)) {
    return 'dividend';
  }
  return null;
}

/**
 * Converts an HTML table to a 2D array of strings
 * Normalizes Unicode minus signs to ASCII hyphens for Excel compatibility
 */
function tableToArray(table: HTMLTableElement): string[][] {
  const rows = Array.from(table.querySelectorAll('tr'));
  return rows.map((row) => {
    const cells = Array.from(row.querySelectorAll('th, td'));
    return cells.map((cell) => {
      const text = cell.textContent?.trim() || '';
      // Replace Unicode minus (U+2212) with ASCII hyphen-minus (U+002D)
      // Replace middle dot (U+00B7) with space for Excel compatibility
      return text.replace(/−/g, '-').replace(/·/g, ' ');
    });
  });
}

/**
 * Cleans dividend table data by:
 * 1. Removing columns that only contain "view"
 * 2. Removing rows without dividend amounts
 */
function cleanDividendData(data: string[][]): string[][] {
  if (data.length === 0) return data;

  const headerRow = data[0];
  if (!headerRow) return data;

  const dataRows = data.slice(1);

  // Step 1: Identify columns to keep (remove "view" columns)
  const columnsToKeep: number[] = [];
  for (let colIndex = 0; colIndex < headerRow.length; colIndex++) {
    // Check if this column contains only "view" (case-insensitive) or empty values
    // Note: Some rows might have fewer columns (e.g., separator rows with colspan)
    const hasNonViewContent = dataRows.some((row) => {
      const cell = row[colIndex]?.toLowerCase().trim() || '';
      return cell !== 'view' && cell !== '';
    });
    
    if (hasNonViewContent) {
      columnsToKeep.push(colIndex);
    }
  }

  // Step 2: Filter columns
  const filteredHeader = columnsToKeep.map((i) => headerRow[i] || '');
  const filteredRows = dataRows.map((row) => columnsToKeep.map((i) => row[i] || ''));

  // Step 3: Find "Amount" column index in filtered data
  const amountIndex = filteredHeader.findIndex(
    (header) => header.toLowerCase().trim() === 'amount'
  );

  // Step 4: Remove rows without amount values
  let cleanedRows = filteredRows;
  if (amountIndex !== -1) {
    cleanedRows = filteredRows.filter((row) => {
      const amountValue = row[amountIndex]?.trim();
      return amountValue !== '' && amountValue !== '-';
    });
  }

  return [filteredHeader, ...cleanedRows];
}

/**
 * Gets all valid tables and converts them to CSV format
 */
function getValidTables(): TablesResponse {
  console.log('Table Detector: getValidTables() called');
  const allTables = document.querySelectorAll('table');
  console.log(`Table Detector: Found ${allTables.length} total tables on page`);

  const validTablesWithTypes = Array.from(allTables)
    .map((table) => {
      const type = getTableType(table as HTMLTableElement);
      return type ? { table: table as HTMLTableElement, type } : null;
    })
    .filter((item): item is { table: HTMLTableElement; type: TableType } => item !== null);

  console.log(
    `Table Detector: ${validTablesWithTypes.length} valid tables found (price: ${validTablesWithTypes.filter((t) => t.type === 'price').length}, dividend: ${validTablesWithTypes.filter((t) => t.type === 'dividend').length})`
  );

  const tables = validTablesWithTypes.map(({ table, type }, index) => {
    let data = tableToArray(table);
    // Filter out completely empty rows
    data = data.filter((row) => row.some((cell) => cell !== ''));
    
    // Apply dividend-specific cleaning
    if (type === 'dividend') {
      data = cleanDividendData(data);
    }
    
    const csvData = Papa.unparse(data, {
      quotes: true, // Wrap all fields in double quotes
      skipEmptyLines: true,
    });
    const rows = data.length;
    const columns = data[0]?.length || 0;
    console.log(
      `Table Detector: Table ${index + 1} (${type}) - ${rows} rows × ${columns} columns`
    );

    return {
      index,
      rows,
      columns,
      csvData,
      type,
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
  const validTables = Array.from(allTables).filter((table) => {
    const type = getTableType(table as HTMLTableElement);
    return type !== null;
  });
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
  const validTables = Array.from(allTables).filter((table) => {
    const type = getTableType(table as HTMLTableElement);
    return type !== null;
  });

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
  const tableType = getTableType(table);

  try {
    const allRows = await scrollAndCollectRows(table, (update) => {
      chrome.runtime.sendMessage(update).catch(console.error);
    });

    // Filter out completely empty rows
    let filteredRows = allRows.filter((row) => row.some((cell) => cell !== ''));

    // Apply dividend-specific cleaning
    if (tableType === 'dividend') {
      filteredRows = cleanDividendData(filteredRows);
    }

    // Generate CSV from all collected rows
    const csvData = Papa.unparse(filteredRows, {
      quotes: true, // Wrap all fields in double quotes
      skipEmptyLines: true,
    });

    console.log(`Table Detector: Generated CSV with ${filteredRows.length} rows`);

    chrome.runtime.sendMessage({
      action: 'downloadProgress',
      progress: 100,
      rowsCollected: filteredRows.length,
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
