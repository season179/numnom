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
 * Formats date as yyyymmdd for filename generation.
 */
export function formatDateForFilename(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
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
