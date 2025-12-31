/**
 * Table detection logic for NumNom Chrome extension
 * Detects price tables (open/close columns) and dividend tables
 */

import Papa from 'papaparse';
import { createLogger } from '../shared/logger';
import type { TableCountMessage, TableType, TablesResponse } from '../shared/types';
import {
  extractTimeframe,
  isAmountColumn,
  isAnnouncementDateColumn,
  isCloseColumn,
  isDateColumn,
  isDescriptionColumn,
  isExDateColumn,
  isHighColumn,
  isIndicatorColumn,
  isLowColumn,
  isOpenColumn,
  isPaymentDateColumn,
  normalizeTextForExcel,
  parseDateToISO,
} from '../shared/utils';
import { extractStockTicker } from './ticker';

const log = createLogger('content');

/**
 * Extracts column names from a table row
 */
function getColumnNamesFromRow(row: Element): string[] {
  const cells = Array.from(row.querySelectorAll('th, td'));
  return cells.map((cell) => cell.textContent?.trim() || '');
}

/**
 * Checks if a set of column names contains all required OHLC price columns
 */
function hasAllPriceColumns(columnNames: string[]): boolean {
  const hasOpen = columnNames.some(isOpenColumn);
  const hasClose = columnNames.some(isCloseColumn);
  const hasHigh = columnNames.some(isHighColumn);
  const hasLow = columnNames.some(isLowColumn);
  return hasOpen && hasClose && hasHigh && hasLow;
}

/**
 * Checks if a table has all OHLC price columns (open, high, low, close)
 * Searches all rows in thead (bottom-up), then falls back to first 5 rows
 */
function hasPriceColumns(table: HTMLTableElement): boolean {
  // First, check all rows in thead (bottom-up for multi-row headers)
  const theadRows = Array.from(table.querySelectorAll('thead tr'));
  for (let i = theadRows.length - 1; i >= 0; i--) {
    const row = theadRows[i];
    if (row) {
      const columnNames = getColumnNamesFromRow(row);
      if (hasAllPriceColumns(columnNames)) {
        return true;
      }
    }
  }

  // Fallback: check first 5 rows of the table (bottom-up, for tables without thead)
  const allRows = Array.from(table.querySelectorAll('tr')).slice(0, 5);
  for (let i = allRows.length - 1; i >= 0; i--) {
    const row = allRows[i];
    if (row) {
      const columnNames = getColumnNamesFromRow(row);
      if (hasAllPriceColumns(columnNames)) {
        return true;
      }
    }
  }

  return false;
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
  if (hasPriceColumns(table)) {
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

// ============================================================================
// Price Column Standardization
// Reorders columns to: date, open, high, low, close, extras (JSON for unmatched)
// ============================================================================

/** Standard price column names in output order */
const PRICE_COLUMNS = ['date', 'open', 'high', 'low', 'close'] as const;

type PriceColumnName = (typeof PRICE_COLUMNS)[number];

/** Maps standard column names to their source column index */
interface PriceColumnMapping {
  date: number; // required
  open: number; // required
  high: number; // required
  low: number; // required
  close: number; // required
  extras: number[]; // indexes of unmatched columns
}

/** Column matchers for price tables */
const PRICE_COLUMN_MATCHERS: { name: PriceColumnName; matcher: (name: string) => boolean }[] = [
  { name: 'date', matcher: isDateColumn },
  { name: 'open', matcher: isOpenColumn },
  { name: 'high', matcher: isHighColumn },
  { name: 'low', matcher: isLowColumn },
  { name: 'close', matcher: isCloseColumn },
];

/**
 * Maps source column headers to standard price columns using priority-based claiming.
 */
function mapPriceColumns(headers: string[]): Partial<PriceColumnMapping> {
  const claimed = new Set<number>();
  const mapping: Partial<PriceColumnMapping> = { extras: [] };

  // Process each target column in priority order
  for (const { name, matcher } of PRICE_COLUMN_MATCHERS) {
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

  return mapping;
}

/**
 * Checks if a mapping has all required OHLC columns (not including date).
 */
function hasRequiredOHLCColumns(mapping: Partial<PriceColumnMapping>): boolean {
  return (
    mapping.open !== undefined &&
    mapping.high !== undefined &&
    mapping.low !== undefined &&
    mapping.close !== undefined
  );
}

/**
 * Finds the header row that contains OHLC columns.
 * Tables may have multi-row headers where OHLC columns are in a different row than row 0.
 */
function findOHLCHeaderRow(
  data: string[][]
): { headerRowIndex: number; mapping: Partial<PriceColumnMapping> } | null {
  const maxHeaderRows = Math.min(5, data.length);

  for (let i = 0; i < maxHeaderRows; i++) {
    const row = data[i];
    if (!row) continue;

    const mapping = mapPriceColumns(row);
    if (hasRequiredOHLCColumns(mapping)) {
      return { headerRowIndex: i, mapping };
    }
  }

  return null;
}

/**
 * Builds the standardized header row for price data based on which columns are present.
 */
function buildPriceHeader(mapping: PriceColumnMapping): string[] {
  const header: string[] = ['date', 'open', 'high', 'low', 'close'];
  if (mapping.extras.length > 0) header.push('extras');
  return header;
}

/** Result from cleaning price data, includes timeframe if detected */
export interface CleanPriceDataResult {
  data: string[][];
  timeframe: string | null;
}

/**
 * Cleans price table data by:
 * 1. Standardizing column order and names (date, open, high, low, close)
 * 2. Parsing date column to YYYY-MM-DD format
 * 3. Converting unmatched columns to JSON extras
 * 4. Extracting timeframe from header rows
 *
 * Handles multi-row headers with colspan where:
 * - Header row may have fewer columns than data rows
 * - OHLC column names may be in a different row than the date column
 */
export function cleanPriceData(data: string[][]): CleanPriceDataResult {
  if (data.length === 0) return { data, timeframe: null };

  // Find the header row with OHLC columns (may not be row 0)
  const headerInfo = findOHLCHeaderRow(data);
  if (!headerInfo) {
    return { data, timeframe: null };
  }

  const { headerRowIndex, mapping } = headerInfo;
  const headerRow = data[headerRowIndex];
  if (!headerRow) return { data, timeframe: null };

  // Data rows start after the header row
  const dataRows = data.slice(headerRowIndex + 1);
  if (dataRows.length === 0) return { data, timeframe: null };

  // Calculate column offset: data may have more columns than header (due to colspan)
  const dataColumnCount = dataRows[0]?.length || 0;
  const headerColumnCount = headerRow.length;
  const columnOffset = Math.max(0, dataColumnCount - headerColumnCount);

  // Build final mapping with offset applied
  // If header doesn't have date column but has offset, assume data column 0 is date
  const finalMapping: PriceColumnMapping = {
    date: mapping.date !== undefined ? mapping.date + columnOffset : 0,
    open: (mapping.open ?? 0) + columnOffset,
    high: (mapping.high ?? 1) + columnOffset,
    low: (mapping.low ?? 2) + columnOffset,
    close: (mapping.close ?? 3) + columnOffset,
    extras: (mapping.extras || []).map((i) => i + columnOffset),
  };

  // If date column was inferred (not from header), add remaining pre-offset columns to extras
  if (mapping.date === undefined && columnOffset > 0) {
    // Column 0 is date, so extras should include indices 1 to columnOffset-1 (if any)
    // But typically columnOffset=1 means only column 0 is extra (date), nothing else to add
  }

  // Extract timeframe from any header row (search rows 0 to headerRowIndex)
  let timeframe: string | null = null;
  for (let i = 0; i <= headerRowIndex && !timeframe; i++) {
    const row = data[i];
    if (!row) continue;
    for (const cell of row) {
      const tf = extractTimeframe(cell);
      if (tf) {
        timeframe = tf;
        break;
      }
    }
  }

  // Build headers for extras (using original header row, with offset)
  const extrasHeaders: string[] = [];
  for (const idx of finalMapping.extras) {
    // Map back to header index if possible
    const headerIdx = idx - columnOffset;
    if (headerIdx >= 0 && headerIdx < headerRow.length) {
      extrasHeaders.push(headerRow[headerIdx] || `col_${idx}`);
    } else {
      extrasHeaders.push(`col_${idx}`);
    }
  }

  const includeExtras = finalMapping.extras.length > 0;

  // Build standardized header
  const standardHeader = buildPriceHeader(finalMapping);

  // Reorder data rows
  const standardizedRows = dataRows
    .filter((row) => {
      // Remove rows without valid date values
      const dateValue = row[finalMapping.date]?.trim();
      return dateValue !== '' && dateValue !== '-';
    })
    .map((row) => {
      const result: string[] = [];

      // Add columns in standard order (parse date column to YYYY-MM-DD)
      result.push(parseDateToISO(row[finalMapping.date] || ''));
      result.push(row[finalMapping.open] || '');
      result.push(row[finalMapping.high] || '');
      result.push(row[finalMapping.low] || '');
      result.push(row[finalMapping.close] || '');

      // Add extras JSON if there are unmatched columns
      if (includeExtras) {
        const extras: Record<string, string> = {};
        for (let i = 0; i < finalMapping.extras.length; i++) {
          const dataIdx = finalMapping.extras[i];
          const key = toSnakeCase(extrasHeaders[i] || `col_${dataIdx}`);
          const value = row[dataIdx ?? 0] || '';
          if (key && value) {
            extras[key] = value;
          }
        }
        result.push(Object.keys(extras).length > 0 ? JSON.stringify(extras) : '');
      }

      return result;
    });

  return {
    data: [standardHeader, ...standardizedRows],
    timeframe,
  };
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

    let timeframe: string | null = null;

    // Apply type-specific cleaning
    if (type === 'dividend') {
      data = cleanDividendData(data);
    } else if (type === 'price') {
      const result = cleanPriceData(data);
      data = result.data;
      timeframe = result.timeframe;
    }

    const csvData = Papa.unparse(data, {
      quotes: true, // Wrap all fields in double quotes
      skipEmptyLines: true,
    });
    const rows = data.length;
    const columns = data[0]?.length || 0;
    log.debug('Table processed', { index: index + 1, type, rows, columns, timeframe });

    return {
      index,
      rows,
      columns,
      csvData,
      type,
      ...(timeframe && { timeframe }),
    };
  });

  // Only extract ticker if tables were found
  if (tables.length > 0) {
    const { ticker, source } = extractStockTicker();
    log.debug('Extracted ticker', { ticker, source });
    return { tables, ticker, tickerSource: source };
  }

  // No tables found, return empty ticker
  return { tables, ticker: '', tickerSource: 'none' };
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
