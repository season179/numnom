/**
 * Popup script that displays detected tables and allows CSV download
 */

import { BUTTON_RESET_DELAY_MS } from '../shared/constants';
import { createLogger } from '../shared/logger';
import type {
  CancelDownloadMessage,
  GetTablesMessage,
  ProgressUpdate,
  StartFullDownloadMessage,
  TableType,
  TablesResponse,
} from '../shared/types';
import { formatDateForFilename } from '../shared/utils';

const log = createLogger('popup');

log.info('Script loaded');

// Ticker validation regex: 1-10 alphanumeric chars with optional dots/hyphens
const TICKER_REGEX = /^[A-Z0-9][A-Z0-9.\-]{0,9}$/i;

function isValidTicker(ticker: string): boolean {
  return ticker.length > 0 && TICKER_REGEX.test(ticker);
}

// State for tracking full downloads
let currentDownloadIndex: number | null = null;
let activeTabId: number | null = null;
let currentTicker = '';

/**
 * Triggers a download of the CSV file
 */
function downloadCSV(csvData: string, tableType: TableType, ticker: string): void {
  const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;

  // New format: {TICKER}_{type}_{YYYY-MM-DD}.csv
  const dateStr = formatDateForFilename(new Date());
  const typeStr = tableType === 'price' ? 'price' : 'dividend';
  link.download = `${ticker}_${typeStr}_${dateStr}.csv`;

  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Updates progress UI for a specific table - progress integrated into button
 */
function updateProgress(
  index: number,
  progress: number,
  rowsCollected: number,
  status: string
): void {
  const downloadBtn = document.getElementById(`download-${index}`) as HTMLButtonElement;
  if (!downloadBtn) return;

  const progressFill = downloadBtn.querySelector('.progress-fill') as HTMLElement;
  const btnText = downloadBtn.querySelector('.btn-text') as HTMLElement;

  if (status === 'scrolling') {
    downloadBtn.classList.add('downloading');
    downloadBtn.disabled = true;

    if (progressFill) {
      progressFill.style.width = `${progress}%`;
    }

    if (btnText) {
      btnText.innerHTML = `${progress}%<span class="separator">|</span>${rowsCollected} rows<span class="separator">|</span><span class="cancel-action">Cancel</span>`;
    }
  } else if (status === 'complete') {
    downloadBtn.classList.remove('downloading');
    downloadBtn.disabled = false;

    if (progressFill) {
      progressFill.style.width = '0%';
    }

    if (btnText) {
      btnText.textContent = 'Download';
    }
  } else if (status === 'error' || status === 'cancelled') {
    downloadBtn.classList.remove('downloading');
    downloadBtn.disabled = false;

    if (progressFill) {
      progressFill.style.width = '0%';
    }

    if (btnText) {
      btnText.textContent = status === 'cancelled' ? 'Cancelled' : 'Error';
      // Reset to "Download" after delay
      setTimeout(() => {
        if (btnText) btnText.textContent = 'Download';
      }, BUTTON_RESET_DELAY_MS);
    }
  }
}

/**
 * Starts full download with scrolling
 */
async function startFullDownload(index: number): Promise<void> {
  if (!activeTabId) return;

  currentDownloadIndex = index;

  // Update button to downloading state
  const downloadBtn = document.getElementById(`download-${index}`) as HTMLButtonElement;
  if (downloadBtn) {
    downloadBtn.classList.add('downloading');
    downloadBtn.disabled = true;
    const btnText = downloadBtn.querySelector('.btn-text') as HTMLElement;
    if (btnText) {
      btnText.innerHTML = `0%<span class="separator">|</span>0 rows<span class="separator">|</span><span class="cancel-action">Cancel</span>`;
    }
  }

  const message: StartFullDownloadMessage = {
    action: 'startFullDownload',
    tableIndex: index,
  };

  await chrome.tabs.sendMessage(activeTabId, message);
}

/**
 * Cancels ongoing download
 */
async function cancelDownload(): Promise<void> {
  if (!activeTabId || currentDownloadIndex === null) return;

  const message: CancelDownloadMessage = {
    action: 'cancelDownload',
  };

  await chrome.tabs.sendMessage(activeTabId, message);
  // Button state reset is handled by updateProgress when 'cancelled' status arrives
}

/**
 * Renders the ticker input section above the table list
 */
function renderTickerSection(ticker: string): void {
  // Remove existing ticker section if any
  const existingSection = document.getElementById('ticker-section');
  if (existingSection) {
    existingSection.remove();
  }

  const content = document.getElementById('content');
  if (!content) return;

  const section = document.createElement('div');
  section.id = 'ticker-section';
  section.className = 'ticker-section';
  section.innerHTML = `
    <span class="ticker-label">Ticker:</span>
    <input
      type="text"
      id="ticker-input"
      class="ticker-input"
      value="${ticker}"
      placeholder="e.g., AAPL"
      maxlength="10"
      autocomplete="off"
      spellcheck="false"
    >
  `;

  // Insert before content
  content.parentNode?.insertBefore(section, content);

  // Attach input listener
  const input = document.getElementById('ticker-input') as HTMLInputElement;
  input?.addEventListener('input', handleTickerInput);
}

/**
 * Handles ticker input changes
 */
function handleTickerInput(e: Event): void {
  const input = e.target as HTMLInputElement;
  const value = input.value.toUpperCase();

  // Update input value to uppercase
  input.value = value;

  // Update state
  currentTicker = value;

  // Validate and update UI
  const valid = isValidTicker(value);
  input.classList.toggle('invalid', value.length > 0 && !valid);

  // Enable/disable all download buttons based on ticker validity
  updateDownloadButtons();
}

/**
 * Updates download button states based on ticker validity
 */
function updateDownloadButtons(): void {
  const buttons = document.querySelectorAll('.download-btn');
  const valid = isValidTicker(currentTicker);

  for (const btn of buttons) {
    const button = btn as HTMLButtonElement;
    // Don't interfere with buttons in downloading state
    if (!button.classList.contains('downloading')) {
      button.disabled = !valid;
      button.classList.toggle('ticker-required', !valid);
    }
  }
}

/**
 * Removes the ticker section from DOM
 */
function removeTickerSection(): void {
  const tickerSection = document.getElementById('ticker-section');
  if (tickerSection) {
    tickerSection.remove();
  }
}

/**
 * Renders the list of tables
 */
function renderTables(tables: TablesResponse['tables']): void {
  log.debug('renderTables() called', { tableCount: tables.length });
  const content = document.getElementById('content');
  if (!content) return;

  if (tables.length === 0) {
    // Remove ticker section if no tables
    removeTickerSection();
    content.innerHTML = `
      <div class="status empty">
        No price or dividend tables found on this page.
      </div>
    `;
    return;
  }

  const tableListHTML = tables
    .map((table) => {
      const typeLabel = table.type === 'price' ? 'Price' : 'Dividend';
      return `
    <div class="table-item" data-type="${table.type}">
      <div class="table-info">
        <div class="table-header">
          <span class="table-name">Table ${table.index + 1}</span>
          <span class="table-type-badge ${table.type}">${typeLabel}</span>
        </div>
        <div class="table-meta">${table.rows} rows × ${table.columns} cols</div>
      </div>
      <button class="download-btn" id="download-${table.index}" data-index="${table.index}" data-type="${table.type}">
        <div class="progress-fill"></div>
        <span class="btn-text">Download</span>
      </button>
    </div>
  `;
    })
    .join('');

  content.innerHTML = `
    <div class="table-list">
      ${tableListHTML}
    </div>
  `;

  // Attach click handlers to download buttons
  for (const button of Array.from(content.querySelectorAll('.download-btn'))) {
    button.addEventListener('click', (e) => {
      const btn = button as HTMLButtonElement;
      const index = Number.parseInt(btn.dataset.index || '0');

      // Check if we're in downloading state (cancel action)
      if (btn.classList.contains('downloading')) {
        // Only cancel if clicking on the cancel text
        const target = e.target as HTMLElement;
        if (target.classList.contains('cancel-action')) {
          cancelDownload();
        }
        return;
      }

      startFullDownload(index);
    });
  }

  // Update button states based on ticker validity
  updateDownloadButtons();
}

/**
 * Shows an error message
 */
function showError(message: string): void {
  const content = document.getElementById('content');
  if (!content) return;
  content.innerHTML = `<div class="status error">${message}</div>`;
}

/**
 * Fetches tables from the active tab's content script
 */
async function fetchTables(): Promise<void> {
  log.debug('fetchTables() started');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    log.debug('Active tab', { tabId: tab?.id, url: tab?.url });

    if (!tab?.id) {
      log.error('No tab ID found');
      showError('Unable to access current tab.');
      return;
    }

    activeTabId = tab.id;

    log.debug('Sending getTables message', { tabId: tab.id });
    const message: GetTablesMessage = { action: 'getTables' };
    const response = (await chrome.tabs.sendMessage(tab.id, message)) as TablesResponse;
    log.debug('Received response', {
      tableCount: response.tables.length,
      ticker: response.ticker,
      tickerSource: response.tickerSource,
    });

    // Only show ticker section if tables were found
    if (response.tables.length > 0) {
      currentTicker = response.ticker;
      renderTickerSection(response.ticker);
    }

    renderTables(response.tables);
  } catch (err) {
    log.error('Error fetching tables', err);
    showError('No supported tables found.');
  }
}

/**
 * Listen for progress updates from content script
 */
chrome.runtime.onMessage.addListener((message: ProgressUpdate) => {
  if (message.action === 'downloadProgress') {
    log.debug('Received progress update', { progress: message.progress, status: message.status });

    if (currentDownloadIndex !== null) {
      updateProgress(currentDownloadIndex, message.progress, message.rowsCollected, message.status);

      if (message.status === 'complete' && message.csvData) {
        // Get the table type from the download button's data attribute
        const downloadBtn = document.getElementById(
          `download-${currentDownloadIndex}`
        ) as HTMLButtonElement;
        const tableType: TableType = (downloadBtn?.dataset.type as TableType) || 'price';
        downloadCSV(message.csvData, tableType, currentTicker);
        currentDownloadIndex = null;
      } else if (message.status === 'error') {
        showError(message.error || 'An error occurred during download');
        currentDownloadIndex = null;
      } else if (message.status === 'cancelled') {
        currentDownloadIndex = null;
      }
    }
  }
});

// Initialize popup
fetchTables();
