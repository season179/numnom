/**
 * Shared type definitions for NumNom Chrome extension
 * Single source of truth for all message interfaces
 */

// Table types detected by the extension
export type TableType = 'price' | 'dividend';

// Download status values
export type DownloadStatus = 'scrolling' | 'complete' | 'error' | 'cancelled';

// Message from content script to background (badge updates)
export interface TableCountMessage {
  action: 'updateBadge';
  tableCount: number;
}

// Message from popup to content script (request table data)
export interface GetTablesMessage {
  action: 'getTables';
}

// Message from popup to content script (start download)
export interface StartFullDownloadMessage {
  action: 'startFullDownload';
  tableIndex: number;
}

// Message from popup to content script (cancel download)
export interface CancelDownloadMessage {
  action: 'cancelDownload';
}

// Message from content script to popup (progress updates)
export interface ProgressUpdate {
  action: 'downloadProgress';
  progress: number; // 0-100
  rowsCollected: number;
  status: DownloadStatus;
  csvData?: string;
  error?: string;
}

// Individual table info
export interface TableInfo {
  index: number;
  rows: number;
  columns: number;
  csvData: string;
  type: TableType;
}

// Response from content script to popup (table data)
export interface TablesResponse {
  tables: TableInfo[];
  ticker: string;
}

// Union type for messages content script receives
export type ContentScriptMessage =
  | GetTablesMessage
  | StartFullDownloadMessage
  | CancelDownloadMessage;
