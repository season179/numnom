// Detect tables on the current page
function detectTables() {
  const tables = document.querySelectorAll('table');
  const tableCount = tables.length;
  
  // Send message to background script
  chrome.runtime.sendMessage({
    action: 'updateBadge',
    tableCount: tableCount
  }).catch(err => {
    console.log('Table Detector: Failed to send message', err);
  });
}

// Set up MutationObserver to detect dynamically added tables
function setupObserver() {
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
    subtree: true
  });
  
  console.log('Table Detector: Observer initialized');
}

// Run initial detection
detectTables();

// Set up observer for dynamic changes
setupObserver();
