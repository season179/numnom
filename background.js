// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateBadge') {
    const tabId = sender.tab.id;
    const tableCount = message.tableCount;
    
    if (tableCount > 0) {
      // Show green badge with table count
      chrome.action.setBadgeText({
        text: tableCount.toString(),
        tabId: tabId
      });
      chrome.action.setBadgeBackgroundColor({
        color: '#00AA00',
        tabId: tabId
      });
      chrome.action.setTitle({
        title: `Table Detector - ${tableCount} table(s) found`,
        tabId: tabId
      });
    } else {
      // No tables - clear badge
      chrome.action.setBadgeText({
        text: '',
        tabId: tabId
      });
      chrome.action.setTitle({
        title: 'Table Detector - No tables found',
        tabId: tabId
      });
    }
  }
});
