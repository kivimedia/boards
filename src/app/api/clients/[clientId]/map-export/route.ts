import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { jsPDF } from 'jspdf';

interface Params {
  params: { clientId: string };
}

/**
 * GET /api/clients/[clientId]/map-export
 * Generate a PDF export of the client's Map Board.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  // Fetch all Map Board data in parallel
  const [clientRes, doorsRes, trainingRes, sectionsRes] = await Promise.all([
    supabase.from('clients').select('*').eq('id', params.clientId).single(),
    supabase.from('doors').select('*, keys:door_keys(*)').eq('client_id', params.clientId).order('door_number', { ascending: true }),
    supabase.from('training_assignments').select('*').eq('client_id', params.clientId).order('created_at', { ascending: true }),
    supabase.from('map_sections').select('*').eq('client_id', params.clientId).order('position', { ascending: true }),
  ]);

  const client = clientRes.data;
  if (!client) return errorResponse('Client not found', 404);

  const doors = doorsRes.data ?? [];
  const training = trainingRes.data ?? [];
  const sections = sectionsRes.data ?? [];

  // Build PDF
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const checkPage = (needed: number) => {
    if (y + needed > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      y = margin;
    }
  };

  // Helper: section header
  const sectionHeader = (title: string) => {
    checkPage(20);
    y += 6;
    doc.setFillColor(59, 130, 246); // electric blue
    doc.roundedRect(margin, y, contentWidth, 8, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(title, margin + 4, y + 5.5);
    y += 12;
    doc.setTextColor(30, 30, 60);
  };

  const bodyText = (text: string, indent: number = 0) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 90);
    const lines = doc.splitTextToSize(text, contentWidth - indent);
    for (const line of lines) {
      checkPage(5);
      doc.text(line, margin + indent, y);
      y += 4;
    }
  };

  // === TITLE ===
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(30, 30, 60);
  doc.text(`Strategy Map: ${client.name}`, margin, y + 6);
  y += 10;

  if (client.company) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 130);
    doc.text(client.company, margin, y);
    y += 5;
  }

  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 170);
  doc.text(`Generated: ${dateStr}`, margin, y);
  y += 4;

  // Contract & Tag info
  if (client.contract_type || client.client_tag) {
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 110);
    const info = [client.contract_type, client.client_tag].filter(Boolean).join(' | ');
    doc.text(info, margin, y);
    y += 5;
  }

  // Notes
  if (client.notes) {
    y += 2;
    bodyText(client.notes);
  }

  // === DOORS & KEYS ROADMAP ===
  if (doors.length > 0) {
    sectionHeader(`Doors & Keys Roadmap (${doors.length} doors)`);

    for (const door of doors) {
      checkPage(15);
      const statusEmoji = door.status === 'completed' ? '[DONE]' : door.status === 'in_progress' ? '[IN PROGRESS]' : '[LOCKED]';

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(30, 30, 60);
      doc.text(`Door ${door.door_number}: ${door.title} ${statusEmoji}`, margin + 2, y);
      y += 5;

      if (door.description) {
        bodyText(door.description, 4);
      }

      // Keys
      const keys = door.keys ?? [];
      if (keys.length > 0) {
        for (const key of keys) {
          checkPage(5);
          const check = key.is_completed ? '[x]' : '[ ]';
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(key.is_completed ? 80 : 60, key.is_completed ? 140 : 60, key.is_completed ? 80 : 90);
          doc.text(`  ${check} Key ${key.key_number}: ${key.title}`, margin + 6, y);
          y += 4;
        }
      }
      y += 3;
    }
  }

  // === TRAINING ASSIGNMENTS ===
  if (training.length > 0) {
    sectionHeader(`Training Assignments (${training.length})`);

    for (const t of training) {
      checkPage(12);
      const statusLabel = t.status.replace('_', ' ').toUpperCase();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(30, 30, 60);
      doc.text(`${t.title} [${statusLabel}]`, margin + 2, y);
      y += 4;

      if (t.description) {
        bodyText(t.description, 4);
      }

      if (t.due_date) {
        doc.setFontSize(8);
        doc.setTextColor(150, 100, 50);
        doc.text(`Due: ${new Date(t.due_date).toLocaleDateString()}`, margin + 4, y);
        y += 4;
      }
      y += 2;
    }
  }

  // === MAP SECTIONS ===
  for (const section of sections) {
    sectionHeader(section.title || section.section_type.replace('_', ' '));

    const content = section.content || {};

    // Try to extract readable text from content JSON
    if (typeof content === 'object') {
      const entries = Object.entries(content);
      if (entries.length > 0) {
        for (const [key, val] of entries) {
          if (typeof val === 'string' && val.trim()) {
            checkPage(8);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(80, 80, 110);
            doc.text(`${key}:`, margin + 2, y);
            y += 4;
            bodyText(String(val), 4);
          } else if (Array.isArray(val)) {
            checkPage(8);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(80, 80, 110);
            doc.text(`${key}:`, margin + 2, y);
            y += 4;
            for (const item of val) {
              checkPage(4);
              bodyText(`- ${typeof item === 'string' ? item : JSON.stringify(item)}`, 4);
            }
          }
        }
      } else {
        bodyText('(Empty section)', 2);
      }
    }
    y += 2;
  }

  // Footer on last page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 200);
    doc.text(
      `Page ${i} of ${pageCount} | ${client.name} Strategy Map | Agency Board`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 5,
      { align: 'center' }
    );
  }

  const pdfBuffer = doc.output('arraybuffer');
  const filename = `${client.name.replace(/[^a-zA-Z0-9]/g, '_')}_Strategy_Map_${new Date().toISOString().split('T')[0]}.pdf`;

  return new NextResponse(Buffer.from(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
