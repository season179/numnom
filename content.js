// Detect tables on the current page
function detectTables() {
  const tables = document.querySelectorAll('table');
  const tableCount = tables.length;
  
  // Send message to background script
  chrome.runtime.sendMessage({
    action: 'updateBadge',
    tableCount: tableCount
  });
}

// Run detection when page is loaded
detectTables();

// Also observe DOM changes to detect dynamically added tables
const observer = new MutationObserver(() => {
  detectTables();
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});
