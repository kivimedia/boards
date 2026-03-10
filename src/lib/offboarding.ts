import { SupabaseClient } from '@supabase/supabase-js';
import { decryptFromHex } from './encryption';
import { Client, CredentialDecrypted } from './types';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface DiscoveredCard {
  id: string;
  title: string;
  description: string | null;
  client_id: string | null;
  created_at: string;
  updated_at: string;
  board_name: string;
  board_type: string;
  list_name: string;
  match_type: 'direct' | 'heuristic' | 'board';
}

export interface WeeklyUpdate {
  id: string;
  client_id: string;
  status: string;
  ai_summary: string | null;
  meeting_time: string | null;
  sent_at: string | null;
  created_at: string;
}

export type AssetCategory = 'figma' | 'canva' | 'dropbox' | 'drive' | 'other';

export interface AssetLink {
  url: string;
  category: AssetCategory;
  source: string; // e.g. "Card: Logo Design (Design Board)"
  sourceType: 'attachment' | 'description' | 'comment';
}

export interface FileAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  storagePath: string;
  cardTitle: string;
  boardName: string;
}

export interface OffboardingReport {
  client: Client;
  generatedAt: string;
  cards: DiscoveredCard[];
  assets: Record<AssetCategory, AssetLink[]>;
  fileAttachments: FileAttachment[];
  credentials: CredentialDecrypted[];
  searchTerms: string[];
  weeklyUpdates: WeeklyUpdate[];
}

// ─── URL Patterns ───────────────────────────────────────────────────────────────

const URL_PATTERNS: Record<AssetCategory, RegExp> = {
  figma: /https?:\/\/(?:www\.)?figma\.com\/[^\s"'<>)]+/gi,
  canva: /https?:\/\/(?:www\.)?canva\.com\/[^\s"'<>)]+/gi,
  dropbox: /https?:\/\/(?:www\.)?dropbox\.com\/[^\s"'<>)]+/gi,
  drive: /https?:\/\/(?:drive|docs)\.google\.com\/[^\s"'<>)]+/gi,
  other: /https?:\/\/[^\s"'<>)]+/gi,
};

function categorizeUrl(url: string): AssetCategory {
  const lower = url.toLowerCase();
  if (lower.includes('figma.com')) return 'figma';
  if (lower.includes('canva.com')) return 'canva';
  if (lower.includes('dropbox.com')) return 'dropbox';
  if (lower.includes('drive.google.com') || lower.includes('docs.google.com')) return 'drive';
  return 'other';
}

function extractUrls(text: string): { url: string; category: AssetCategory }[] {
  const allUrls = text.match(/https?:\/\/[^\s"'<>)]+/gi) || [];
  return Array.from(new Set(allUrls)).map(url => ({
    url,
    category: categorizeUrl(url),
  }));
}

// ─── Build Search Terms ─────────────────────────────────────────────────────────

function extractDomains(text: string): string[] {
  const domainRegex = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/g;
  const domains: string[] = [];
  let match;
  while ((match = domainRegex.exec(text)) !== null) {
    const domain = match[1].toLowerCase();
    // Skip common/noise domains
    if (!['google.com', 'gmail.com', 'facebook.com', 'instagram.com', 'twitter.com',
          'linkedin.com', 'youtube.com', 'figma.com', 'canva.com', 'dropbox.com',
          'supabase.co', 'vercel.app', '17hats.com', 'kmboards.co'].includes(domain)) {
      domains.push(domain);
    }
  }
  return Array.from(new Set(domains));
}

export async function buildSearchTerms(
  supabase: SupabaseClient,
  client: Client,
  extraTerms: string[] = [],
): Promise<string[]> {
  const terms: string[] = [];

  // Client name parts
  if (client.name) {
    terms.push(client.name);
    const parts = client.name.split(/\s+/);
    if (parts.length > 1) {
      terms.push(...parts.filter(p => p.length > 2));
    }
  }

  // Company name
  if (client.company) terms.push(client.company);

  // Contacts
  for (const contact of client.contacts || []) {
    if (contact.name && contact.name !== client.name) terms.push(contact.name);
  }

  // Extract domains from client notes
  if (client.notes) {
    terms.push(...extractDomains(client.notes));
  }

  // Fetch AM board cards for this client to extract website info
  const { data: clientCards } = await supabase
    .from('cards')
    .select('description')
    .eq('client_id', client.id)
    .not('description', 'is', null);

  if (clientCards) {
    for (const card of clientCards) {
      if (card.description) {
        terms.push(...extractDomains(card.description));
      }
    }
  }

  // Fetch custom field values (URL type) for client's cards
  const { data: urlFields } = await supabase
    .from('custom_field_values')
    .select('value_url, value_text, cards!inner(client_id)')
    .eq('cards.client_id', client.id)
    .not('value_url', 'is', null);

  if (urlFields) {
    for (const field of urlFields) {
      if (field.value_url) terms.push(...extractDomains(field.value_url));
    }
  }

  // Add extra user-provided terms
  terms.push(...extraTerms.filter(t => t.trim()));

  // Deduplicate and filter short terms
  return Array.from(new Set(terms.map(t => t.trim()).filter(t => t.length > 2)));
}

// ─── Discover Cards ─────────────────────────────────────────────────────────────

async function getPlacementsForCards(
  supabase: SupabaseClient,
  cardIds: string[],
): Promise<Map<string, { board_name: string; board_type: string; list_name: string }>> {
  const map = new Map<string, { board_name: string; board_type: string; list_name: string }>();
  if (cardIds.length === 0) return map;

  const { data: placements } = await supabase
    .from('card_placements')
    .select('card_id, lists!inner(title, boards!inner(name, type))')
    .in('card_id', cardIds);

  if (placements) {
    for (const p of placements as any[]) {
      if (!map.has(p.card_id)) {
        map.set(p.card_id, {
          board_name: p.lists?.boards?.name || 'Unknown',
          board_type: p.lists?.boards?.type || 'unknown',
          list_name: p.lists?.title || 'Unknown',
        });
      }
    }
  }
  return map;
}

export async function discoverClientCards(
  supabase: SupabaseClient,
  clientId: string,
  searchTerms: string[],
): Promise<DiscoveredCard[]> {
  // Step 1: Direct match - cards with client_id set
  const { data: directCardRows } = await supabase
    .from('cards')
    .select('id, title, description, client_id, created_at, updated_at')
    .eq('client_id', clientId);

  const directMap = new Map<string, DiscoveredCard>();
  if (directCardRows && directCardRows.length > 0) {
    const placements = await getPlacementsForCards(supabase, directCardRows.map((c: any) => c.id));
    for (const card of directCardRows as any[]) {
      const p = placements.get(card.id);
      directMap.set(card.id, {
        id: card.id,
        title: card.title,
        description: card.description,
        client_id: card.client_id,
        created_at: card.created_at,
        updated_at: card.updated_at,
        board_name: p?.board_name || 'Unknown',
        board_type: p?.board_type || 'unknown',
        list_name: p?.list_name || 'Unknown',
        match_type: 'direct',
      });
    }
  }

  // Step 2: Heuristic - search by terms in card title/description
  const heuristicMap = new Map<string, DiscoveredCard>();
  if (searchTerms.length > 0) {
    for (const term of searchTerms) {
      const likePattern = `%${term}%`;
      const { data: matchedCards } = await supabase
        .from('cards')
        .select('id, title, description, client_id, created_at, updated_at')
        .or(`title.ilike.${likePattern},description.ilike.${likePattern}`)
        .limit(100);

      if (matchedCards && matchedCards.length > 0) {
        const newCards = (matchedCards as any[]).filter(
          c => !directMap.has(c.id) && !heuristicMap.has(c.id),
        );
        if (newCards.length > 0) {
          const placements = await getPlacementsForCards(supabase, newCards.map((c: any) => c.id));
          for (const card of newCards) {
            const p = placements.get(card.id);
            heuristicMap.set(card.id, {
              id: card.id,
              title: card.title,
              description: card.description,
              client_id: card.client_id,
              created_at: card.created_at,
              updated_at: card.updated_at,
              board_name: p?.board_name || 'Unknown',
              board_type: p?.board_type || 'unknown',
              list_name: p?.list_name || 'Unknown',
              match_type: 'heuristic',
            });
          }
        }
      }
    }
  }

  // Step 3: Board-linked cards - all cards in boards linked to this client
  const boardLinkedMap = new Map<string, DiscoveredCard>();

  const { data: clientBoards } = await supabase
    .from('client_boards')
    .select('board_id')
    .eq('client_id', clientId)
    .eq('is_active', true);

  const linkedBoardIds = (clientBoards || []).map((b: any) => b.board_id);

  if (linkedBoardIds.length > 0) {
    // Get all lists in those boards
    const { data: lists } = await supabase
      .from('lists')
      .select('id, title, board_id, boards!inner(name, type)')
      .in('board_id', linkedBoardIds);

    if (lists && lists.length > 0) {
      const listIds = lists.map((l: any) => l.id);
      const listInfoMap = new Map(lists.map((l: any) => [l.id, l]));

      // Batch to avoid large IN queries
      for (let i = 0; i < listIds.length; i += 50) {
        const batch = listIds.slice(i, i + 50);
        const { data: placements } = await supabase
          .from('card_placements')
          .select('list_id, cards!inner(id, title, description, client_id, created_at, updated_at)')
          .in('list_id', batch);

        if (placements) {
          for (const row of placements as any[]) {
            const card = row.cards;
            if (!directMap.has(card.id) && !heuristicMap.has(card.id) && !boardLinkedMap.has(card.id)) {
              const listInfo = listInfoMap.get(row.list_id) as any;
              boardLinkedMap.set(card.id, {
                id: card.id,
                title: card.title,
                description: card.description,
                client_id: card.client_id,
                created_at: card.created_at,
                updated_at: card.updated_at,
                board_name: listInfo?.boards?.name || 'Unknown',
                board_type: listInfo?.boards?.type || 'unknown',
                list_name: listInfo?.title || 'Unknown',
                match_type: 'board',
              });
            }
          }
        }
      }
    }
  }

  // Combine: direct first, then heuristic, then board-linked
  return Array.from(directMap.values())
    .concat(Array.from(heuristicMap.values()))
    .concat(Array.from(boardLinkedMap.values()));
}

// ─── Extract Asset Links ────────────────────────────────────────────────────────

export async function extractAssetLinks(
  supabase: SupabaseClient,
  cards: DiscoveredCard[],
): Promise<{ assets: Record<AssetCategory, AssetLink[]>; fileAttachments: FileAttachment[] }> {
  const cardIds = cards.map(c => c.id);
  if (cardIds.length === 0) {
    return {
      assets: { figma: [], canva: [], dropbox: [], drive: [], other: [] },
      fileAttachments: [],
    };
  }

  const cardLookup = new Map(cards.map(c => [c.id, c]));
  const allAssets: AssetLink[] = [];
  const allFiles: FileAttachment[] = [];
  const seenUrls = new Set<string>();

  // Batch card IDs to avoid too-large IN queries
  const batchSize = 50;
  for (let i = 0; i < cardIds.length; i += batchSize) {
    const batch = cardIds.slice(i, i + batchSize);

    // 1. Link attachments (mime_type = text/uri-list)
    const { data: linkAttachments } = await supabase
      .from('attachments')
      .select('id, card_id, file_name, mime_type, storage_path')
      .in('card_id', batch)
      .eq('mime_type', 'text/uri-list');

    if (linkAttachments) {
      for (const att of linkAttachments) {
        const url = att.storage_path;
        if (url && !seenUrls.has(url)) {
          seenUrls.add(url);
          const card = cardLookup.get(att.card_id);
          allAssets.push({
            url,
            category: categorizeUrl(url),
            source: `${card?.title || 'Unknown'} (${card?.board_name || 'Unknown'})`,
            sourceType: 'attachment',
          });
        }
      }
    }

    // 2. File attachments (non-link)
    const { data: fileAtts } = await supabase
      .from('attachments')
      .select('id, card_id, file_name, mime_type, storage_path')
      .in('card_id', batch)
      .neq('mime_type', 'text/uri-list');

    if (fileAtts) {
      for (const att of fileAtts) {
        const card = cardLookup.get(att.card_id);
        allFiles.push({
          id: att.id,
          fileName: att.file_name,
          mimeType: att.mime_type,
          storagePath: att.storage_path,
          cardTitle: card?.title || 'Unknown',
          boardName: card?.board_name || 'Unknown',
        });
      }
    }

    // 3. Comments
    const { data: comments } = await supabase
      .from('comments')
      .select('id, card_id, content')
      .in('card_id', batch)
      .not('content', 'is', null);

    if (comments) {
      for (const comment of comments) {
        const urls = extractUrls(comment.content);
        const card = cardLookup.get(comment.card_id);
        for (const { url, category } of urls) {
          if (!seenUrls.has(url) && category !== 'other') {
            seenUrls.add(url);
            allAssets.push({
              url,
              category,
              source: `${card?.title || 'Unknown'} (${card?.board_name || 'Unknown'})`,
              sourceType: 'comment',
            });
          }
        }
      }
    }
  }

  // 4. Card descriptions
  for (const card of cards) {
    if (card.description) {
      const urls = extractUrls(card.description);
      for (const { url, category } of urls) {
        if (!seenUrls.has(url) && category !== 'other') {
          seenUrls.add(url);
          allAssets.push({
            url,
            category,
            source: `${card.title} (${card.board_name})`,
            sourceType: 'description',
          });
        }
      }
    }
  }

  // Group by category
  const assets: Record<AssetCategory, AssetLink[]> = {
    figma: [], canva: [], dropbox: [], drive: [], other: [],
  };
  for (const asset of allAssets) {
    assets[asset.category].push(asset);
  }

  return { assets, fileAttachments: allFiles };
}

// ─── Collect Credentials ────────────────────────────────────────────────────────

export async function collectCredentials(
  supabase: SupabaseClient,
  clientId: string,
  userId: string,
): Promise<CredentialDecrypted[]> {
  const { data, error } = await supabase
    .from('credential_entries')
    .select('*')
    .eq('client_id', clientId);

  if (error || !data) return [];

  const decrypted: CredentialDecrypted[] = [];
  for (const cred of data) {
    try {
      decrypted.push({
        id: cred.id,
        client_id: cred.client_id,
        platform: cred.platform,
        username: cred.username_encrypted ? decryptFromHex(cred.username_encrypted) : null,
        password: cred.password_encrypted ? decryptFromHex(cred.password_encrypted) : null,
        notes: cred.notes_encrypted ? decryptFromHex(cred.notes_encrypted) : null,
        category: cred.category,
        created_by: cred.created_by,
        created_at: cred.created_at,
        updated_at: cred.updated_at,
      });
    } catch {
      // Skip credentials that fail to decrypt
      decrypted.push({
        id: cred.id,
        client_id: cred.client_id,
        platform: cred.platform,
        username: '[decryption failed]',
        password: '[decryption failed]',
        notes: null,
        category: cred.category,
        created_by: cred.created_by,
        created_at: cred.created_at,
        updated_at: cred.updated_at,
      });
    }
  }

  // Log audit entries
  if (decrypted.length > 0) {
    await supabase.from('credential_audit_log').insert(
      decrypted.map(c => ({
        credential_id: c.id,
        user_id: userId,
        action: 'viewed',
      }))
    );
  }

  return decrypted;
}

// ─── Collect Weekly Updates ─────────────────────────────────────────────────────

export async function collectWeeklyUpdates(
  supabase: SupabaseClient,
  clientId: string,
): Promise<WeeklyUpdate[]> {
  const { data, error } = await supabase
    .from('client_weekly_updates')
    .select('id, client_id, status, ai_summary, meeting_time, sent_at, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as WeeklyUpdate[];
}

// ─── Build Report Data ──────────────────────────────────────────────────────────

export function buildReportData(
  client: Client,
  cards: DiscoveredCard[],
  assets: Record<AssetCategory, AssetLink[]>,
  fileAttachments: FileAttachment[],
  credentials: CredentialDecrypted[],
  searchTerms: string[],
  weeklyUpdates: WeeklyUpdate[] = [],
): OffboardingReport {
  return {
    client,
    generatedAt: new Date().toISOString(),
    cards,
    assets,
    fileAttachments,
    credentials,
    searchTerms,
    weeklyUpdates,
  };
}

// ─── Generate CSV ───────────────────────────────────────────────────────────────

function escapeCsv(val: string | null | undefined): string {
  if (!val) return '';
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function generateCsv(report: OffboardingReport): string {
  const lines: string[] = [];

  // Header
  lines.push(`Client Offboarding Report - ${report.client.name}`);
  lines.push(`Generated: ${new Date(report.generatedAt).toLocaleDateString()}`);
  lines.push(`Company: ${report.client.company || 'N/A'}`);
  lines.push('');

  // Credentials section
  lines.push('=== CREDENTIALS ===');
  lines.push('Platform,Username,Password,Notes,Category');
  for (const cred of report.credentials) {
    lines.push([
      escapeCsv(cred.platform),
      escapeCsv(cred.username),
      escapeCsv(cred.password),
      escapeCsv(cred.notes),
      escapeCsv(cred.category),
    ].join(','));
  }
  lines.push('');

  // Design assets
  const assetCategories: { key: AssetCategory; label: string }[] = [
    { key: 'figma', label: 'FIGMA FILES' },
    { key: 'canva', label: 'CANVA FILES' },
    { key: 'dropbox', label: 'DROPBOX FILES' },
    { key: 'drive', label: 'GOOGLE DRIVE FILES' },
  ];

  for (const { key, label } of assetCategories) {
    if (report.assets[key].length > 0) {
      lines.push(`=== ${label} ===`);
      lines.push('URL,Source,Found In');
      for (const asset of report.assets[key]) {
        lines.push([
          escapeCsv(asset.url),
          escapeCsv(asset.source),
          escapeCsv(asset.sourceType),
        ].join(','));
      }
      lines.push('');
    }
  }

  // All cards
  lines.push('=== ALL PROJECT CARDS ===');
  lines.push('Title,Board,List,Match Type,Created');
  for (const card of report.cards) {
    lines.push([
      escapeCsv(card.title),
      escapeCsv(card.board_name),
      escapeCsv(card.list_name),
      escapeCsv(card.match_type),
      escapeCsv(new Date(card.created_at).toLocaleDateString()),
    ].join(','));
  }

  // Weekly updates
  if (report.weeklyUpdates.length > 0) {
    lines.push('');
    lines.push('=== WEEKLY UPDATES ===');
    lines.push('Date,Status,Summary,Sent At');
    for (const update of report.weeklyUpdates) {
      lines.push([
        escapeCsv(new Date(update.created_at).toLocaleDateString()),
        escapeCsv(update.status),
        escapeCsv(update.ai_summary),
        escapeCsv(update.sent_at ? new Date(update.sent_at).toLocaleDateString() : null),
      ].join(','));
    }
  }

  return lines.join('\n');
}
