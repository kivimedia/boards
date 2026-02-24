#!/usr/bin/env node

/**
 * Performance Keeping Sheet Crawler & PRD Generator
 * Crawls Kivi Media's Google Sheets ecosystem and produces a comprehensive PRD.
 * Uses raw Sheets API for Smart Chip / Rich Link detection.
 *
 * Usage: node scripts/crawl-performance-sheets.js [masterlist-url]
 */

import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// ─── SAFEGUARDS ───────────────────────────────────────────────
const SAFEGUARDS = {
  MAX_SHEETS_TOTAL: 50,
  MAX_TABS_PER_SHEET: 30,
  MAX_ROWS_PER_TAB: 2000,
  MAX_COLS_PER_TAB: 100,
  MAX_LINKS_PER_SHEET: 30,
  MAX_CRAWL_DEPTH: 3,
  MAX_RETRIES_PER_SHEET: 2,
  MAX_TOTAL_RUNTIME_MS: 10 * 60 * 1000,
  VISITED_SHEET_IDS: new Set(),
};

const globalStartTime = Date.now();

// ─── STATUS LOGGER ────────────────────────────────────────────
class StatusLogger {
  constructor() {
    this.currentAction = 'Initializing...';
    this.stats = {
      sheetsVisited: 0,
      tabsRead: 0,
      rowsProcessed: 0,
      linksFound: 0,
      linksFollowed: 0,
      errors: 0,
      skipped: 0,
      accessDenied: [],
      brokenLinks: [],
      startTime: Date.now(),
    };
    this.interval = setInterval(() => this.printStatus(), 1500);
  }

  printStatus() {
    const elapsed = ((Date.now() - this.stats.startTime) / 1000).toFixed(1);
    console.log(
      `[${elapsed}s] ` +
      `Sheets: ${this.stats.sheetsVisited}/${SAFEGUARDS.MAX_SHEETS_TOTAL} | ` +
      `Tabs: ${this.stats.tabsRead} | ` +
      `Rows: ${this.stats.rowsProcessed} | ` +
      `Links: ${this.stats.linksFound} found, ${this.stats.linksFollowed} followed | ` +
      `Errors: ${this.stats.errors} | ` +
      `${this.currentAction}`
    );
  }

  update(action, statUpdates = {}) {
    this.currentAction = action;
    Object.assign(this.stats, statUpdates);
  }

  stop() {
    clearInterval(this.interval);
    this.printStatus();
    const elapsed = ((Date.now() - this.stats.startTime) / 1000).toFixed(1);
    console.log(`\nCrawl complete.`);
    console.log(`   Total time: ${elapsed}s`);
    console.log(`   Sheets crawled: ${this.stats.sheetsVisited}`);
    console.log(`   Tabs read: ${this.stats.tabsRead}`);
    console.log(`   Total rows: ${this.stats.rowsProcessed.toLocaleString()}`);
    console.log(`   Links found: ${this.stats.linksFound} (${this.stats.linksFollowed} followed, ${this.stats.skipped} skipped)`);
    console.log(`   Errors: ${this.stats.errors}`);
    if (this.stats.accessDenied.length > 0) {
      console.log(`   Access denied: ${this.stats.accessDenied.length} sheets`);
      this.stats.accessDenied.forEach(u => console.log(`     - ${u}`));
    }
  }
}

// ─── HELPERS ──────────────────────────────────────────────────
function extractSheetId(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

function findSheetLinks(cellValue) {
  if (!cellValue || typeof cellValue !== 'string') return [];
  const regex = /https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+[^\s)"]*/g;
  return cellValue.match(regex) || [];
}

function isTimedOut() {
  return Date.now() - globalStartTime > SAFEGUARDS.MAX_TOTAL_RUNTIME_MS;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── AUTH ─────────────────────────────────────────────────────
function getAuth() {
  const credPath = path.join(ROOT, 'google-credentials.json');
  if (!fs.existsSync(credPath)) {
    throw new Error(`Missing ${credPath}. See AGENT-performance-keeping-crawler.md for setup.`);
  }
  const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  return new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// ─── RAW API: Extract links from Smart Chips ──────────────────
async function extractLinksViaRawAPI(sheetId, tabTitle, auth, maxRows = 200) {
  const token = await auth.getAccessToken();
  const range = encodeURIComponent(`'${tabTitle}'!A1:AZ${maxRows}`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?ranges=${range}&includeGridData=true&fields=sheets.data.rowData.values(formattedValue,hyperlink,userEnteredValue,chipRuns)`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token.token}` },
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Raw API error ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const rowData = data.sheets?.[0]?.data?.[0]?.rowData || [];

  const links = [];
  const allRows = [];
  let headers = [];

  for (let r = 0; r < rowData.length; r++) {
    const values = rowData[r].values || [];
    const rowObj = {};

    for (let c = 0; c < values.length; c++) {
      const cell = values[c];
      const displayValue = cell.formattedValue || '';

      // Capture headers from row 0
      if (r === 0 && displayValue) {
        headers[c] = displayValue;
      }

      if (r > 0) {
        const colName = headers[c] || `col_${c}`;
        rowObj[colName] = displayValue;
      }

      // Check for Smart Chips (richLinkProperties)
      if (cell.chipRuns) {
        for (const chip of cell.chipRuns) {
          const uri = chip.chip?.richLinkProperties?.uri;
          if (uri && uri.includes('docs.google.com/spreadsheets')) {
            links.push({
              url: uri,
              sheetId: extractSheetId(uri),
              sourceTab: tabTitle,
              sourceRow: r + 1,
              sourceColumn: headers[c] || `col_${c}`,
              label: displayValue,
              linkType: 'smartChip',
            });
          }
        }
      }

      // Check for regular hyperlinks
      if (cell.hyperlink && cell.hyperlink.includes('docs.google.com/spreadsheets')) {
        links.push({
          url: cell.hyperlink,
          sheetId: extractSheetId(cell.hyperlink),
          sourceTab: tabTitle,
          sourceRow: r + 1,
          sourceColumn: headers[c] || `col_${c}`,
          label: displayValue,
          linkType: 'hyperlink',
        });
      }

      // Check cell value for plain-text URLs
      const plainLinks = findSheetLinks(displayValue);
      for (const pl of plainLinks) {
        if (!links.some(l => l.url === pl)) {
          links.push({
            url: pl,
            sheetId: extractSheetId(pl),
            sourceTab: tabTitle,
            sourceRow: r + 1,
            sourceColumn: headers[c] || `col_${c}`,
            label: displayValue,
            linkType: 'plainText',
          });
        }
      }

      // Check userEnteredValue for HYPERLINK formula
      const uev = cell.userEnteredValue;
      if (uev?.formulaValue) {
        const match = uev.formulaValue.match(/HYPERLINK\s*\(\s*"([^"]+)"/i);
        if (match && match[1].includes('docs.google.com/spreadsheets')) {
          links.push({
            url: match[1],
            sheetId: extractSheetId(match[1]),
            sourceTab: tabTitle,
            sourceRow: r + 1,
            sourceColumn: headers[c] || `col_${c}`,
            label: displayValue,
            linkType: 'formula',
          });
        }
      }
    }

    if (r > 0 && Object.values(rowObj).some(v => v)) {
      allRows.push(rowObj);
    }
  }

  return { headers, rows: allRows, links };
}

// ─── CRAWL A SINGLE SHEET ─────────────────────────────────────
async function crawlSheet(url, auth, status, depth = 0, parentContext = null) {
  const sheetId = extractSheetId(url);
  if (!sheetId) {
    status.update(`Invalid URL: ${url}`);
    status.stats.errors++;
    return null;
  }

  // Guards
  if (depth > SAFEGUARDS.MAX_CRAWL_DEPTH) {
    status.update(`DEPTH LIMIT: Skipping ${sheetId} (depth ${depth})`);
    status.stats.skipped++;
    return null;
  }
  if (SAFEGUARDS.VISITED_SHEET_IDS.has(sheetId)) {
    status.update(`SKIP: Already crawled ${sheetId}`);
    status.stats.skipped++;
    return null;
  }
  if (SAFEGUARDS.VISITED_SHEET_IDS.size >= SAFEGUARDS.MAX_SHEETS_TOTAL) {
    status.update(`TOTAL LIMIT: Reached max ${SAFEGUARDS.MAX_SHEETS_TOTAL} sheets.`);
    return null;
  }
  if (isTimedOut()) {
    status.update(`TIME LIMIT: Runtime exceeded. Stopping.`);
    return null;
  }

  SAFEGUARDS.VISITED_SHEET_IDS.add(sheetId);

  let retries = 0;
  while (retries <= SAFEGUARDS.MAX_RETRIES_PER_SHEET) {
    try {
      status.update(`Opening sheet ${sheetId} [depth=${depth}]...`);
      const doc = new GoogleSpreadsheet(sheetId, auth);
      await doc.loadInfo();

      const sheetResult = {
        spreadsheetId: sheetId,
        url: url,
        title: doc.title,
        depth: depth,
        parentContext: parentContext,
        tabCount: doc.sheetCount,
        tabs: [],
        linksFound: [],
        crawledAt: new Date().toISOString(),
      };

      status.stats.sheetsVisited++;
      status.update(`Reading "${doc.title}" (${doc.sheetCount} tabs) [depth=${depth}]`);

      const tabLimit = Math.min(doc.sheetCount, SAFEGUARDS.MAX_TABS_PER_SHEET);

      for (let t = 0; t < tabLimit; t++) {
        if (isTimedOut()) break;

        const sheet = doc.sheetsByIndex[t];
        status.update(`Tab "${sheet.title}" in "${doc.title}" [${t + 1}/${tabLimit}]`);

        const tabResult = {
          tabName: sheet.title,
          tabIndex: t,
          rowCount: sheet.rowCount,
          columnCount: sheet.columnCount,
          headers: [],
          sampleRows: [],
          formulas: [],
          links: [],
        };

        try {
          // Use raw API to get cell data + smart chip links
          const maxRowsToScan = Math.min(sheet.rowCount, SAFEGUARDS.MAX_ROWS_PER_TAB);
          const rawData = await extractLinksViaRawAPI(sheetId, sheet.title, auth, maxRowsToScan);

          tabResult.headers = rawData.headers.filter(Boolean);
          tabResult.sampleRows = rawData.rows.slice(0, 5);
          tabResult.links = rawData.links;
          status.stats.rowsProcessed += rawData.rows.length;

          // Dedup and add links
          for (const link of rawData.links) {
            if (!sheetResult.linksFound.some(l => l.sheetId === link.sheetId)) {
              sheetResult.linksFound.push(link);
              status.stats.linksFound++;
            }
          }

          // Also try getRows for additional data if headers were found
          if (tabResult.headers.length > 0) {
            try {
              const rows = await sheet.getRows({ limit: Math.min(sheet.rowCount, SAFEGUARDS.MAX_ROWS_PER_TAB) });
              // If raw API didn't get enough rows, supplement with getRows
              if (rows.length > rawData.rows.length) {
                const existingSample = tabResult.sampleRows.length;
                for (let r = existingSample; r < Math.min(rows.length, 5); r++) {
                  const rowData = {};
                  for (const h of tabResult.headers) {
                    rowData[h] = rows[r]?.get(h) || '';
                  }
                  tabResult.sampleRows.push(rowData);
                }
                // Check for plain-text links in all rows
                let rowCounter = 0;
                for (const row of rows) {
                  rowCounter++;
                  for (const h of tabResult.headers) {
                    const val = row.get(h);
                    const links = findSheetLinks(val);
                    for (const link of links) {
                      if (!tabResult.links.some(l => l.url === link)) {
                        const linkObj = {
                          url: link,
                          sheetId: extractSheetId(link),
                          sourceTab: sheet.title,
                          sourceRow: rowCounter,
                          sourceColumn: h,
                          label: val,
                          linkType: 'plainText',
                        };
                        tabResult.links.push(linkObj);
                        if (!sheetResult.linksFound.some(l => l.sheetId === linkObj.sheetId)) {
                          sheetResult.linksFound.push(linkObj);
                          status.stats.linksFound++;
                        }
                      }
                    }
                  }
                }
                // Update row count to actual
                tabResult.actualRowCount = rows.length;
              }
            } catch (getRowsErr) {
              // getRows can fail on headerless sheets, that's fine
            }
          }

        } catch (tabErr) {
          tabResult.error = tabErr.message;
          status.stats.errors++;
          status.update(`Error reading tab "${sheet.title}": ${tabErr.message.substring(0, 80)}`);
        }

        status.stats.tabsRead++;
        sheetResult.tabs.push(tabResult);
      }

      return sheetResult;

    } catch (err) {
      retries++;
      const msg = err.message || String(err);
      if (msg.includes('403') || msg.includes('not found') || msg.includes('permission') || msg.includes('PERMISSION_DENIED') || msg.includes('does not have')) {
        status.update(`ACCESS DENIED: ${sheetId} - ${msg.substring(0, 80)}`);
        status.stats.accessDenied.push(url);
        status.stats.errors++;
        return {
          spreadsheetId: sheetId,
          url: url,
          depth: depth,
          parentContext: parentContext,
          error: 'ACCESS_DENIED',
          errorMessage: msg,
        };
      }
      if (retries > SAFEGUARDS.MAX_RETRIES_PER_SHEET) {
        status.update(`FAILED after ${retries} retries: ${sheetId} - ${msg.substring(0, 80)}`);
        status.stats.errors++;
        return {
          spreadsheetId: sheetId,
          url: url,
          depth: depth,
          parentContext: parentContext,
          error: 'CRAWL_FAILED',
          errorMessage: msg,
        };
      }
      status.update(`Retry ${retries}/${SAFEGUARDS.MAX_RETRIES_PER_SHEET} for ${sheetId}: ${msg.substring(0, 60)}`);
      await sleep(2000 * retries);
    }
  }
}

// ─── MAIN CRAWL ORCHESTRATOR ──────────────────────────────────
async function main() {
  const masterlistUrl = process.argv[2] || 'https://docs.google.com/spreadsheets/d/1XPr4nraaXWOv4ubZCwyPLSvbr2LvawU0HT2AvPj8Bjk/edit';

  console.log(`\nPerformance Keeping Sheet Crawler`);
  console.log(`   Masterlist: ${masterlistUrl}`);
  console.log(`   Max depth: ${SAFEGUARDS.MAX_CRAWL_DEPTH}`);
  console.log(`   Max sheets: ${SAFEGUARDS.MAX_SHEETS_TOTAL}`);
  console.log(`   Max runtime: ${SAFEGUARDS.MAX_TOTAL_RUNTIME_MS / 1000}s\n`);

  const status = new StatusLogger();
  const auth = getAuth();
  const allResults = [];

  // ── STAGE 1: MASTERLIST ───────────────────────────────────
  status.update('Authenticating with Google...');

  console.log('\n===  STAGE 1: DISCOVERY MAP (Masterlist only)  ===\n');

  const masterResult = await crawlSheet(masterlistUrl, auth, status, 0, null);
  if (!masterResult || masterResult.error) {
    status.stop();
    console.error('Failed to read Masterlist. Cannot continue.');
    if (masterResult) console.error('Error:', masterResult.errorMessage);
    process.exit(1);
  }

  allResults.push(masterResult);

  // Collect all unique links from masterlist
  const depth1Links = [];
  const seenIds = new Set();
  for (const link of masterResult.linksFound) {
    if (link.sheetId && !seenIds.has(link.sheetId) && link.sheetId !== extractSheetId(masterlistUrl)) {
      seenIds.add(link.sheetId);
      depth1Links.push(link);
    }
  }

  console.log(`\n>> Masterlist: "${masterResult.title}" - ${masterResult.tabCount} tabs`);
  console.log(`>> Found ${depth1Links.length} unique linked sheets\n`);

  // Save Stage 1 checkpoint
  const checkpoint1 = {
    masterlistTitle: masterResult.title,
    masterlistTabs: masterResult.tabs.map(t => ({
      name: t.tabName,
      headers: t.headers,
      rowCount: t.rowCount,
      actualRowCount: t.actualRowCount,
      linksFound: t.links.length,
    })),
    uniqueLinksFound: depth1Links.length,
    links: depth1Links.map(l => ({
      url: l.url,
      sheetId: l.sheetId,
      sourceTab: l.sourceTab,
      sourceRow: l.sourceRow,
      sourceColumn: l.sourceColumn,
      label: l.label,
      linkType: l.linkType,
    })),
  };

  fs.writeFileSync(
    path.join(ROOT, 'data', 'checkpoint-1-discovery-map.json'),
    JSON.stringify(checkpoint1, null, 2)
  );

  // Generate markdown checkpoint
  let cp1md = `# Checkpoint 1: Discovery Map\n\n`;
  cp1md += `**Masterlist**: ${masterResult.title}\n`;
  cp1md += `**Tabs**: ${masterResult.tabCount}\n`;
  cp1md += `**Unique linked sheets found**: ${depth1Links.length}\n\n`;

  for (const tab of masterResult.tabs) {
    cp1md += `## Tab: ${tab.tabName}\n`;
    cp1md += `- Headers (${tab.headers.length}): ${tab.headers.join(' | ')}\n`;
    cp1md += `- Rows: ~${tab.actualRowCount || tab.rowCount}\n`;
    cp1md += `- Links found: ${tab.links.length}\n`;
    if (tab.sampleRows.length > 0) {
      cp1md += `- Sample data:\n`;
      for (const row of tab.sampleRows.slice(0, 3)) {
        const entries = Object.entries(row).filter(([k, v]) => v).map(([k, v]) => `${k}: ${v}`);
        cp1md += `  - ${entries.join(' | ')}\n`;
      }
    }
    cp1md += `\n`;
  }

  cp1md += `## Linked Sheets to Crawl (${depth1Links.length})\n\n`;
  cp1md += `| # | Label | Source Tab | Source Column | Link Type | Sheet ID |\n`;
  cp1md += `|---|-------|-----------|---------------|-----------|----------|\n`;
  depth1Links.forEach((l, i) => {
    const label = (l.label || '').substring(0, 50).replace(/\|/g, '/');
    cp1md += `| ${i + 1} | ${label} | ${l.sourceTab} | ${l.sourceColumn} | ${l.linkType} | ${l.sheetId} |\n`;
  });

  fs.writeFileSync(path.join(ROOT, 'data', 'checkpoint-1-discovery-map.md'), cp1md);
  console.log('Saved: data/checkpoint-1-discovery-map.md');

  // ── STAGE 2: DEEP CRAWL (DEPTH 1) ────────────────────────
  console.log('\n===  STAGE 2: DEEP CRAWL (Linked Sheets)  ===\n');

  const depth2Links = [];

  for (let i = 0; i < Math.min(depth1Links.length, SAFEGUARDS.MAX_LINKS_PER_SHEET); i++) {
    if (isTimedOut()) {
      console.log('Time limit reached during Stage 2');
      break;
    }

    const link = depth1Links[i];
    status.update(`Link ${i + 1}/${depth1Links.length}: "${link.label || link.sheetId}"`);
    status.stats.linksFollowed++;

    const result = await crawlSheet(link.url, auth, status, 1, {
      sourceSheet: masterResult.title,
      sourceTab: link.sourceTab,
      sourceColumn: link.sourceColumn,
      sourceRow: link.sourceRow,
      label: link.label,
    });

    if (result) {
      allResults.push(result);
      console.log(`  >> [${i + 1}/${depth1Links.length}] "${result.title || 'ACCESS DENIED'}" - ${result.error || (result.tabs?.length + ' tabs')}`);

      // Collect depth-2 links
      if (result.linksFound) {
        for (const subLink of result.linksFound) {
          if (subLink.sheetId && !seenIds.has(subLink.sheetId) && !SAFEGUARDS.VISITED_SHEET_IDS.has(subLink.sheetId)) {
            seenIds.add(subLink.sheetId);
            depth2Links.push({ ...subLink, parentSheet: result.title });
          }
        }
      }
    }

    await sleep(300);
  }

  // ── STAGE 2b: DEPTH 2 CRAWL ──────────────────────────────
  if (depth2Links.length > 0) {
    console.log(`\n-- Depth 2: ${depth2Links.length} sub-linked sheets found --\n`);

    for (let i = 0; i < Math.min(depth2Links.length, SAFEGUARDS.MAX_LINKS_PER_SHEET); i++) {
      if (isTimedOut()) {
        console.log('Time limit reached during depth-2 crawl');
        break;
      }

      const link = depth2Links[i];
      status.update(`Depth 2: ${i + 1}/${depth2Links.length}: "${link.label || link.sheetId}"`);
      status.stats.linksFollowed++;

      const result = await crawlSheet(link.url, auth, status, 2, {
        sourceSheet: link.parentSheet,
        sourceTab: link.sourceTab,
        sourceColumn: link.sourceColumn,
        sourceRow: link.sourceRow,
        label: link.label,
      });

      if (result) {
        allResults.push(result);
        console.log(`  >> [D2 ${i + 1}/${depth2Links.length}] "${result.title || 'ERROR'}" - ${result.error || (result.tabs?.length + ' tabs')}`);
      }

      await sleep(300);
    }
  }

  // Save intermediate results
  fs.writeFileSync(
    path.join(ROOT, 'data', 'sheet-crawl-results.json'),
    JSON.stringify(allResults, null, 2)
  );

  // ── CHECKPOINT 2: CRAWL REPORT ────────────────────────────
  const crawlReport = {
    totalSheets: allResults.length,
    totalTabs: allResults.reduce((sum, r) => sum + (r.tabs ? r.tabs.length : 0), 0),
    totalColumns: allResults.reduce((sum, r) => {
      if (!r.tabs) return sum;
      return sum + r.tabs.reduce((ts, t) => ts + (t.headers ? t.headers.length : 0), 0);
    }, 0),
    totalLinks: status.stats.linksFound,
    totalRows: status.stats.rowsProcessed,
    accessDenied: status.stats.accessDenied,
    depth1Count: depth1Links.length,
    depth2Count: depth2Links.length,
    sheets: allResults.map(r => ({
      title: r.title || 'ACCESS DENIED',
      spreadsheetId: r.spreadsheetId,
      depth: r.depth,
      error: r.error || null,
      tabCount: r.tabs ? r.tabs.length : 0,
      tabs: r.tabs ? r.tabs.map(t => ({
        name: t.tabName,
        headers: t.headers,
        rowCount: t.actualRowCount || t.rowCount,
        linksFound: t.links ? t.links.length : 0,
        sampleRows: t.sampleRows,
      })) : [],
    })),
  };

  fs.writeFileSync(
    path.join(ROOT, 'data', 'checkpoint-2-crawl-report.json'),
    JSON.stringify(crawlReport, null, 2)
  );

  // Crawl report markdown
  let cp2md = `# Checkpoint 2: Crawl Report\n\n`;
  cp2md += `| Metric | Value |\n`;
  cp2md += `|--------|-------|\n`;
  cp2md += `| Total sheets crawled | ${crawlReport.totalSheets} |\n`;
  cp2md += `| Total tabs read | ${crawlReport.totalTabs} |\n`;
  cp2md += `| Total columns mapped | ${crawlReport.totalColumns} |\n`;
  cp2md += `| Total rows processed | ${crawlReport.totalRows} |\n`;
  cp2md += `| Total links found | ${crawlReport.totalLinks} |\n`;
  cp2md += `| Depth 1 sheets | ${crawlReport.depth1Count} |\n`;
  cp2md += `| Depth 2 sheets | ${crawlReport.depth2Count} |\n`;
  cp2md += `| Access denied | ${crawlReport.accessDenied.length} |\n\n`;

  for (const sheet of crawlReport.sheets) {
    cp2md += `## ${sheet.title || 'UNKNOWN'} (depth ${sheet.depth})\n`;
    if (sheet.error) {
      cp2md += `**ERROR**: ${sheet.error}\n\n`;
      continue;
    }
    cp2md += `- Tabs: ${sheet.tabCount}\n`;
    for (const tab of sheet.tabs) {
      cp2md += `  - **${tab.name}**: ${tab.headers.length} columns, ~${tab.rowCount} rows, ${tab.linksFound} links\n`;
      if (tab.headers.length > 0) {
        cp2md += `    - Headers: ${tab.headers.join(' | ')}\n`;
      }
    }
    cp2md += `\n`;
  }

  if (crawlReport.accessDenied.length > 0) {
    cp2md += `## Access Denied Sheets\n\n`;
    crawlReport.accessDenied.forEach(u => {
      cp2md += `- ${u}\n`;
    });
    cp2md += `\nShare these sheets with: \`sheet-crawler-agent@kivimedia-api-keys.iam.gserviceaccount.com\`\n\n`;
  }

  fs.writeFileSync(path.join(ROOT, 'data', 'checkpoint-2-crawl-report.md'), cp2md);
  console.log('\nSaved: data/checkpoint-2-crawl-report.md');

  // ── STAGE 3: AUTOMATION ANALYSIS ──────────────────────────
  console.log('\n===  STAGE 3: AUTOMATION ANALYSIS  ===\n');

  status.update('Analyzing automation opportunities...');

  const automationAnalysis = analyzeAutomation(allResults);

  fs.writeFileSync(
    path.join(ROOT, 'data', 'checkpoint-3-automation-scorecard.json'),
    JSON.stringify(automationAnalysis, null, 2)
  );

  let cp3md = `# Checkpoint 3: Automation Scorecard\n\n`;
  cp3md += `| Classification | Columns | Percentage |\n`;
  cp3md += `|---------------|---------|------------|\n`;
  cp3md += `| AUTO | ${automationAnalysis.summary.auto} | ${automationAnalysis.summary.autoPercent}% |\n`;
  cp3md += `| SEMI-AUTO | ${automationAnalysis.summary.semiAuto} | ${automationAnalysis.summary.semiAutoPercent}% |\n`;
  cp3md += `| HUMAN-REQUIRED | ${automationAnalysis.summary.human} | ${automationAnalysis.summary.humanPercent}% |\n`;
  cp3md += `| NOTIFY | ${automationAnalysis.summary.notify} | ${automationAnalysis.summary.notifyPercent}% |\n`;
  cp3md += `| **Total** | **${automationAnalysis.summary.total}** | **100%** |\n\n`;

  for (const sheetAnalysis of automationAnalysis.sheets) {
    cp3md += `## ${sheetAnalysis.title}\n\n`;
    for (const tabAnalysis of sheetAnalysis.tabs) {
      if (tabAnalysis.columns.length === 0) continue;
      cp3md += `### Tab: ${tabAnalysis.tabName}\n\n`;
      cp3md += `| Column | Classification | Reasoning |\n`;
      cp3md += `|--------|---------------|----------|\n`;
      for (const col of tabAnalysis.columns) {
        cp3md += `| ${col.name.replace(/\|/g, '/')} | ${col.classification} | ${col.reasoning.replace(/\|/g, '/').substring(0, 80)} |\n`;
      }
      cp3md += `\n`;
    }
  }

  fs.writeFileSync(path.join(ROOT, 'data', 'checkpoint-3-automation-scorecard.md'), cp3md);
  console.log('Saved: data/checkpoint-3-automation-scorecard.md');

  // ── STAGE 4-5: GENERATE PRD ───────────────────────────────
  console.log('\n===  STAGE 4-5: GENERATING PRD  ===\n');

  status.update('Generating PRD...');

  const prd = generatePRD(allResults, automationAnalysis, crawlReport);
  fs.writeFileSync(path.join(ROOT, 'docs', 'PRD-performance-keeping-module.md'), prd);
  console.log('Saved: docs/PRD-performance-keeping-module.md');

  const starter = generateConversationStarter(automationAnalysis, crawlReport);
  fs.writeFileSync(path.join(ROOT, 'docs', 'PRD-conversation-starter.md'), starter);
  console.log('Saved: docs/PRD-conversation-starter.md');

  status.stop();
}

// ─── AUTOMATION CLASSIFIER ────────────────────────────────────
function classifyColumn(header, sampleValues = []) {
  const h = (header || '').toLowerCase().trim();
  const samples = sampleValues.map(v => String(v || '').toLowerCase());

  const autoPatterns = [
    [/^(total|sum|count|avg|average|mean|min|max)/, 'Aggregate/calculated field'],
    [/impressions|clicks|ctr|cpc|cpm|reach|engagement/, 'Analytics metric - pullable from API'],
    [/views|visits|sessions|pageviews|bounce/, 'Web analytics metric'],
    [/followers|subscribers|likes|shares|comments|reactions/, 'Social media metric'],
    [/revenue|cost|spend|budget|roi|roas/, 'Financial metric - calculable'],
    [/open.?rate|click.?rate|unsubscribe|delivery/, 'Email metric - pullable from API'],
    [/date.?created|created.?at|updated.?at|timestamp|last.?modified/, 'Auto-generated timestamp'],
    [/^id$|_id$|^#$|^no\.?$|^number$/, 'Auto-generated identifier'],
    [/^url$|^link$|^website$|^site$/, 'Reference URL'],
    [/percentage|percent|%|ratio|rate$/, 'Calculated ratio/percentage'],
    [/month|week|year|quarter|period|date$/, 'Time period - auto-populated'],
  ];

  const semiAutoPatterns = [
    [/status|state|stage|phase/, 'Status field - workflow-driven'],
    [/assigned|owner|responsible|manager/, 'Assignment - triggered by workflow'],
    [/due.?date|deadline|target.?date|eta/, 'Deadline - set then tracked'],
    [/priority|urgency|severity/, 'Priority - set then tracked'],
    [/category|type|classification|tag/, 'Categorization - dropdown/enum'],
    [/approved|approval|sign.?off|verified/, 'Approval gate'],
    [/completed|done|finished|resolved/, 'Completion status'],
    [/check|checkbox|tick|yes.?no/, 'Boolean checkbox'],
  ];

  const humanPatterns = [
    [/notes?$|comment|feedback|remark|observation/, 'Free-text notes require human input'],
    [/description|detail|summary|overview|about/, 'Descriptive text requires human input'],
    [/quality|score|rating|grade|assessment/, 'Qualitative assessment requires judgment'],
    [/strategy|plan|approach|recommendation/, 'Strategic input requires human decision'],
    [/reason|why|justification|rationale|explanation/, 'Reasoning requires human judgment'],
    [/creative|copy|headline|caption|message|content$/, 'Creative content requires human creation'],
    [/goal|objective|target|kpi|benchmark/, 'Goal setting requires human decision'],
    [/^name$|client.?name|contact|person|team.?member/, 'Person/entity name'],
    [/action.?item|task|todo|next.?step/, 'Action items require human definition'],
  ];

  const notifyPatterns = [
    [/blocker|blocked|issue|problem|risk/, 'Blocker/issue should trigger alert'],
    [/overdue|late|delayed|behind|missed/, 'Overdue status should trigger alert'],
    [/escalat|urgent|critical|alert|emergency/, 'Escalation should trigger alert'],
    [/flag|warning|attention|review/, 'Flagged items should trigger notification'],
  ];

  for (const [p, reason] of notifyPatterns) {
    if (p.test(h)) return { classification: 'NOTIFY', reasoning: reason };
  }
  for (const [p, reason] of autoPatterns) {
    if (p.test(h)) return { classification: 'AUTO', reasoning: reason };
  }
  for (const [p, reason] of semiAutoPatterns) {
    if (p.test(h)) return { classification: 'SEMI-AUTO', reasoning: reason };
  }
  for (const [p, reason] of humanPatterns) {
    if (p.test(h)) return { classification: 'HUMAN-REQUIRED', reasoning: reason };
  }

  // Heuristic: check sample values
  const hasNumbers = samples.filter(s => /^\d+(\.\d+)?%?$/.test(s.trim())).length > samples.length * 0.5;
  const hasDates = samples.some(s => /\d{1,4}[/-]\d{1,2}[/-]\d{1,4}/.test(s));
  const hasUrls = samples.some(s => s.includes('http'));

  if (hasNumbers) return { classification: 'AUTO', reasoning: 'Mostly numeric values - likely calculable or API-sourced' };
  if (hasDates) return { classification: 'SEMI-AUTO', reasoning: 'Contains dates - likely date-tracked workflow' };
  if (hasUrls) return { classification: 'AUTO', reasoning: 'Contains URLs - reference/link data' };

  return { classification: 'HUMAN-REQUIRED', reasoning: 'No clear automation pattern - defaulting to human-required' };
}

function analyzeAutomation(allResults) {
  let totalAuto = 0, totalSemiAuto = 0, totalHuman = 0, totalNotify = 0, totalCols = 0;
  const sheets = [];

  for (const result of allResults) {
    if (result.error || !result.tabs) continue;

    const sheetAnalysis = { title: result.title, spreadsheetId: result.spreadsheetId, tabs: [] };

    for (const tab of result.tabs) {
      const tabAnalysis = { tabName: tab.tabName, columns: [] };

      for (const header of (tab.headers || [])) {
        if (!header || header.trim() === '') continue;
        const samples = (tab.sampleRows || []).map(row => row[header]).filter(Boolean);
        const { classification, reasoning } = classifyColumn(header, samples);

        tabAnalysis.columns.push({ name: header, classification, reasoning });
        totalCols++;
        if (classification === 'AUTO') totalAuto++;
        else if (classification === 'SEMI-AUTO') totalSemiAuto++;
        else if (classification === 'HUMAN-REQUIRED') totalHuman++;
        else if (classification === 'NOTIFY') totalNotify++;
      }
      sheetAnalysis.tabs.push(tabAnalysis);
    }
    sheets.push(sheetAnalysis);
  }

  const total = totalCols || 1;
  return {
    summary: {
      total: totalCols,
      auto: totalAuto, autoPercent: Math.round(totalAuto / total * 100),
      semiAuto: totalSemiAuto, semiAutoPercent: Math.round(totalSemiAuto / total * 100),
      human: totalHuman, humanPercent: Math.round(totalHuman / total * 100),
      notify: totalNotify, notifyPercent: Math.round(totalNotify / total * 100),
    },
    sheets,
  };
}

// ─── PRD GENERATOR ────────────────────────────────────────────
function generatePRD(allResults, automationAnalysis, crawlReport) {
  const a = automationAnalysis.summary;
  const successfulSheets = allResults.filter(r => !r.error);
  const failedSheets = allResults.filter(r => r.error);

  let prd = `# PRD: KM Boards Performance Keeping Module\n\n`;
  prd += `> Generated ${new Date().toISOString()} by Performance Keeping Crawler\n\n`;

  // Summary card
  prd += `## PRD Summary Card\n\n`;
  prd += `| Metric | Value |\n`;
  prd += `|--------|-------|\n`;
  prd += `| Sheets crawled | ${crawlReport.totalSheets} |\n`;
  prd += `| Total tabs | ${crawlReport.totalTabs} |\n`;
  prd += `| Total columns mapped | ${a.total} |\n`;
  prd += `| Total rows processed | ${crawlReport.totalRows} |\n`;
  prd += `| Automation: AUTO | ${a.auto} columns (${a.autoPercent}%) |\n`;
  prd += `| Automation: SEMI-AUTO | ${a.semiAuto} columns (${a.semiAutoPercent}%) |\n`;
  prd += `| Automation: HUMAN-REQUIRED | ${a.human} columns (${a.humanPercent}%) |\n`;
  prd += `| Automation: NOTIFY | ${a.notify} columns (${a.notifyPercent}%) |\n`;
  prd += `| Access denied sheets | ${failedSheets.length} |\n`;
  prd += `| Depth 1 sheets | ${crawlReport.depth1Count} |\n`;
  prd += `| Depth 2 sheets | ${crawlReport.depth2Count} |\n\n`;

  // Section 1
  prd += `## 1. Executive Summary\n\n`;
  prd += `"Performance Keeping" is Kivi Media's term for what bookkeeping is to finances, but applied to business performance metrics. `;
  prd += `It is the systematic tracking of all operational, marketing, sales, content, and client performance data across the agency and its clients.\n\n`;
  prd += `This PRD documents the complete Google Sheets ecosystem used for Performance Keeping, `;
  prd += `covering ${crawlReport.totalSheets} spreadsheets with ${crawlReport.totalTabs} tabs and ${a.total} tracked columns across ${crawlReport.totalRows} rows. `;
  prd += `The analysis shows that approximately **${a.autoPercent}%** of all tracking can be fully automated, `;
  prd += `**${a.semiAutoPercent}%** can be semi-automated with human triggers, `;
  prd += `and **${a.humanPercent}%** requires human judgment.\n\n`;

  // Section 2
  prd += `## 2. Current State: The Sheet Ecosystem\n\n`;
  prd += `### 2.1 Masterlist Overview\n\n`;

  const mastersheet = allResults.find(r => r.depth === 0);
  if (mastersheet && mastersheet.tabs) {
    for (const tab of mastersheet.tabs) {
      prd += `#### Tab: ${tab.tabName}\n\n`;
      if (tab.error) {
        prd += `> Note: ${tab.error}\n\n`;
      }
      prd += `- **Columns** (${tab.headers.length}): ${tab.headers.join(' | ') || 'N/A (dashboard/formatted tab)'}\n`;
      prd += `- **Rows**: ~${tab.actualRowCount || tab.rowCount}\n`;
      prd += `- **Links found**: ${tab.links ? tab.links.length : 0}\n`;
      if (tab.sampleRows && tab.sampleRows.length > 0) {
        prd += `\n**Sample data**:\n\n`;
        if (tab.headers.length > 0) {
          const hdrs = tab.headers.slice(0, 10);
          prd += `| ${hdrs.join(' | ')} |\n`;
          prd += `| ${hdrs.map(() => '---').join(' | ')} |\n`;
          for (const row of tab.sampleRows.slice(0, 5)) {
            prd += `| ${hdrs.map(h => String(row[h] || '').substring(0, 40).replace(/\|/g, '/')).join(' | ')} |\n`;
          }
        }
      }
      prd += `\n`;
    }
  }

  // Sheet Map
  prd += `### 2.2 Sheet Map\n\n`;
  prd += `\`\`\`\n`;
  prd += `${mastersheet ? mastersheet.title : 'Masterlist'}\n`;
  const depth1 = allResults.filter(r => r.depth === 1);
  const depth2 = allResults.filter(r => r.depth === 2);
  for (let i = 0; i < depth1.length; i++) {
    const s = depth1[i];
    const isLast = i === depth1.length - 1 && depth2.length === 0;
    const prefix = isLast ? '└── ' : '├── ';
    const tabCount = s.tabs ? s.tabs.length : 0;
    const label = s.error ? `[${s.error}]` : `(${tabCount} tabs)`;
    prd += `${prefix}${s.title || s.spreadsheetId} ${label}\n`;

    const children = depth2.filter(d => d.parentContext?.sourceSheet === s.title);
    for (let j = 0; j < children.length; j++) {
      const c = children[j];
      const cIsLast = j === children.length - 1;
      const cPrefix = isLast ? '    ' : '│   ';
      const cBranch = cIsLast ? '└── ' : '├── ';
      const cTabCount = c.tabs ? c.tabs.length : 0;
      const cLabel = c.error ? `[${c.error}]` : `(${cTabCount} tabs)`;
      prd += `${cPrefix}${cBranch}${c.title || c.spreadsheetId} ${cLabel}\n`;
    }
  }
  prd += `\`\`\`\n\n`;

  // Section 2.3
  prd += `### 2.3 Detailed Sheet Profiles\n\n`;
  for (const result of allResults) {
    if (result.error) {
      prd += `#### ${result.spreadsheetId} (Depth ${result.depth}) — ERROR\n\n`;
      prd += `- **Error**: ${result.error}\n`;
      prd += `- **Message**: ${result.errorMessage}\n`;
      prd += `- **URL**: ${result.url}\n`;
      if (result.parentContext) {
        prd += `- **Linked from**: "${result.parentContext.label}" in ${result.parentContext.sourceTab}\n`;
      }
      prd += `\n`;
      continue;
    }

    prd += `#### ${result.title} (Depth ${result.depth})\n\n`;
    prd += `- **Spreadsheet ID**: \`${result.spreadsheetId}\`\n`;
    prd += `- **Tab count**: ${result.tabCount}\n`;
    if (result.parentContext) {
      prd += `- **Linked from**: "${result.parentContext.label}" in ${result.parentContext.sourceSheet || 'Masterlist'} > ${result.parentContext.sourceTab}\n`;
    }
    prd += `\n`;

    for (const tab of (result.tabs || [])) {
      prd += `##### Tab: ${tab.tabName}\n\n`;
      if (tab.error) {
        prd += `> Error: ${tab.error}\n\n`;
      }
      prd += `- **Headers** (${tab.headers.length}): ${tab.headers.join(' | ') || 'None'}\n`;
      prd += `- **Rows**: ~${tab.actualRowCount || tab.rowCount}\n`;
      prd += `- **Links**: ${tab.links ? tab.links.length : 0}\n`;

      if (tab.sampleRows && tab.sampleRows.length > 0 && tab.headers.length > 0) {
        prd += `\n**Sample data**:\n\n`;
        const hdrs = tab.headers.slice(0, 12);
        prd += `| ${hdrs.join(' | ')} |\n`;
        prd += `| ${hdrs.map(() => '---').join(' | ')} |\n`;
        for (const row of tab.sampleRows.slice(0, 5)) {
          prd += `| ${hdrs.map(h => String(row[h] || '').substring(0, 35).replace(/\|/g, '/').replace(/\n/g, ' ')).join(' | ')} |\n`;
        }
        prd += `\n`;
      }
    }
  }

  // Section 3
  prd += `## 3. Automation Opportunity Analysis\n\n`;

  const classGroups = [
    ['AUTO', a.auto, a.autoPercent, 'These columns contain data that can be pulled from APIs, calculated, or auto-populated.'],
    ['SEMI-AUTO', a.semiAuto, a.semiAutoPercent, 'These columns require a human trigger or confirmation, after which KM Boards automates the rest.'],
    ['HUMAN-REQUIRED', a.human, a.humanPercent, 'These columns require human judgment and input. KM Boards sends reminders and tracks completion.'],
    ['NOTIFY', a.notify, a.notifyPercent, 'Changes in these columns should trigger notifications to relevant stakeholders.'],
  ];

  for (const [cls, count, pct, desc] of classGroups) {
    prd += `### 3.${classGroups.indexOf([cls, count, pct, desc]) + 1} ${cls} — ${count} columns (${pct}%)\n\n`;
    prd += `${desc}\n\n`;
    for (const sheet of automationAnalysis.sheets) {
      const cols = sheet.tabs.flatMap(t => t.columns.filter(c => c.classification === cls));
      if (cols.length > 0) {
        prd += `**${sheet.title}**: ${cols.map(c => `\`${c.name}\``).join(', ')}\n\n`;
      }
    }
  }

  // Section 4
  prd += `## 4. KM Boards Module Design\n\n`;

  prd += `### 4.1 Data Model\n\n`;
  prd += `Based on the crawled sheets, the Performance Keeping module needs tables that mirror the tracker structure. `;
  prd += `Common patterns observed:\n\n`;

  const allHeaders = {};
  for (const r of successfulSheets) {
    for (const t of (r.tabs || [])) {
      for (const h of (t.headers || [])) {
        const key = h.toLowerCase().trim();
        if (!allHeaders[key]) allHeaders[key] = { name: h, count: 0, sheets: [] };
        allHeaders[key].count++;
        allHeaders[key].sheets.push(r.title);
      }
    }
  }

  const commonHeaders = Object.values(allHeaders).filter(h => h.count > 1).sort((a, b) => b.count - a.count);
  if (commonHeaders.length > 0) {
    prd += `**Fields appearing in multiple sheets** (candidates for shared data model):\n\n`;
    prd += `| Field | Appears in # sheets |\n`;
    prd += `|-------|--------------------|\n`;
    for (const h of commonHeaders.slice(0, 20)) {
      prd += `| ${h.name} | ${h.count} |\n`;
    }
    prd += `\n`;
  }

  prd += `> Detailed table designs should be derived from the column mappings in the Appendix.\n\n`;

  prd += `### 4.2 Dashboards & Views\n\n`;
  prd += `- **Performance Keeping Hub** (replaces Masterlist): Overview of all trackers with status, freshness, and links\n`;
  prd += `- **Per-client performance views**: Aggregated metrics per client across all trackers\n`;
  prd += `- **Per-channel views**: Social media, email, ads, content metrics by channel\n`;
  prd += `- **Time-based views**: Weekly, monthly, quarterly roll-ups with trends\n`;
  prd += `- **Stale data alerts**: Highlight trackers that haven't been updated on schedule\n\n`;

  prd += `### 4.3 Automation Agents\n\n`;
  prd += `| Agent | Trigger | Description |\n`;
  prd += `|-------|---------|-------------|\n`;
  prd += `| Data Pull Agent | Scheduled (daily/weekly) | Fetches data from external APIs (Google Analytics, social platforms, email) |\n`;
  prd += `| Calculation Agent | On data change | Runs formulas, aggregations, comparisons, derived metrics |\n`;
  prd += `| Reminder Agent | Scheduled + event | Sends notifications for human-required inputs that are due/overdue |\n`;
  prd += `| Report Agent | Scheduled (weekly/monthly) | Generates periodic summaries and client reports |\n`;
  prd += `| Anomaly Agent | On data change | Flags unusual changes in metrics (sudden drops/spikes) |\n\n`;

  prd += `### 4.4 Notification & Reminder System\n\n`;
  prd += `- Notify responsible parties when NOTIFY columns change (blockers, overdue items, flags)\n`;
  prd += `- Send reminders for HUMAN-REQUIRED inputs based on the Frequency from the Masterlist\n`;
  prd += `- Smart batching: consolidate multiple reminders into a daily digest\n`;
  prd += `- Escalation: if input not provided within 2x the expected frequency, escalate to manager\n\n`;

  prd += `### 4.5 Migration Path\n\n`;
  prd += `1. **Phase 1 (Bridge)**: KM Boards reads from Google Sheets via API, displays in new dashboard UI\n`;
  prd += `2. **Phase 2 (Primary)**: KM Boards becomes primary data entry point, sheets become read-only mirrors\n`;
  prd += `3. **Phase 3 (Retire)**: Sheets retired, KM Boards is the sole source of truth\n\n`;

  // Section 5
  prd += `## 5. Integration Requirements\n\n`;
  prd += `Based on the data types and tracker names found across all sheets:\n\n`;
  prd += `| Integration | Purpose | Priority |\n`;
  prd += `|------------|---------|----------|\n`;
  prd += `| Google Analytics / Fathom | Web traffic, pageviews, sessions | High |\n`;
  prd += `| Meta (Facebook/Instagram) | Social media engagement metrics | High |\n`;
  prd += `| Google Ads | Ad spend, conversions, ROAS | High |\n`;
  prd += `| Pingdom | Site speed monitoring | Medium |\n`;
  prd += `| Pics.io | Digital asset management monitoring | Medium |\n`;
  prd += `| Email platform (TBD) | Email open/click rates | Medium |\n`;
  prd += `| LinkedIn | Professional social metrics | Medium |\n`;
  prd += `| YouTube / TikTok | Video metrics | Low |\n\n`;

  // Section 6
  prd += `## 6. Role-Based Access & Responsibilities\n\n`;
  prd += `| Role | Responsibilities | Access Level |\n`;
  prd += `|------|-----------------|-------------|\n`;
  prd += `| Agency Owner (Ziv) | Strategic decisions, approvals, high-level review | Full access |\n`;
  prd += `| Operations Manager (Devi) | Day-to-day tracking, monitoring, data entry coordination | Full access |\n`;
  prd += `| Account Managers | Client-specific updates, ticket tracking | Assigned client trackers |\n`;
  prd += `| Team Members | Channel-specific data entry | Assigned trackers only |\n`;
  prd += `| Developers/Designers | Flagged ticket responses | Flagged tickets view |\n`;
  prd += `| Clients | View their own performance data | Read-only, own data only |\n\n`;

  // Section 7
  prd += `## 7. Success Metrics\n\n`;
  prd += `| Metric | Target |\n`;
  prd += `|--------|--------|\n`;
  prd += `| Time saved per week vs. manual sheet updates | >5 hours/week |\n`;
  prd += `| Data freshness (max age of any AUTO metric) | <24 hours |\n`;
  prd += `| SEMI-AUTO data freshness | <72 hours |\n`;
  prd += `| Reminder compliance rate | >80% of human inputs on time |\n`;
  prd += `| Stale tracker incidents | Zero after Phase 2 |\n\n`;

  // Section 8
  prd += `## 8. Implementation Priority\n\n`;
  prd += `Based on frequency of use from the Masterlist:\n\n`;

  const priorityGroups = {};
  if (mastersheet) {
    const linksTab = mastersheet.tabs.find(t => t.tabName === 'Links');
    if (linksTab && linksTab.sampleRows) {
      for (const row of linksTab.sampleRows) {
        const freq = row['Frequency'] || 'Unknown';
        if (!priorityGroups[freq]) priorityGroups[freq] = [];
        priorityGroups[freq].push(row['Title'] || row['Links'] || 'Unknown');
      }
    }
  }

  const freqOrder = ['Daily', 'Twice a Week', 'Weekly', 'Monthly', 'Quarterly'];
  prd += `| Priority | Frequency | Trackers |\n`;
  prd += `|----------|-----------|----------|\n`;
  let pri = 1;
  for (const freq of freqOrder) {
    if (priorityGroups[freq]) {
      prd += `| ${pri++} | ${freq} | ${priorityGroups[freq].join(', ')} |\n`;
    }
  }
  for (const [freq, trackers] of Object.entries(priorityGroups)) {
    if (!freqOrder.includes(freq) && freq !== '' && freq !== 'Unknown') {
      prd += `| ${pri++} | ${freq} | ${trackers.join(', ')} |\n`;
    }
  }
  prd += `\n`;

  // Section 9: Appendix
  prd += `## 9. Appendix\n\n`;

  prd += `### A. Complete Column Mappings\n\n`;
  for (const sheet of automationAnalysis.sheets) {
    prd += `#### ${sheet.title}\n\n`;
    for (const tab of sheet.tabs) {
      if (tab.columns.length === 0) continue;
      prd += `**${tab.tabName}**:\n\n`;
      prd += `| Column | Classification | Reasoning |\n`;
      prd += `|--------|---------------|----------|\n`;
      for (const col of tab.columns) {
        prd += `| ${col.name.replace(/\|/g, '/')} | ${col.classification} | ${col.reasoning.substring(0, 80).replace(/\|/g, '/')} |\n`;
      }
      prd += `\n`;
    }
  }

  prd += `### B. Link Graph\n\n`;
  for (const result of allResults) {
    if (!result.linksFound || result.linksFound.length === 0) continue;
    prd += `**${result.title || result.spreadsheetId}** (depth ${result.depth}):\n`;
    for (const link of result.linksFound) {
      prd += `- -> \`${link.sheetId}\` "${link.label}" (from "${link.sourceTab}" col "${link.sourceColumn}", type: ${link.linkType})\n`;
    }
    prd += `\n`;
  }

  prd += `### C. Formula Inventory\n\n`;
  let hasFormulas = false;
  for (const result of allResults) {
    if (result.error || !result.tabs) continue;
    const allFormulas = result.tabs.flatMap(t => (t.formulas || []).map(f => ({ ...f, tab: t.tabName })));
    if (allFormulas.length > 0) {
      hasFormulas = true;
      prd += `**${result.title}**:\n`;
      for (const f of allFormulas.slice(0, 20)) {
        prd += `- Tab "${f.tab}", Row ${f.row}: \`${f.formula}\`\n`;
      }
      prd += `\n`;
    }
  }
  if (!hasFormulas) {
    prd += `No formulas detected via the API (Smart Chips and rich links are used instead of HYPERLINK formulas).\n\n`;
  }

  prd += `### D. Unresolved Questions\n\n`;
  let q = 1;
  if (failedSheets.length > 0) {
    prd += `${q++}. **Access denied sheets** — the following sheets need to be shared with the service account and re-crawled:\n`;
    for (const s of failedSheets) {
      const label = s.parentContext?.label || s.spreadsheetId;
      prd += `   - "${label}" — \`${s.url}\`\n`;
    }
    prd += `\n`;
  }
  prd += `${q++}. Which external APIs/platforms does Kivi Media use for each channel? (Needed to build Data Pull Agent)\n`;
  prd += `${q++}. What is the desired notification frequency? (Daily digest vs. real-time alerts)\n`;
  prd += `${q++}. Are there any sheets not linked from the Masterlist that should be included?\n`;
  prd += `${q++}. What is the priority order for migrating trackers to KM Boards?\n`;
  prd += `${q++}. What CRM/project management tools are currently in use? (For integration planning)\n`;
  prd += `${q++}. Should the Tracking Dashboard tab (tab 1 of Masterlist) be replicated in KM Boards, and if so, what does it contain?\n`;

  return prd;
}

function generateConversationStarter(automationAnalysis, crawlReport) {
  const a = automationAnalysis.summary;

  let md = `# KM Boards: Performance Keeping Module — Conversation Starter\n\n`;
  md += `## What is Performance Keeping?\n\n`;
  md += `Performance Keeping is Kivi Media's systematic tracking of all operational, marketing, sales, content, and client performance data. `;
  md += `It currently lives in ${crawlReport.totalSheets} Google Sheets with ${crawlReport.totalTabs} tabs and ${a.total} tracked columns. `;
  md += `This PRD defines how KM Boards should automate ~${a.autoPercent + a.semiAutoPercent}% of this tracking.\n\n`;

  md += `## Key Numbers\n\n`;
  md += `- ${a.auto} columns (${a.autoPercent}%) can be fully automated\n`;
  md += `- ${a.semiAuto} columns (${a.semiAutoPercent}%) need human triggers then auto-complete\n`;
  md += `- ${a.human} columns (${a.humanPercent}%) require human input (with reminders)\n`;
  md += `- ${a.notify} columns (${a.notifyPercent}%) should trigger notifications on change\n\n`;

  md += `## Top Priorities\n\n`;
  md += `1. Import the Masterlist structure into KM Boards as a "Performance Hub" dashboard\n`;
  md += `2. Build data models for the Daily-frequency trackers (highest use)\n`;
  md += `3. Implement the Data Pull Agent for AUTO columns\n`;
  md += `4. Set up the Reminder Agent for HUMAN-REQUIRED columns\n`;
  md += `5. Build the notification system for NOTIFY columns\n\n`;

  md += `## Suggested First Task\n\n`;
  md += `Read \`docs/PRD-performance-keeping-module.md\` and implement the database schema for the Masterlist `;
  md += `and the Daily-frequency trackers. Start with Supabase migrations for the core data model.\n\n`;

  md += `## Full PRD\n\n`;
  md += `See \`docs/PRD-performance-keeping-module.md\` for the complete analysis.\n`;

  return md;
}

// ─── RUN ──────────────────────────────────────────────────────
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
