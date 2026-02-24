import fs from 'fs';
const data = JSON.parse(fs.readFileSync('data/sheet-crawl-results.json', 'utf8'));
const visitedIds = new Set(data.map(r => r.spreadsheetId));

// Check 1: Sanity Checks depth-2 links
const sanitySheet = data.find(r => r.title === 'KM Sanity Checks');
const allSanityLinks = sanitySheet.tabs.flatMap(t => t.links || []);
const uniqueSanityIds = new Set(allSanityLinks.map(l => l.sheetId).filter(Boolean));
const unfollowedSanity = [...uniqueSanityIds].filter(id => visitedIds.has(id) === false);

console.log('=== Sanity Checks depth-2 links ===');
console.log('Total links in Sanity Checks tabs:', allSanityLinks.length);
console.log('Unique sheet IDs:', uniqueSanityIds.size);
console.log('Already visited:', uniqueSanityIds.size - unfollowedSanity.length);
console.log('NOT followed:', unfollowedSanity.length);
console.log('');
for (const id of unfollowedSanity) {
  const link = allSanityLinks.find(l => l.sheetId === id);
  console.log('  -', id, '| tab:', link.sourceTab, '| label:', (link.label || '').substring(0, 60));
}

// Check 2: Masterlist Links tab coverage
const mastersheet = data.find(r => r.depth === 0);
const linksTab = mastersheet.tabs.find(t => t.tabName === 'Links');
console.log('');
console.log('=== Masterlist Links tab ===');
console.log('Declared row count:', linksTab.rowCount);
console.log('Links found:', linksTab.links.length);
console.log('Sample rows:', linksTab.sampleRows.length);

// Check 3: All unfollowed links across ALL sheets
console.log('');
console.log('=== ALL unfollowed links ===');
const allUnfollowed = new Map();
for (const r of data) {
  const links = r.linksFound || [];
  for (const l of links) {
    if (l.sheetId && visitedIds.has(l.sheetId) === false && allUnfollowed.has(l.sheetId) === false) {
      allUnfollowed.set(l.sheetId, { from: r.title, tab: l.sourceTab, label: l.label });
    }
  }
  // Also check tab-level links
  for (const t of (r.tabs || [])) {
    for (const l of (t.links || [])) {
      if (l.sheetId && visitedIds.has(l.sheetId) === false && allUnfollowed.has(l.sheetId) === false) {
        allUnfollowed.set(l.sheetId, { from: r.title, tab: l.sourceTab || t.tabName, label: l.label });
      }
    }
  }
}

console.log('Total unique unfollowed sheet IDs:', allUnfollowed.size);
for (const [id, info] of allUnfollowed) {
  console.log('  -', id);
  console.log('    from:', info.from, '>', info.tab);
  console.log('    label:', (info.label || '').substring(0, 70));
}
