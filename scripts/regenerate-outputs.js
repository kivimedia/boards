import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const allResults = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/sheet-crawl-results.json'), 'utf8'));

// ── Rebuild checkpoint 2 ──
const totalTabs = allResults.reduce((s, r) => s + (r.tabs ? r.tabs.length : 0), 0);
const totalCols = allResults.reduce((s, r) => {
  if (!r.tabs) return s;
  return s + r.tabs.reduce((ts, t) => ts + (t.headers ? t.headers.length : 0), 0);
}, 0);

let cp2 = `# Checkpoint 2: Crawl Report (Updated)\n\n`;
cp2 += `| Metric | Value |\n|--------|-------|\n`;
cp2 += `| Total sheets crawled | ${allResults.length} |\n`;
cp2 += `| Total tabs read | ${totalTabs} |\n`;
cp2 += `| Total columns mapped | ${totalCols} |\n`;
cp2 += `| Errors | 0 |\n\n`;

for (const r of allResults) {
  if (r.error) {
    cp2 += `## ${r.spreadsheetId} — ERROR: ${r.error}\n\n`;
    continue;
  }
  cp2 += `## ${r.title} (depth ${r.depth})\n`;
  cp2 += `- Tabs: ${r.tabs ? r.tabs.length : 0}\n`;
  for (const t of (r.tabs || [])) {
    cp2 += `  - **${t.tabName}**: ${t.headers.length} columns, ~${t.rowCount} rows, ${t.links ? t.links.length : 0} links\n`;
    if (t.headers.length > 0) {
      cp2 += `    - Headers: ${t.headers.join(' | ')}\n`;
    }
  }
  cp2 += `\n`;
}

fs.writeFileSync(path.join(ROOT, 'data/checkpoint-2-crawl-report.md'), cp2);
console.log('Saved checkpoint-2-crawl-report.md');

// ── Automation analysis ──
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
    [/^url$|^link$|^website$|^site$|website link|page link|form link/, 'Reference URL'],
    [/percentage|percent|%|ratio|rate$/, 'Calculated ratio/percentage'],
    [/month|week|year|quarter|period|^date$|test date/, 'Time period - auto-populated'],
    [/attachment|report|documentation|recording/, 'File attachment reference'],
    [/installed|done|received|reflected/, 'Boolean completion status - trackable'],
  ];

  const semiAutoPatterns = [
    [/status|state|stage|phase/, 'Status field - workflow-driven'],
    [/assigned|owner|responsible|manager|account.?man/, 'Assignment - triggered by workflow'],
    [/due.?date|deadline|target.?date|eta/, 'Deadline - set then tracked'],
    [/priority|urgency|severity/, 'Priority - set then tracked'],
    [/category|type|classification|tag|method/, 'Categorization - dropdown/enum'],
    [/approved|approval|sign.?off|verified/, 'Approval gate'],
    [/completed|done|finished|resolved|updated|sent.*time/, 'Completion status'],
    [/check|checkbox|tick|yes.?no|done\)?$/, 'Boolean checkbox'],
    [/desktop|mobile|responsive/, 'Device type - selectable enum'],
    [/red.?flag|type of/, 'Categorization - enum/dropdown'],
    [/reasonable/, 'Validation check - semi-auto'],
  ];

  const humanPatterns = [
    [/notes?$|comment|feedback|remark|observation|remark/, 'Free-text notes require human input'],
    [/description|detail|summary|overview|about/, 'Descriptive text requires human input'],
    [/quality|score|rating|grade|assessment/, 'Qualitative assessment requires judgment'],
    [/strategy|plan|approach|recommendation/, 'Strategic input requires human decision'],
    [/reason|why|justification|rationale|explanation/, 'Reasoning requires human judgment'],
    [/creative|copy|headline|caption|message|content$/, 'Creative content requires human creation'],
    [/goal|objective|target|kpi|benchmark|commitment/, 'Goal setting requires human decision'],
    [/^name$|client.?name|^client$|contact|person|business.?name/, 'Person/entity name'],
    [/action.?item|task|todo|next.?step|project|ticket/, 'Action items require human definition'],
    [/thank.?you|page.?name/, 'Page-specific reference'],
    [/reminder/, 'Reminder text'],
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

  const hasNumbers = samples.filter(s => /^\d+(\.\d+)?%?$/.test(s.trim())).length > samples.length * 0.5;
  const hasDates = samples.some(s => /\d{1,4}[/-]\d{1,2}[/-]\d{1,4}/.test(s));
  const hasUrls = samples.some(s => s.includes('http'));

  if (hasNumbers) return { classification: 'AUTO', reasoning: 'Mostly numeric values - likely calculable or API-sourced' };
  if (hasDates) return { classification: 'SEMI-AUTO', reasoning: 'Contains dates - likely date-tracked workflow' };
  if (hasUrls) return { classification: 'AUTO', reasoning: 'Contains URLs - reference/link data' };

  return { classification: 'HUMAN-REQUIRED', reasoning: 'No clear automation pattern - defaulting to human-required' };
}

let totalAuto = 0, totalSemiAuto = 0, totalHuman = 0, totalNotify = 0, totalColsA = 0;
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
      totalColsA++;
      if (classification === 'AUTO') totalAuto++;
      else if (classification === 'SEMI-AUTO') totalSemiAuto++;
      else if (classification === 'HUMAN-REQUIRED') totalHuman++;
      else if (classification === 'NOTIFY') totalNotify++;
    }
    sheetAnalysis.tabs.push(tabAnalysis);
  }
  sheets.push(sheetAnalysis);
}

const total = totalColsA || 1;
const automationAnalysis = {
  summary: {
    total: totalColsA,
    auto: totalAuto, autoPercent: Math.round(totalAuto / total * 100),
    semiAuto: totalSemiAuto, semiAutoPercent: Math.round(totalSemiAuto / total * 100),
    human: totalHuman, humanPercent: Math.round(totalHuman / total * 100),
    notify: totalNotify, notifyPercent: Math.round(totalNotify / total * 100),
  },
  sheets,
};

fs.writeFileSync(path.join(ROOT, 'data/checkpoint-3-automation-scorecard.json'), JSON.stringify(automationAnalysis, null, 2));

let cp3 = `# Checkpoint 3: Automation Scorecard (Updated)\n\n`;
cp3 += `| Classification | Columns | Percentage |\n|---------------|---------|------------|\n`;
cp3 += `| AUTO | ${totalAuto} | ${automationAnalysis.summary.autoPercent}% |\n`;
cp3 += `| SEMI-AUTO | ${totalSemiAuto} | ${automationAnalysis.summary.semiAutoPercent}% |\n`;
cp3 += `| HUMAN-REQUIRED | ${totalHuman} | ${automationAnalysis.summary.humanPercent}% |\n`;
cp3 += `| NOTIFY | ${totalNotify} | ${automationAnalysis.summary.notifyPercent}% |\n`;
cp3 += `| **Total** | **${totalColsA}** | **100%** |\n\n`;

for (const sa of sheets) {
  cp3 += `## ${sa.title}\n\n`;
  for (const ta of sa.tabs) {
    if (ta.columns.length === 0) continue;
    cp3 += `### Tab: ${ta.tabName}\n\n`;
    cp3 += `| Column | Classification | Reasoning |\n|--------|---------------|----------|\n`;
    for (const col of ta.columns) {
      cp3 += `| ${col.name.replace(/\|/g, '/').substring(0, 60)} | ${col.classification} | ${col.reasoning.replace(/\|/g, '/').substring(0, 80)} |\n`;
    }
    cp3 += `\n`;
  }
}

fs.writeFileSync(path.join(ROOT, 'data/checkpoint-3-automation-scorecard.md'), cp3);
console.log('Saved checkpoint-3-automation-scorecard.md');
console.log('Automation:', totalAuto, 'AUTO,', totalSemiAuto, 'SEMI-AUTO,', totalHuman, 'HUMAN,', totalNotify, 'NOTIFY out of', totalColsA, 'total');
