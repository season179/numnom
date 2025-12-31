/**
 * Named constants for NumNom Chrome extension
 * Replaces magic numbers with descriptive names
 */

// === Scroll Configuration ===

// Percentage of viewport to scroll per iteration (0.8 = 80%)
export const SCROLL_VIEWPORT_RATIO = 0.8;

// Milliseconds to wait after each scroll for content to load
export const SCROLL_DELAY_MS = 300;

// Milliseconds to wait for final content after reaching bottom
export const FINAL_CONTENT_DELAY_MS = 500;

// Progress cap during scrolling (reaches 100 only on complete)
export const SCROLL_PROGRESS_CAP = 95;

// Pixel threshold for detecting scroll bottom
export const BOTTOM_THRESHOLD_PX = 10;

// === Scroll Safety Limits ===

// Maximum scroll attempts before giving up
export const MAX_SCROLL_ATTEMPTS = 200;

// Number of consecutive attempts with no new rows before stopping
export const MAX_NO_NEW_ROWS_ATTEMPTS = 5;

// === UI Timing ===

// Milliseconds to show error/cancelled state before button reset
export const BUTTON_RESET_DELAY_MS = 2000;

// Milliseconds to wait for document.body in observer setup
export const OBSERVER_RETRY_DELAY_MS = 100;

// === Badge Colors ===

// Badge background color when tables are found
export const BADGE_COLOR_TABLES_FOUND = '#00AA00';
