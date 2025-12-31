/**
 * Content script entry point for NumNom Chrome extension
 * Coordinates table detection and download handling
 */

import { OBSERVER_RETRY_DELAY_MS } from '../shared/constants';
import { createLogger } from '../shared/logger';
import type { ContentScriptMessage, TablesResponse } from '../shared/types';
import { detectTables, getValidTables } from './detection';
import { cancelCurrentDownload, handleFullDownload } from './download';

const log = createLogger('content');

log.info('Content script loaded');

/**
 * Sets up MutationObserver to detect dynamically added tables
 */
function setupObserver(): void {
  if (!document.body) {
    // Body not ready yet, wait a bit
    setTimeout(setupObserver, OBSERVER_RETRY_DELAY_MS);
    return;
  }

  const observer = new MutationObserver(() => {
    detectTables();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  log.info('Observer initialized');
}

// Run initial detection
detectTables();

// Set up observer for dynamic changes
setupObserver();

// Listen for messages from popup
chrome.runtime.onMessage.addListener(
  (
    message: ContentScriptMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: TablesResponse) => void
  ) => {
    log.debug('Received message', message);

    if (message.action === 'getTables') {
      log.debug('Processing getTables request');
      try {
        const response = getValidTables();
        log.debug('Sending response', { tableCount: response.tables.length });
        sendResponse(response);
      } catch (err) {
        log.error('Error processing getTables', err);
        sendResponse({ tables: [], ticker: '', tickerSource: 'none' });
      }
    } else if (message.action === 'startFullDownload') {
      log.debug('Processing startFullDownload request');
      handleFullDownload(message.tableIndex);
      // Don't call sendResponse for async operation
    } else if (message.action === 'cancelDownload') {
      log.debug('Processing cancelDownload request');
      cancelCurrentDownload();
    }

    return true; // Keep message channel open for async response
  }
);
