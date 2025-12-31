/**
 * Table detection logic for NumNom Chrome extension
 * Detects price tables (open/close columns) and dividend tables
 */

import Papa from 'papaparse';
import { createLogger } from '../shared/logger';
import type { TableCountMessage, TableType, TablesResponse } from '../shared/types';
import {
  isAmountColumn,
  isAnnouncementDateColumn,
  isDescriptionColumn,
  isExDateColumn,
  isIndicatorColumn,
  isPaymentDateColumn,
  normalizeTextForExcel,
  parseDateToISO,
} from '../shared/utils';

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
 * Checks if a table has dividend columns (ex-dividend date and amount)
 * Uses the same column matchers as CSV standardization for consistency.
 */
function hasDividendColumns(table: HTMLTableElement): boolean {
  const headerCells = Array.from(
    table.querySelectorAll('thead th, thead td, tr:first-child th, tr:first-child td')
  );

  const columnNames = headerCells.map((cell) => cell.textContent?.trim() || '');

  // Both columns must be present
  const hasExDate = columnNames.some(isExDateColumn);
  const hasAmount = columnNames.some(isAmountColumn);

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

// ============================================================================
// Dividend Column Standardization
// Reorders columns to: ex_date, amount, indicator, announcement_date,
// payment_date, description, extras (JSON for unmatched columns)
// ============================================================================

/** Standard dividend column names in output order */
const DIVIDEND_COLUMNS = [
  'ex_date',
  'amount',
  'indicator',
  'announcement_date',
  'payment_date',
  'description',
] as const;

type DividendColumnName = (typeof DIVIDEND_COLUMNS)[number];

/** Maps standard column names to their source column index */
interface DividendColumnMapping {
  ex_date: number; // required
  amount: number; // required
  indicator?: number;
  announcement_date?: number;
  payment_date?: number;
  description?: number;
  extras: number[]; // indexes of unmatched columns
}

/** Column matchers in priority order */
const COLUMN_MATCHERS: { name: DividendColumnName; matcher: (name: string) => boolean }[] = [
  { name: 'ex_date', matcher: isExDateColumn },
  { name: 'amount', matcher: isAmountColumn },
  { name: 'indicator', matcher: isIndicatorColumn },
  { name: 'announcement_date', matcher: isAnnouncementDateColumn },
  { name: 'payment_date', matcher: isPaymentDateColumn },
  { name: 'description', matcher: isDescriptionColumn },
];

/**
 * Maps source column headers to standard dividend columns using priority-based claiming.
 * Columns are claimed in priority order to avoid conflicts (e.g., "Ex Dividend Date"
 * is claimed as ex_date before "Dividend" can be claimed as amount).
 */
function mapDividendColumns(headers: string[]): DividendColumnMapping {
  const claimed = new Set<number>();
  const mapping: Partial<DividendColumnMapping> = { extras: [] };

  // Process each target column in priority order
  for (const { name, matcher } of COLUMN_MATCHERS) {
    for (let i = 0; i < headers.length; i++) {
      if (!claimed.has(i) && matcher(headers[i] || '')) {
        mapping[name] = i;
        claimed.add(i);
        break;
      }
    }
  }

  // All unclaimed columns go to extras
  mapping.extras = headers.map((_, i) => i).filter((i) => !claimed.has(i));

  return mapping as DividendColumnMapping;
}

/**
 * Converts a header name to a snake_case key for JSON extras.
 * Example: "Financial Year" -> "financial_year"
 */
function toSnakeCase(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Builds a JSON string from unmatched columns.
 * Returns empty string if no extras.
 */
function buildExtrasJson(row: string[], headers: string[], extrasIndexes: number[]): string {
  if (extrasIndexes.length === 0) return '';

  const extras: Record<string, string> = {};
  for (const i of extrasIndexes) {
    const key = toSnakeCase(headers[i] || `col_${i}`);
    const value = row[i] || '';
    if (key && value) {
      extras[key] = value;
    }
  }

  return Object.keys(extras).length > 0 ? JSON.stringify(extras) : '';
}

/**
 * Reorders a data row according to the column mapping.
 * Returns array with standardized column order + extras JSON.
 */
function reorderDividendRow(
  row: string[],
  headers: string[],
  mapping: DividendColumnMapping,
  includeExtras: boolean
): string[] {
  const result: string[] = [];

  // Add columns in standard order (parse date columns to YYYY-MM-DD)
  result.push(parseDateToISO(row[mapping.ex_date] || ''));
  result.push(row[mapping.amount] || '');

  if (mapping.indicator !== undefined) {
    result.push(row[mapping.indicator] || '');
  }
  if (mapping.announcement_date !== undefined) {
    result.push(parseDateToISO(row[mapping.announcement_date] || ''));
  }
  if (mapping.payment_date !== undefined) {
    result.push(parseDateToISO(row[mapping.payment_date] || ''));
  }
  if (mapping.description !== undefined) {
    result.push(row[mapping.description] || '');
  }

  // Add extras JSON if there are unmatched columns
  if (includeExtras && mapping.extras.length > 0) {
    result.push(buildExtrasJson(row, headers, mapping.extras));
  }

  return result;
}

/**
 * Builds the standardized header row based on which columns are present.
 */
function buildStandardizedHeader(mapping: DividendColumnMapping): string[] {
  const header: string[] = ['ex_date', 'amount'];

  if (mapping.indicator !== undefined) header.push('indicator');
  if (mapping.announcement_date !== undefined) header.push('announcement_date');
  if (mapping.payment_date !== undefined) header.push('payment_date');
  if (mapping.description !== undefined) header.push('description');
  if (mapping.extras.length > 0) header.push('extras');

  return header;
}

/**
 * Cleans dividend table data by:
 * 1. Removing columns that only contain "view"
 * 2. Standardizing column order and names
 * 3. Converting unmatched columns to JSON extras
 * 4. Removing rows without dividend amounts
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
    const hasNonViewContent = dataRows.some((row) => {
      const cell = row[colIndex]?.toLowerCase().trim() || '';
      return cell !== 'view' && cell !== '';
    });

    if (hasNonViewContent) {
      columnsToKeep.push(colIndex);
    }
  }

  // Step 2: Filter out "view" columns
  const filteredHeader = columnsToKeep.map((i) => headerRow[i] || '');
  const filteredRows = dataRows.map((row) => columnsToKeep.map((i) => row[i] || ''));

  // Step 3: Map columns to standard names using priority-based claiming
  const mapping = mapDividendColumns(filteredHeader);
  const includeExtras = mapping.extras.length > 0;

  // Step 4: Build standardized header
  const standardHeader = buildStandardizedHeader(mapping);

  // Step 5: Reorder data rows and filter out rows without amount values
  const standardizedRows = filteredRows
    .filter((row) => {
      // Remove rows without valid amount values
      const amountValue = row[mapping.amount]?.trim();
      return amountValue !== '' && amountValue !== '-';
    })
    .map((row) => reorderDividendRow(row, filteredHeader, mapping, includeExtras));

  return [standardHeader, ...standardizedRows];
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
