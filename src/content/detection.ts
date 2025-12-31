/**
 * Table detection logic for NumNom Chrome extension
 * Detects price tables (open/close columns) and dividend tables
 */

import Papa from 'papaparse';
import { createLogger } from '../shared/logger';
import type { TableCountMessage, TableType, TablesResponse } from '../shared/types';
import { normalizeTextForExcel, tokenize } from '../shared/utils';

const log = createLogger('content');

/**
 * Extracts stock ticker from the TradingView page
 */
export function extractStockTicker(): string {
  // Try to extract from URL first
  const urlParams = new URLSearchParams(window.location.search);
  const symbolParam = urlParams.get('symbol');
  if (symbolParam) {
    return symbolParam.split(':').pop()?.toLowerCase() || 'unknown';
  }

  // Try to extract from page title
  const titleMatch = document.title.match(/([A-Z0-9]+)/);
  if (titleMatch?.[1]) {
    return titleMatch[1].toLowerCase();
  }

  // Try to find ticker in chart header or other elements
  const tickerElement = document.querySelector('[data-name="legend-source-title"]');
  if (tickerElement?.textContent) {
    const text = tickerElement.textContent.trim();
    const match = text.match(/([A-Z0-9]+)/);
    if (match?.[1]) {
      return match[1].toLowerCase();
    }
  }

  // Fallback to hostname parsing
  const pathMatch = window.location.pathname.match(/\/symbols?\/([^\/]+)/);
  if (pathMatch?.[1]) {
    return pathMatch[1].toLowerCase();
  }

  return 'unknown';
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
 * Checks if a column name contains required tokens
 * @param columnName - The column header text
 * @param allRequired - Tokens that ALL must be present
 * @param anyRequired - Tokens where AT LEAST ONE must be present (if non-empty)
 */
function matchesColumnPattern(
  columnName: string,
  allRequired: string[],
  anyRequired: string[] = []
): boolean {
  const tokens = tokenize(columnName);
  const hasAllRequired = allRequired.every((t) => tokens.has(t));
  const hasAnyRequired = anyRequired.length === 0 || anyRequired.some((t) => tokens.has(t));
  return hasAllRequired && hasAnyRequired;
}

/**
 * Matches ex-dividend date column variations:
 * "Ex Date", "ex-date", "Ex Dividend Date", "ExDate"
 * Rule: must have "ex" AND ("date" OR "dividend")
 */
function isExDividendDateColumn(columnName: string): boolean {
  return matchesColumnPattern(columnName, ['ex'], ['date', 'dividend']);
}

/**
 * Matches dividend amount column variations:
 * "Amount", "Dividend", "Dividend Amount", "Div Amount"
 * Rule: must have "amount" OR "dividend"
 */
export function isDividendAmountColumn(columnName: string): boolean {
  return matchesColumnPattern(columnName, [], ['amount', 'dividend']);
}

/**
 * Checks if a table has dividend columns (ex-dividend date and amount)
 */
function hasDividendColumns(table: HTMLTableElement): boolean {
  const headerCells = Array.from(
    table.querySelectorAll('thead th, thead td, tr:first-child th, tr:first-child td')
  );

  const columnNames = headerCells.map((cell) => cell.textContent?.trim() || '');

  // Both columns must be present
  const hasExDate = columnNames.some(isExDividendDateColumn);
  const hasAmount = columnNames.some(isDividendAmountColumn);

  return hasExDate && hasAmount;
}

/**
 * Determines the type of table based on its columns
 */
export function getTableType(table: HTMLTableElement): TableType | null {
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
export function tableToArray(table: HTMLTableElement): string[][] {
  const rows = Array.from(table.querySelectorAll('tr'));
  return rows.map((row) => {
    const cells = Array.from(row.querySelectorAll('th, td'));
    return cells.map((cell) => {
      const text = cell.textContent?.trim() || '';
      return normalizeTextForExcel(text);
    });
  });
}

/**
 * Cleans dividend table data by:
 * 1. Removing columns that only contain "view"
 * 2. Removing rows without dividend amounts
 */
export function cleanDividendData(data: string[][]): string[][] {
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

  // Step 3: Find dividend amount column index in filtered data
  const amountIndex = filteredHeader.findIndex((header) => isDividendAmountColumn(header));

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
export function getValidTables(): TablesResponse {
  log.debug('getValidTables() called');
  const allTables = document.querySelectorAll('table');
  log.debug('Found tables on page', { total: allTables.length });

  const validTablesWithTypes = Array.from(allTables)
    .map((table) => {
      const type = getTableType(table as HTMLTableElement);
      return type ? { table: table as HTMLTableElement, type } : null;
    })
    .filter((item): item is { table: HTMLTableElement; type: TableType } => item !== null);

  log.info('Valid tables found', {
    count: validTablesWithTypes.length,
    price: validTablesWithTypes.filter((t) => t.type === 'price').length,
    dividend: validTablesWithTypes.filter((t) => t.type === 'dividend').length,
  });

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
    log.debug('Table processed', { index: index + 1, type, rows, columns });

    return {
      index,
      rows,
      columns,
      csvData,
      type,
    };
  });

  const ticker = extractStockTicker();
  log.debug('Extracted ticker', { ticker });
  return { tables, ticker };
}

/**
 * Detects tables on the current page and sends count to background script
 */
export function detectTables(): void {
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
    log.error('Failed to send message', err);
  });
}
