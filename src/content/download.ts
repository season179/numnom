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
import { createLogger } from '../shared/logger';
import type { ProgressUpdate } from '../shared/types';
import { hashRow } from '../shared/utils';
import { cleanDividendData, cleanPriceData, getTableType, tableToArray } from './detection';

const log = createLogger('content');

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

  log.debug('Starting scroll & collect');
  log.debug('Scrollable container', { container: container?.tagName });

  // Collect initial rows
  const initialData = tableToArray(table);
  for (const row of initialData) {
    uniqueRows.set(hashRow(row), row);
  }

  if (!container) {
    log.debug('No scrollable container found');
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
      log.info('Download cancelled');
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

    log.debug('Scroll progress', { progress, rows: uniqueRows.size, scrollTop, scrollHeight });

    onProgress({
      action: 'downloadProgress',
      progress,
      rowsCollected: uniqueRows.size,
      status: 'scrolling',
    });

    // Check if we've reached the bottom
    if (scrollTop + clientHeight >= scrollHeight - BOTTOM_THRESHOLD_PX) {
      log.debug('Reached bottom of scroll');

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

  log.info('Collection complete', { totalRows: uniqueRows.size });
  return Array.from(uniqueRows.values());
}

/**
 * Handles full download request with scrolling
 */
export async function handleFullDownload(tableIndex: number): Promise<void> {
  log.info('Starting full download', { tableIndex });

  const allTables = document.querySelectorAll('table');
  const validTables = Array.from(allTables).filter((table) => {
    const type = getTableType(table as HTMLTableElement);
    return type !== null;
  });

  if (tableIndex >= validTables.length) {
    log.error('Invalid table index', { tableIndex, validCount: validTables.length });
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
      chrome.runtime.sendMessage(update).catch((err) => log.error('Failed to send progress', err));
    });

    // Filter out completely empty rows
    let filteredRows = allRows.filter((row) => row.some((cell) => cell !== ''));

    // Apply type-specific cleaning
    if (tableType === 'dividend') {
      filteredRows = cleanDividendData(filteredRows);
    } else if (tableType === 'price') {
      const result = cleanPriceData(filteredRows);
      filteredRows = result.data;
    }

    // Generate CSV from all collected rows
    const csvData = Papa.unparse(filteredRows, {
      quotes: true, // Wrap all fields in double quotes
      skipEmptyLines: true,
    });

    log.info('Generated CSV', { rows: filteredRows.length });

    chrome.runtime.sendMessage({
      action: 'downloadProgress',
      progress: 100,
      rowsCollected: filteredRows.length,
      status: 'complete',
      csvData,
    } as ProgressUpdate);
  } catch (error) {
    log.error('Error during full download', error);
    chrome.runtime.sendMessage({
      action: 'downloadProgress',
      progress: 0,
      rowsCollected: 0,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    } as ProgressUpdate);
  }
}
