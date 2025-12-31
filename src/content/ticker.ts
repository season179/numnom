/**
 * Ticker extraction module for NumNom Chrome extension
 * Multi-signal extraction with priority: JSON-LD > Meta tags > URL patterns
 */

import { createLogger } from '../shared/logger';
import type { TickerSource } from '../shared/types';

const log = createLogger('ticker');

export interface TickerResult {
  ticker: string;
  source: TickerSource;
}

// Ticker validation regex: 1-10 alphanumeric chars with optional dots/hyphens
// Supports: AAPL, BRK.B, BF-A, GOOGL, etc.
const TICKER_REGEX = /^[A-Z0-9][A-Z0-9.\-]{0,9}$/i;

function isValidTicker(ticker: string): boolean {
  return TICKER_REGEX.test(ticker);
}

/**
 * Normalizes ticker by removing exchange prefix and uppercasing.
 * NYSE:AAPL → AAPL, nasdaq:msft → MSFT
 */
function normalizeTicker(raw: string): string {
  const parts = raw.split(':');
  const ticker = parts[parts.length - 1] || '';
  return ticker.trim().toUpperCase();
}

/**
 * Signal 1: Extract ticker from JSON-LD structured data
 * Looks for schema.org Stock, FinancialProduct, or Organization with tickerSymbol
 */
function extractFromJsonLd(): string | null {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');

  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent || '');
      const items = Array.isArray(data) ? data : [data];

      for (const item of items) {
        // Check for Stock/FinancialProduct schema
        if (item['@type'] === 'Stock' || item['@type'] === 'FinancialProduct') {
          const symbol = item.tickerSymbol || item.symbol || item.name;
          if (symbol) {
            const normalized = normalizeTicker(String(symbol));
            if (isValidTicker(normalized)) {
              log.debug('Found ticker in JSON-LD', { symbol, type: item['@type'] });
              return normalized;
            }
          }
        }

        // Check for Organization with tickerSymbol
        if (item['@type'] === 'Organization' && item.tickerSymbol) {
          const normalized = normalizeTicker(String(item.tickerSymbol));
          if (isValidTicker(normalized)) {
            log.debug('Found ticker in JSON-LD Organization', { symbol: item.tickerSymbol });
            return normalized;
          }
        }
      }
    } catch {
      // Skip invalid JSON
    }
  }

  return null;
}

/**
 * Signal 2: Extract ticker from meta tags
 * Looks for patterns in og:title and twitter:title
 */
function extractFromMetaTags(): { ticker: string; source: 'meta-og' | 'meta-twitter' } | null {
  const metaSelectors: Array<{ selector: string; source: 'meta-og' | 'meta-twitter' }> = [
    { selector: 'meta[property="og:title"]', source: 'meta-og' },
    { selector: 'meta[name="twitter:title"]', source: 'meta-twitter' },
  ];

  // Patterns to extract ticker from title-like content
  // Matches: "(AAPL)", "AAPL Stock...", "...Stock AAPL", "AAPL -", "- AAPL"
  const tickerPatterns = [
    /\(([A-Z0-9][A-Z0-9.\-]{0,9})\)/, // (AAPL)
    /^([A-Z0-9][A-Z0-9.\-]{0,9})\s+[-|:]?\s*\w/i, // "AAPL - Company" or "AAPL Stock"
    /\s[-|:]\s*([A-Z0-9][A-Z0-9.\-]{0,9})$/i, // "Company - AAPL"
  ];

  for (const { selector, source } of metaSelectors) {
    const meta = document.querySelector(selector);
    const content = meta?.getAttribute('content') || '';

    for (const pattern of tickerPatterns) {
      const match = content.match(pattern);
      if (match?.[1] && isValidTicker(match[1].toUpperCase())) {
        log.debug('Found ticker in meta tag', { selector, ticker: match[1] });
        return { ticker: match[1].toUpperCase(), source };
      }
    }
  }

  return null;
}

/**
 * Signal 3: Extract ticker from URL patterns
 * Generic patterns that work across financial sites
 */
function extractFromUrl(): string | null {
  const url = window.location.href;

  // Generic URL patterns (not site-specific)
  const patterns = [
    // /symbol/AAPL or /symbols/AAPL
    /\/symbols?\/([A-Z0-9][A-Z0-9.\-]{0,9})(?:\/|$|\?)/i,
    // /stock/AAPL or /stocks/AAPL
    /\/stocks?\/([A-Z0-9][A-Z0-9.\-]{0,9})(?:\/|$|\?)/i,
    // /quote/AAPL or /quotes/AAPL
    /\/quotes?\/([A-Z0-9][A-Z0-9.\-]{0,9})(?:\/|$|\?)/i,
    // /ticker/AAPL
    /\/ticker\/([A-Z0-9][A-Z0-9.\-]{0,9})(?:\/|$|\?)/i,
    // ?symbol=AAPL or ?ticker=AAPL
    /[?&](?:symbol|ticker)=([A-Z0-9][A-Z0-9.\-]{0,9})(?:&|$)/i,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      const ticker = normalizeTicker(match[1]);
      if (isValidTicker(ticker)) {
        log.debug('Found ticker in URL', { pattern: pattern.source, ticker });
        return ticker;
      }
    }
  }

  return null;
}

/**
 * Extracts stock ticker using multi-signal approach
 * Priority: JSON-LD > Meta tags > URL patterns > empty string
 */
export function extractStockTicker(): TickerResult {
  // Signal 1: JSON-LD structured data
  const jsonLdTicker = extractFromJsonLd();
  if (jsonLdTicker) {
    return { ticker: jsonLdTicker, source: 'json-ld' };
  }

  // Signal 2: Meta tags (og:title, twitter:title)
  const metaResult = extractFromMetaTags();
  if (metaResult) {
    return { ticker: metaResult.ticker, source: metaResult.source };
  }

  // Signal 3: URL patterns
  const urlTicker = extractFromUrl();
  if (urlTicker) {
    return { ticker: urlTicker, source: 'url-pattern' };
  }

  // Fallback: empty string (user must input manually)
  log.debug('No ticker found, returning empty');
  return { ticker: '', source: 'none' };
}
