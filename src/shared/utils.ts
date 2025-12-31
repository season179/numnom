/**
 * Shared utility functions for NumNom Chrome extension
 */

/**
 * Tokenizes a string by normalizing and splitting into words.
 * Handles: spaces, hyphens, underscores, and camelCase.
 *
 * @example
 * tokenize("Ex-Dividend Date") // => Set{"ex", "dividend", "date"}
 * tokenize("ExDate") // => Set{"ex", "date"}
 */
export function tokenize(str: string): Set<string> {
  return new Set(
    str
      // Insert space before uppercase letters (camelCase splitting)
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .replace(/[-_]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
  );
}

// ============================================================================
// Dividend Column Matchers (for CSV standardization)
// Used by priority-based claiming algorithm in detection.ts
// ============================================================================

/**
 * Matches ex-dividend date column.
 * Pattern: has "ex" OR "xd"
 * Examples: "Ex Date", "Ex-Dividend Date", "XD Date", "ExDate"
 */
export function isExDateColumn(name: string): boolean {
  const tokens = tokenize(name);
  return tokens.has('ex') || tokens.has('xd');
}

/**
 * Matches dividend amount column.
 * Pattern: has "amount" OR "amt" OR "dividend"
 * Examples: "Amount", "Dividend Amount", "Amt", "Dividend"
 * Note: Use with priority-based claiming so "Ex Dividend Date" gets claimed first.
 */
export function isAmountColumn(name: string): boolean {
  const tokens = tokenize(name);
  return tokens.has('amount') || tokens.has('amt') || tokens.has('dividend');
}

/**
 * Matches dividend indicator/type column.
 * Pattern: has "indicator" OR (has "type" AND (has "div" OR "dividend"))
 * Examples: "Indicator", "Dividend Type", "Div Type", "Type Indicator"
 */
export function isIndicatorColumn(name: string): boolean {
  const tokens = tokenize(name);
  if (tokens.has('indicator')) return true;
  if (tokens.has('type') && (tokens.has('div') || tokens.has('dividend'))) return true;
  return false;
}

/**
 * Matches announcement date column.
 * Pattern: has "announced" OR "announcement" OR "declared" OR "declaration"
 * Examples: "Announced", "Announcement Date", "Declared Date", "Declaration"
 */
export function isAnnouncementDateColumn(name: string): boolean {
  const tokens = tokenize(name);
  return (
    tokens.has('announced') ||
    tokens.has('announcement') ||
    tokens.has('declared') ||
    tokens.has('declaration')
  );
}

/**
 * Matches payment date column.
 * Pattern: has "payment" OR "pay" OR "payable" OR "paid"
 * Examples: "Payment Date", "Pay Date", "Payable Date", "Paid"
 */
export function isPaymentDateColumn(name: string): boolean {
  const tokens = tokenize(name);
  return tokens.has('payment') || tokens.has('pay') || tokens.has('payable') || tokens.has('paid');
}

/**
 * Matches description column.
 * Pattern: has "subject" OR "description"
 * Examples: "Subject", "Description"
 */
export function isDescriptionColumn(name: string): boolean {
  const tokens = tokenize(name);
  return tokens.has('subject') || tokens.has('description');
}

// ============================================================================
// Price Column Matchers
// Used for detecting OHLC (Open, High, Low, Close) price tables
// ============================================================================

/**
 * Matches open price column.
 * Examples: "Open", "Open Price", "OpenPrice"
 */
export function isOpenColumn(name: string): boolean {
  return tokenize(name).has('open');
}

/**
 * Matches close price column.
 * Examples: "Close", "Adj Close", "Close Price", "Closing"
 */
export function isCloseColumn(name: string): boolean {
  return tokenize(name).has('close');
}

/**
 * Matches high price column.
 * Examples: "High", "High Price", "Day High"
 */
export function isHighColumn(name: string): boolean {
  return tokenize(name).has('high');
}

/**
 * Matches low price column.
 * Examples: "Low", "Low Price", "Day Low", "52-week Low"
 */
export function isLowColumn(name: string): boolean {
  return tokenize(name).has('low');
}

/**
 * Matches date column for price tables.
 * Examples: "Date", "Trade Date", "Date · 1M"
 */
export function isDateColumn(name: string): boolean {
  return tokenize(name).has('date');
}

/**
 * Normalizes text for Excel compatibility.
 * - Replaces Unicode minus (U+2212) with ASCII hyphen-minus (U+002D)
 * - Replaces middle dot (U+00B7) with space
 */
export function normalizeTextForExcel(text: string): string {
  return text.replace(/−/g, '-').replace(/·/g, ' ');
}

/**
 * Creates a hash from row data for deduplication.
 * Uses pipe separator to create unique row identifier.
 */
export function hashRow(cells: string[]): string {
  return cells.join('|');
}

/**
 * Formats date as YYYY-MM-DD for filename generation.
 */
export function formatDateForFilename(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ============================================================================
// Date Parsing for Dividend CSV
// Converts various date formats to YYYY-MM-DD
// ============================================================================

const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

/**
 * Parses a date string and returns it in YYYY-MM-DD format.
 *
 * Supported formats:
 * - ISO: "2024-01-15", "2024/01/15"
 * - US: "01/15/2024", "1/15/2024"
 * - EU: "15/01/2024" (only when day > 12)
 * - Text: "Jan 15, 2024", "15 Jan 2024"
 *
 * @returns YYYY-MM-DD string, empty string for empty/dash input, or "INVALID_DATE"
 */
export function parseDateToISO(dateStr: string): string {
  const trimmed = dateStr.trim();
  if (!trimmed || trimmed === '-') return '';

  // Try ISO format first: YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch?.[1] && isoMatch[2] && isoMatch[3]) {
    const date = createValidDate(+isoMatch[1], +isoMatch[2], +isoMatch[3]);
    if (date) return formatToISO(date);
  }

  // Try text format: "Jan 15, 2024" or "January 15, 2024"
  const textMatch1 = trimmed.match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (textMatch1?.[1] && textMatch1[2] && textMatch1[3]) {
    const month = MONTH_NAMES[textMatch1[1].toLowerCase()];
    if (month) {
      const date = createValidDate(+textMatch1[3], month, +textMatch1[2]);
      if (date) return formatToISO(date);
    }
  }

  // Try text format: "15 Jan 2024"
  const textMatch2 = trimmed.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i);
  if (textMatch2?.[1] && textMatch2[2] && textMatch2[3]) {
    const month = MONTH_NAMES[textMatch2[2].toLowerCase()];
    if (month) {
      const date = createValidDate(+textMatch2[3], month, +textMatch2[1]);
      if (date) return formatToISO(date);
    }
  }

  // Try text format with 2-digit year: "Mon 01 Dec '25" or "01 Dec '25"
  const textMatch3 = trimmed.match(/^(?:[a-z]{3}\s+)?(\d{1,2})\s+([a-z]+)\s+'(\d{2})$/i);
  if (textMatch3?.[1] && textMatch3[2] && textMatch3[3]) {
    const month = MONTH_NAMES[textMatch3[2].toLowerCase()];
    if (month) {
      const year = twoDigitYearToFour(+textMatch3[3]);
      const date = createValidDate(year, month, +textMatch3[1]);
      if (date) return formatToISO(date);
    }
  }

  // Try text format with 2-digit year: "Dec 01, '25" or "December 01 '25"
  const textMatch4 = trimmed.match(/^([a-z]+)\s+(\d{1,2}),?\s+'(\d{2})$/i);
  if (textMatch4?.[1] && textMatch4[2] && textMatch4[3]) {
    const month = MONTH_NAMES[textMatch4[1].toLowerCase()];
    if (month) {
      const year = twoDigitYearToFour(+textMatch4[3]);
      const date = createValidDate(year, month, +textMatch4[2]);
      if (date) return formatToISO(date);
    }
  }

  // Try numeric format: MM/DD/YYYY or DD/MM/YYYY
  const numericMatch = trimmed.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (numericMatch?.[1] && numericMatch[2] && numericMatch[3]) {
    const f = +numericMatch[1];
    const s = +numericMatch[2];
    const y = +numericMatch[3];

    // If first > 12, must be EU format (DD/MM/YYYY)
    if (f > 12 && s <= 12) {
      const date = createValidDate(y, s, f);
      if (date) return formatToISO(date);
    }
    // Otherwise use US format (MM/DD/YYYY)
    const date = createValidDate(y, f, s);
    if (date) return formatToISO(date);
  }

  return 'INVALID_DATE';
}

/**
 * Converts 2-digit year to 4-digit year using Y2K cutoff of 50.
 * 00-49 → 2000-2049, 50-99 → 1950-1999
 */
function twoDigitYearToFour(twoDigitYear: number): number {
  return twoDigitYear < 50 ? 2000 + twoDigitYear : 1900 + twoDigitYear;
}

/** Formats a Date to YYYY-MM-DD */
function formatToISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Creates a valid Date or returns null if invalid */
function createValidDate(year: number, month: number, day: number): Date | null {
  if (year < 1900 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const date = new Date(year, month - 1, day);
  // Check for date rollover (e.g., Feb 30 becomes Mar 2)
  if (date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

// ============================================================================
// Timeframe Extraction
// Extracts timeframe from column headers like "Date · 1M" or "Date (1D)"
// ============================================================================

/** Known timeframe patterns (case-insensitive) */
const TIMEFRAME_PATTERNS = [
  // Intraday
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '4h',
  // Daily
  '1d',
  'daily',
  // Weekly
  '1w',
  'weekly',
  // Monthly
  '1mo',
  '1M',
  'monthly',
  // Yearly
  '1y',
  'yearly',
] as const;

/**
 * Extracts timeframe from a column header string.
 * Looks for patterns like "Date · 1M", "Date (1D)", "Date - daily"
 *
 * @returns Normalized timeframe string (e.g., "1M", "1D") or null if not found
 */
export function extractTimeframe(columnHeader: string): string | null {
  // Remove the main column name part and look for timeframe after separators
  // Common separators: · (middle dot), -, (, ), :, |
  const separatorMatch = columnHeader.match(/[·\-:()|]\s*(.+)$/);
  const searchText = separatorMatch?.[1] || columnHeader;

  // Search for known timeframe patterns
  const normalized = searchText.trim().toLowerCase();

  for (const pattern of TIMEFRAME_PATTERNS) {
    if (normalized === pattern.toLowerCase()) {
      // Return normalized version
      return normalizeTimeframe(pattern);
    }
  }

  // Try regex for numeric patterns like "1M", "5m", "1D", etc.
  const timeframeMatch = searchText.match(/\b(\d+)\s*(m|h|d|w|mo|y)\b/i);
  if (timeframeMatch?.[1] && timeframeMatch[2]) {
    const num = timeframeMatch[1];
    const unit = timeframeMatch[2].toLowerCase();
    return normalizeTimeframe(`${num}${unit}`);
  }

  return null;
}

/**
 * Normalizes timeframe to consistent format.
 * e.g., "daily" → "1D", "monthly" → "1M", "1mo" → "1M"
 */
function normalizeTimeframe(tf: string): string {
  const lower = tf.toLowerCase();

  // Word forms
  if (lower === 'daily') return '1D';
  if (lower === 'weekly') return '1W';
  if (lower === 'monthly') return '1M';
  if (lower === 'yearly') return '1Y';

  // Normalize "mo" to "M" for monthly
  if (lower.endsWith('mo')) {
    return lower.replace('mo', 'M').toUpperCase();
  }

  // Uppercase the unit letter
  return tf.replace(/([mhdwy])$/i, (match) => match.toUpperCase());
}
