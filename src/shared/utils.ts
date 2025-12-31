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
