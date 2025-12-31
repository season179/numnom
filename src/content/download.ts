/**
 * Download logic for NumNom Chrome extension
 * Handles scrolling and collecting all table rows
 */

import Papa from 'papaparse';
import {
  BOTTOM_THRESHOLD_PX,
  FINAL_CONTENT_DELAY_MS,
  MAX_NO_NEW_ROWS_ATTEMPTS,
  MAX_SCROLL_ATTEMPTS,
  SCROLL_DELAY_MS,
  SCROLL_PROGRESS_CAP,
  SCROLL_VIEWPORT_RATIO,
} from '../shared/constants';
import type { ProgressUpdate } from '../shared/types';
import { hashRow } from '../shared/utils';
import { cleanDividendData, getTableType, tableToArray } from './detection';

// Module-level state for cancellation
let downloadCancelled = false;

/**
 * Cancels the current download operation
 */
export function cancelCurrentDownload(): void {
  downloadCancelled = true;
}

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
 * Scrolls container and collects all table rows
 */
async function scrollAndCollectRows(
  table: HTMLTableElement,
  onProgress: (update: ProgressUpdate) => void
): Promise<string[][]> {
  downloadCancelled = false;
  const container = findScrollableContainer(table);
  const uniqueRows = new Map<string, string[]>();

  console.log('NumNom: Starting scroll & collect');
  console.log('NumNom: Scrollable container:', container);

  // Collect initial rows
  const initialData = tableToArray(table);
  for (const row of initialData) {
    uniqueRows.set(hashRow(row), row);
  }

  if (!container) {
    console.log('NumNom: No scrollable container found');
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
  let scrollAttempts = 0;

  while (scrollAttempts < MAX_SCROLL_ATTEMPTS && noNewRowsCount < MAX_NO_NEW_ROWS_ATTEMPTS) {
    if (downloadCancelled) {
      console.log('NumNom: Download cancelled');
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
    scrollBy(clientHeight * SCROLL_VIEWPORT_RATIO);

    // Wait for content to load
    await new Promise((resolve) => setTimeout(resolve, SCROLL_DELAY_MS));

    // Collect newly rendered rows
    const currentData = tableToArray(table);
    for (const row of currentData) {
      uniqueRows.set(hashRow(row), row);
    }

    // Calculate progress
    const scrollTop = getScrollTop();
    const scrollHeight = getScrollHeight();
    const progress = Math.min(SCROLL_PROGRESS_CAP, Math.round((scrollTop / scrollHeight) * 100));

    console.log(
      `NumNom: Scroll progress: ${progress}%, Rows: ${uniqueRows.size}, ScrollTop: ${scrollTop}, ScrollHeight: ${scrollHeight}`
    );

    onProgress({
      action: 'downloadProgress',
      progress,
      rowsCollected: uniqueRows.size,
      status: 'scrolling',
    });

    // Check if we've reached the bottom
    if (scrollTop + clientHeight >= scrollHeight - BOTTOM_THRESHOLD_PX) {
      console.log('NumNom: Reached bottom of scroll');

      // Wait a bit more for any final content
      await new Promise((resolve) => setTimeout(resolve, FINAL_CONTENT_DELAY_MS));

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

  console.log(`NumNom: Collection complete. Total unique rows: ${uniqueRows.size}`);
  return Array.from(uniqueRows.values());
}

/**
 * Handles full download request with scrolling
 */
export async function handleFullDownload(tableIndex: number): Promise<void> {
  console.log(`NumNom: Starting full download for table ${tableIndex}`);

  const allTables = document.querySelectorAll('table');
  const validTables = Array.from(allTables).filter((table) => {
    const type = getTableType(table as HTMLTableElement);
    return type !== null;
  });

  if (tableIndex >= validTables.length) {
    console.error('NumNom: Invalid table index');
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

    console.log(`NumNom: Generated CSV with ${filteredRows.length} rows`);

    chrome.runtime.sendMessage({
      action: 'downloadProgress',
      progress: 100,
      rowsCollected: filteredRows.length,
      status: 'complete',
      csvData,
    } as ProgressUpdate);
  } catch (error) {
    console.error('NumNom: Error during full download:', error);
    chrome.runtime.sendMessage({
      action: 'downloadProgress',
      progress: 0,
      rowsCollected: 0,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    } as ProgressUpdate);
  }
}
