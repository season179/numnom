/**
 * Background service worker that updates the extension badge
 */

interface TableCountMessage {
  action: 'updateBadge';
  tableCount: number;
}

/**
 * Updates the extension badge based on table count
 */
function updateBadge(tabId: number, tableCount: number): void {
  if (tableCount > 0) {
    // Show green badge with table count
    chrome.action.setBadgeText({
      text: tableCount.toString(),
      tabId,
    });
    chrome.action.setBadgeBackgroundColor({
      color: '#00AA00',
      tabId,
    });
    chrome.action.setTitle({
      title: `NumNom - ${tableCount} table(s) found`,
      tabId,
    });
  } else {
    // No tables - clear badge
    chrome.action.setBadgeText({
      text: '',
      tabId,
    });
    chrome.action.setTitle({
      title: 'NumNom - No tables found',
      tabId,
    });
  }
}

/**
 * Listen for messages from content scripts
 */
chrome.runtime.onMessage.addListener(
  (
    message: TableCountMessage,
    sender: chrome.runtime.MessageSender,
    _sendResponse: (response?: unknown) => void
  ) => {
    if (message.action === 'updateBadge' && sender.tab?.id !== undefined) {
      const tabId = sender.tab.id;
      const tableCount = message.tableCount;
      updateBadge(tabId, tableCount);
    }
  }
);
