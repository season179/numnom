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
