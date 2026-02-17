import { describe, it, expect } from 'vitest';
import { mapTrelloColor, inferPriority } from '@/lib/trello-migration';
import type { TrelloCard, TrelloLabel } from '@/lib/types';

// ---------------------------------------------------------------------------
// Helpers to build mock objects
// ---------------------------------------------------------------------------

function makeTrelloCard(overrides: Partial<TrelloCard> = {}): TrelloCard {
  return {
    id: 'card-1',
    name: 'Test Card',
    desc: '',
    pos: 1,
    due: null,
    closed: false,
    idList: 'list-1',
    idBoard: 'board-1',
    idLabels: [],
    idMembers: [],
    idChecklists: [],
    idAttachmentCover: null,
    ...overrides,
  };
}

function makeTrelloLabel(overrides: Partial<TrelloLabel> = {}): TrelloLabel {
  return {
    id: 'label-1',
    name: '',
    color: 'green',
    idBoard: 'board-1',
    ...overrides,
  };
}

// ===========================================================================
// mapTrelloColor
// ===========================================================================

describe('mapTrelloColor', () => {
  it("maps 'green' to '#10b981'", () => {
    expect(mapTrelloColor('green')).toBe('#10b981');
  });

  it("maps 'red' to '#ef4444'", () => {
    expect(mapTrelloColor('red')).toBe('#ef4444');
  });

  it("maps 'blue' to '#3b82f6'", () => {
    expect(mapTrelloColor('blue')).toBe('#3b82f6');
  });

  it("maps 'purple' to '#8b5cf6'", () => {
    expect(mapTrelloColor('purple')).toBe('#8b5cf6');
  });

  it("maps 'yellow' to '#f59e0b'", () => {
    expect(mapTrelloColor('yellow')).toBe('#f59e0b');
  });

  it("maps 'orange' to '#f97316'", () => {
    expect(mapTrelloColor('orange')).toBe('#f97316');
  });

  it("maps 'pink' to '#ec4899'", () => {
    expect(mapTrelloColor('pink')).toBe('#ec4899');
  });

  it("maps 'black' to '#1e293b'", () => {
    expect(mapTrelloColor('black')).toBe('#1e293b');
  });

  it("maps unknown color to default '#94a3b8'", () => {
    expect(mapTrelloColor('magenta')).toBe('#94a3b8');
    expect(mapTrelloColor('teal')).toBe('#94a3b8');
  });

  it("maps empty string to default '#94a3b8'", () => {
    expect(mapTrelloColor('')).toBe('#94a3b8');
  });
});

// ===========================================================================
// inferPriority
// ===========================================================================

describe('inferPriority', () => {
  it("returns 'urgent' when card has label named 'Urgent'", () => {
    const label = makeTrelloLabel({ id: 'l-1', name: 'Urgent', color: 'red' });
    const card = makeTrelloCard({ idLabels: ['l-1'] });
    expect(inferPriority(card, [label])).toBe('urgent');
  });

  it("returns 'urgent' when card has label named 'Critical'", () => {
    const label = makeTrelloLabel({ id: 'l-1', name: 'Critical', color: 'red' });
    const card = makeTrelloCard({ idLabels: ['l-1'] });
    expect(inferPriority(card, [label])).toBe('urgent');
  });

  it("returns 'high' when card has label named 'High Priority'", () => {
    const label = makeTrelloLabel({ id: 'l-1', name: 'High Priority', color: 'orange' });
    const card = makeTrelloCard({ idLabels: ['l-1'] });
    expect(inferPriority(card, [label])).toBe('high');
  });

  it("returns 'medium' when card has label named 'Medium'", () => {
    const label = makeTrelloLabel({ id: 'l-1', name: 'Medium', color: 'yellow' });
    const card = makeTrelloCard({ idLabels: ['l-1'] });
    expect(inferPriority(card, [label])).toBe('medium');
  });

  it("returns 'low' when card has label named 'Low'", () => {
    const label = makeTrelloLabel({ id: 'l-1', name: 'Low', color: 'blue' });
    const card = makeTrelloCard({ idLabels: ['l-1'] });
    expect(inferPriority(card, [label])).toBe('low');
  });

  it("returns 'none' when no priority labels exist", () => {
    const label = makeTrelloLabel({ id: 'l-1', name: 'Bug', color: 'green' });
    const card = makeTrelloCard({ idLabels: ['l-1'] });
    expect(inferPriority(card, [label])).toBe('none');
  });

  it("returns 'none' when card has no labels at all", () => {
    const card = makeTrelloCard({ idLabels: [] });
    expect(inferPriority(card, [])).toBe('none');
  });

  it('is case-insensitive', () => {
    const label = makeTrelloLabel({ id: 'l-1', name: 'URGENT', color: 'red' });
    const card = makeTrelloCard({ idLabels: ['l-1'] });
    expect(inferPriority(card, [label])).toBe('urgent');

    const label2 = makeTrelloLabel({ id: 'l-2', name: 'high priority', color: 'orange' });
    const card2 = makeTrelloCard({ idLabels: ['l-2'] });
    expect(inferPriority(card2, [label2])).toBe('high');

    const label3 = makeTrelloLabel({ id: 'l-3', name: 'mEdIuM', color: 'yellow' });
    const card3 = makeTrelloCard({ idLabels: ['l-3'] });
    expect(inferPriority(card3, [label3])).toBe('medium');
  });

  it('first match wins (urgent > high > medium > low)', () => {
    const urgentLabel = makeTrelloLabel({ id: 'l-1', name: 'Urgent', color: 'red' });
    const highLabel = makeTrelloLabel({ id: 'l-2', name: 'High', color: 'orange' });
    const mediumLabel = makeTrelloLabel({ id: 'l-3', name: 'Medium', color: 'yellow' });
    const lowLabel = makeTrelloLabel({ id: 'l-4', name: 'Low', color: 'blue' });
    const allLabels = [urgentLabel, highLabel, mediumLabel, lowLabel];

    // Card with all priority labels: urgent should win
    const card1 = makeTrelloCard({ idLabels: ['l-1', 'l-2', 'l-3', 'l-4'] });
    expect(inferPriority(card1, allLabels)).toBe('urgent');

    // Card with high, medium, low: high should win
    const card2 = makeTrelloCard({ idLabels: ['l-2', 'l-3', 'l-4'] });
    expect(inferPriority(card2, allLabels)).toBe('high');

    // Card with medium and low: medium should win
    const card3 = makeTrelloCard({ idLabels: ['l-3', 'l-4'] });
    expect(inferPriority(card3, allLabels)).toBe('medium');
  });

  it('only considers labels that belong to the card', () => {
    const urgentLabel = makeTrelloLabel({ id: 'l-1', name: 'Urgent', color: 'red' });
    const lowLabel = makeTrelloLabel({ id: 'l-2', name: 'Low', color: 'blue' });
    const allLabels = [urgentLabel, lowLabel];

    // Card only has the 'Low' label, even though 'Urgent' exists on the board
    const card = makeTrelloCard({ idLabels: ['l-2'] });
    expect(inferPriority(card, allLabels)).toBe('low');
  });
});
