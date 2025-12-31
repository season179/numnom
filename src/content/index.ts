/**
 * Content script entry point for NumNom Chrome extension
 * Coordinates table detection and download handling
 */

import { OBSERVER_RETRY_DELAY_MS } from '../shared/constants';
import type { ContentScriptMessage, TablesResponse } from '../shared/types';
import { detectTables, getValidTables } from './detection';
import { cancelCurrentDownload, handleFullDownload } from './download';

console.log('NumNom: Content script loaded!');

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

  console.log('NumNom: Observer initialized');
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
    console.log('NumNom: Received message:', message);

    if (message.action === 'getTables') {
      console.log('NumNom: Processing getTables request');
      try {
        const response = getValidTables();
        console.log('NumNom: Sending response with', response.tables.length, 'tables');
        sendResponse(response);
      } catch (err) {
        console.error('NumNom: Error processing getTables:', err);
        sendResponse({ tables: [], ticker: 'unknown' });
      }
    } else if (message.action === 'startFullDownload') {
      console.log('NumNom: Processing startFullDownload request');
      handleFullDownload(message.tableIndex);
      // Don't call sendResponse for async operation
    } else if (message.action === 'cancelDownload') {
      console.log('NumNom: Processing cancelDownload request');
      cancelCurrentDownload();
    }

    return true; // Keep message channel open for async response
  }
);
