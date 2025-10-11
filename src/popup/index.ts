/**
 * Popup script that displays detected tables and allows CSV download
 */

console.log('Popup: Script loaded!');

interface GetTablesMessage {
  action: 'getTables';
}

interface TablesResponse {
  tables: Array<{
    index: number;
    rows: number;
    columns: number;
    csvData: string;
  }>;
}

/**
 * Triggers a download of the CSV file
 */
function downloadCSV(csvData: string, index: number): void {
  const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `table_${index + 1}_${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
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
        Table ${table.index + 1} (${table.rows} rows × ${table.columns} cols)
      </div>
      <button data-index="${table.index}">Download CSV</button>
    </div>
  `
    )
    .join('');

  content.innerHTML = `
    <div class="table-list">
      ${tableListHTML}
    </div>
  `;

  // Attach click handlers to download buttons
  for (const button of Array.from(content.querySelectorAll('button[data-index]'))) {
    button.addEventListener('click', () => {
      const index = Number.parseInt((button as HTMLButtonElement).dataset.index || '0');
      const table = tables[index];
      if (table) {
        downloadCSV(table.csvData, index);
      }
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

// Initialize popup
fetchTables();
