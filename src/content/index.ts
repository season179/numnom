/**
 * Content script that detects HTML tables on web pages
 */

interface TableCountMessage {
  action: 'updateBadge';
  tableCount: number;
}

/**
 * Detects tables on the current page and sends count to background script
 */
function detectTables(): void {
  const tables = document.querySelectorAll('table');
  const tableCount = tables.length;

  const message: TableCountMessage = {
    action: 'updateBadge',
    tableCount,
  };

  chrome.runtime.sendMessage(message).catch((err) => {
    console.log('Table Detector: Failed to send message', err);
  });
}

/**
 * Sets up MutationObserver to detect dynamically added tables
 */
function setupObserver(): void {
  if (!document.body) {
    // Body not ready yet, wait a bit
    setTimeout(setupObserver, 100);
    return;
  }

  const observer = new MutationObserver(() => {
    detectTables();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  console.log('Table Detector: Observer initialized');
}

// Run initial detection
detectTables();

// Set up observer for dynamic changes
setupObserver();
