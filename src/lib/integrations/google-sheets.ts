import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { OffboardingReport } from '../offboarding';

// ─── Auth ───────────────────────────────────────────────────────────────────────

function getServiceAccountAuth(): JWT {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_KEY env var is not set. ' +
      'Create a Google Cloud service account, enable the Sheets API, ' +
      'download the JSON key, and set this env var to its contents.'
    );
  }

  let key: { client_email: string; private_key: string };
  try {
    key = JSON.parse(keyJson);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON');
  }

  return new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
  });
}

// ─── Create Sheet ───────────────────────────────────────────────────────────────

export async function createOffboardingSheet(
  report: OffboardingReport,
  clientEmail?: string,
): Promise<string> {
  const auth = getServiceAccountAuth();
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const title = `${report.client.name} - Project Handoff - ${dateStr}`;

  const doc = new GoogleSpreadsheet(undefined as any, auth);
  // @ts-ignore - google-spreadsheet v5 createNewSpreadsheetDocument
  await doc.createNewSpreadsheetDocument({ title });

  // ── Tab 1: Summary ──
  const summarySheet = doc.sheetsByIndex[0];
  await summarySheet.updateProperties({ title: 'Summary' });
  await summarySheet.setHeaderRow(['Field', 'Value']);
  await summarySheet.addRows([
    { Field: 'Client Name', Value: report.client.name },
    { Field: 'Company', Value: report.client.company || '' },
    { Field: 'Email', Value: report.client.email || '' },
    { Field: 'Phone', Value: report.client.phone || '' },
    { Field: 'Location', Value: report.client.location || '' },
    { Field: 'Contract Type', Value: report.client.contract_type || '' },
    { Field: '', Value: '' },
    { Field: 'Report Generated', Value: dateStr },
    { Field: 'Total Cards Found', Value: String(report.cards.length) },
    { Field: 'Direct Match Cards', Value: String(report.cards.filter(c => c.match_type === 'direct').length) },
    { Field: 'Heuristic Match Cards', Value: String(report.cards.filter(c => c.match_type === 'heuristic').length) },
    { Field: 'Credentials Count', Value: String(report.credentials.length) },
    { Field: 'Figma Links', Value: String(report.assets.figma.length) },
    { Field: 'Canva Links', Value: String(report.assets.canva.length) },
    { Field: 'Dropbox Links', Value: String(report.assets.dropbox.length) },
    { Field: 'Google Drive Links', Value: String(report.assets.drive.length) },
    { Field: 'File Attachments', Value: String(report.fileAttachments.length) },
  ]);

  // Contacts
  if (report.client.contacts?.length > 0) {
    await summarySheet.addRows([{ Field: '', Value: '' }, { Field: '--- Contacts ---', Value: '' }]);
    for (const contact of report.client.contacts) {
      await summarySheet.addRows([{
        Field: contact.role || 'Contact',
        Value: `${contact.name} - ${contact.email}${contact.phone ? ` - ${contact.phone}` : ''}`,
      }]);
    }
  }

  // ── Tab 2: Credentials ──
  if (report.credentials.length > 0) {
    const credSheet = await doc.addSheet({ title: 'Credentials', headerValues: ['Platform', 'Category', 'Username', 'Password', 'Notes'] });
    await credSheet.addRows(
      report.credentials.map(c => ({
        Platform: c.platform,
        Category: c.category,
        Username: c.username || '',
        Password: c.password || '',
        Notes: c.notes || '',
      }))
    );
  }

  // ── Tab 3: Design Assets ──
  const designAssets = [...report.assets.figma, ...report.assets.canva];
  if (designAssets.length > 0) {
    const designSheet = await doc.addSheet({ title: 'Design Assets', headerValues: ['Type', 'URL', 'Source Card', 'Found In'] });
    await designSheet.addRows(
      designAssets.map(a => ({
        Type: a.category.charAt(0).toUpperCase() + a.category.slice(1),
        URL: a.url,
        'Source Card': a.source,
        'Found In': a.sourceType,
      }))
    );
  }

  // ── Tab 4: Files & Drives ──
  const fileAssets = [...report.assets.dropbox, ...report.assets.drive];
  if (fileAssets.length > 0 || report.fileAttachments.length > 0) {
    const filesSheet = await doc.addSheet({ title: 'Files & Drives', headerValues: ['Type', 'Name/URL', 'Source Card', 'Board'] });
    const rows: Record<string, string>[] = [];

    for (const a of fileAssets) {
      rows.push({
        Type: a.category === 'dropbox' ? 'Dropbox' : 'Google Drive',
        'Name/URL': a.url,
        'Source Card': a.source,
        Board: '',
      });
    }
    for (const f of report.fileAttachments) {
      rows.push({
        Type: 'Uploaded File',
        'Name/URL': f.fileName,
        'Source Card': f.cardTitle,
        Board: f.boardName,
      });
    }

    await filesSheet.addRows(rows);
  }

  // ── Tab 5: All Cards ──
  if (report.cards.length > 0) {
    const cardsSheet = await doc.addSheet({ title: 'All Cards', headerValues: ['Title', 'Board', 'List', 'Match Type', 'Created', 'Description'] });
    await cardsSheet.addRows(
      report.cards.map(c => ({
        Title: c.title,
        Board: c.board_name,
        List: c.list_name,
        'Match Type': c.match_type,
        Created: new Date(c.created_at).toLocaleDateString(),
        Description: (c.description || '').slice(0, 200),
      }))
    );
  }

  // Share with client email if provided
  if (clientEmail) {
    try {
      await doc.share(clientEmail, { role: 'writer', emailMessage: `Here is your project handoff report from ${report.client.company || 'our team'}.` });
    } catch {
      // Sharing may fail if email is not a Google account - that's OK
    }
  }

  return `https://docs.google.com/spreadsheets/d/${doc.spreadsheetId}`;
}
