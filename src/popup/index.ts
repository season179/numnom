/**
 * Popup script that displays detected tables and allows CSV download
 */

console.log('Popup: Script loaded!');

interface GetTablesMessage {
  action: 'getTables';
}

interface StartFullDownloadMessage {
  action: 'startFullDownload';
  tableIndex: number;
}

interface CancelDownloadMessage {
  action: 'cancelDownload';
}

interface ProgressUpdate {
  action: 'downloadProgress';
  progress: number;
  rowsCollected: number;
  status: 'scrolling' | 'complete' | 'error' | 'cancelled';
  csvData?: string;
  error?: string;
}

interface TablesResponse {
  tables: Array<{
    index: number;
    rows: number;
    columns: number;
    csvData: string;
  }>;
}

// State for tracking full downloads
let currentDownloadIndex: number | null = null;
let activeTabId: number | null = null;

/**
 * Triggers a download of the CSV file
 */
function downloadCSV(csvData: string, index: number, isFull = false): void {
  const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `table_${index + 1}${isFull ? '_full' : ''}_${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Updates progress UI for a specific table
 */
function updateProgress(
  index: number,
  progress: number,
  rowsCollected: number,
  status: string
): void {
  const progressBar = document.getElementById(`progress-${index}`);
  const progressText = document.getElementById(`progress-text-${index}`);
  const cancelBtn = document.getElementById(`cancel-${index}`) as HTMLButtonElement;

  if (progressBar && progressText) {
    progressBar.style.display = 'block';
    const fill = progressBar.querySelector('.progress-fill') as HTMLElement;
    if (fill) {
      fill.style.width = `${progress}%`;
    }

    if (status === 'scrolling') {
      progressText.textContent = `Scrolling... ${progress}% (${rowsCollected} rows)`;
    } else if (status === 'complete') {
      progressText.textContent = `Complete! ${rowsCollected} rows collected`;
      progressBar.style.display = 'none';
      if (cancelBtn) cancelBtn.style.display = 'none';
    } else if (status === 'error') {
      progressText.textContent = 'Error occurred';
      progressBar.style.display = 'none';
      if (cancelBtn) cancelBtn.style.display = 'none';
    } else if (status === 'cancelled') {
      progressText.textContent = 'Cancelled';
      progressBar.style.display = 'none';
      if (cancelBtn) cancelBtn.style.display = 'none';
    }
  }
}

/**
 * Starts full download with scrolling
 */
async function startFullDownload(index: number): Promise<void> {
  if (!activeTabId) return;

  currentDownloadIndex = index;

  // Show progress UI
  const fullBtn = document.getElementById(`full-${index}`) as HTMLButtonElement;
  const cancelBtn = document.getElementById(`cancel-${index}`) as HTMLButtonElement;

  if (fullBtn) fullBtn.disabled = true;
  if (cancelBtn) cancelBtn.style.display = 'inline-block';

  updateProgress(index, 0, 0, 'scrolling');

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

  const fullBtn = document.getElementById(`full-${currentDownloadIndex}`) as HTMLButtonElement;
  if (fullBtn) fullBtn.disabled = false;

  currentDownloadIndex = null;
}

/**
 * Renders the list of tables
 */
function renderTables(tables: TablesResponse['tables']): void {
  console.log('Popup: renderTables() called with', tables.length, 'tables');
  const content = document.getElementById('content');
  if (!content) return;

  if (tables.length === 0) {
    content.innerHTML = `
      <div class="status empty">
        No tables with "open" and "close" columns found on this page.
      </div>
    `;
    return;
  }

  const tableListHTML = tables
    .map(
      (table) => `
    <div class="table-item">
      <div class="table-info">
        <div class="table-header">Table ${table.index + 1} (${table.rows} rows × ${table.columns} cols)</div>
        <div class="progress-container" id="progress-${table.index}" style="display: none;">
          <div class="progress-bar">
            <div class="progress-fill"></div>
          </div>
        </div>
        <div class="progress-text" id="progress-text-${table.index}"></div>
      </div>
      <div class="button-group">
        <button class="btn-quick" data-index="${table.index}">Quick CSV</button>
        <button class="btn-full" id="full-${table.index}" data-index="${table.index}">Full CSV</button>
        <button class="btn-cancel" id="cancel-${table.index}" data-index="${table.index}" style="display: none;">Cancel</button>
      </div>
    </div>
  `
    )
    .join('');

  content.innerHTML = `
    <div class="table-list">
      ${tableListHTML}
    </div>
  `;

  // Attach click handlers to quick download buttons
  for (const button of Array.from(content.querySelectorAll('button.btn-quick'))) {
    button.addEventListener('click', () => {
      const index = Number.parseInt((button as HTMLButtonElement).dataset.index || '0');
      const table = tables[index];
      if (table) {
        downloadCSV(table.csvData, index, false);
      }
    });
  }

  // Attach click handlers to full download buttons
  for (const button of Array.from(content.querySelectorAll('button.btn-full'))) {
    button.addEventListener('click', () => {
      const index = Number.parseInt((button as HTMLButtonElement).dataset.index || '0');
      startFullDownload(index);
    });
  }

  // Attach click handlers to cancel buttons
  for (const button of Array.from(content.querySelectorAll('button.btn-cancel'))) {
    button.addEventListener('click', () => {
      cancelDownload();
    });
  }
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
  console.log('Popup: fetchTables() started');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('Popup: Active tab:', tab);

    if (!tab?.id) {
      console.error('Popup: No tab ID found');
      showError('Unable to access current tab.');
      return;
    }

    activeTabId = tab.id;

    console.log('Popup: Sending getTables message to tab', tab.id);
    const message: GetTablesMessage = { action: 'getTables' };
    const response = (await chrome.tabs.sendMessage(tab.id, message)) as TablesResponse;
    console.log('Popup: Received response:', response);

    renderTables(response.tables);
  } catch (err) {
    console.error('Popup: Error fetching tables:', err);
    showError(
      'Failed to load tables. Make sure you refresh the page after installing the extension.'
    );
  }
}

/**
 * Listen for progress updates from content script
 */
chrome.runtime.onMessage.addListener((message: ProgressUpdate) => {
  if (message.action === 'downloadProgress') {
    console.log('Popup: Received progress update:', message);

    if (currentDownloadIndex !== null) {
      updateProgress(currentDownloadIndex, message.progress, message.rowsCollected, message.status);

      if (message.status === 'complete' && message.csvData) {
        downloadCSV(message.csvData, currentDownloadIndex, true);
        const fullBtn = document.getElementById(
          `full-${currentDownloadIndex}`
        ) as HTMLButtonElement;
        if (fullBtn) fullBtn.disabled = false;
        currentDownloadIndex = null;
      } else if (message.status === 'error') {
        showError(message.error || 'An error occurred during download');
        const fullBtn = document.getElementById(
          `full-${currentDownloadIndex}`
        ) as HTMLButtonElement;
        if (fullBtn) fullBtn.disabled = false;
        currentDownloadIndex = null;
      } else if (message.status === 'cancelled') {
        const fullBtn = document.getElementById(
          `full-${currentDownloadIndex}`
        ) as HTMLButtonElement;
        if (fullBtn) fullBtn.disabled = false;
        currentDownloadIndex = null;
      }
    }
  }
});

// Initialize popup
fetchTables();
