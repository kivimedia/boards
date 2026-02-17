import { describe, it, expect } from 'vitest';
import type {
  BrainDocSourceType,
  ClientBrainDocument,
  ClientBrainQuery,
  BrainSearchResult,
} from '../../lib/types';

describe('AI Brain Types (P2.5)', () => {
  // ===========================================================================
  // BrainDocSourceType — covers all 5 values
  // ===========================================================================

  describe('BrainDocSourceType', () => {
    it('covers all 5 source type values', () => {
      const values: BrainDocSourceType[] = [
        'card',
        'comment',
        'brief',
        'attachment',
        'manual',
      ];

      expect(values).toHaveLength(5);
      expect(values).toContain('card');
      expect(values).toContain('comment');
      expect(values).toContain('brief');
      expect(values).toContain('attachment');
      expect(values).toContain('manual');
    });

    it('each value is a valid string', () => {
      const values: BrainDocSourceType[] = ['card', 'comment', 'brief', 'attachment', 'manual'];
      for (const val of values) {
        expect(typeof val).toBe('string');
        expect(val.length).toBeGreaterThan(0);
      }
    });
  });

  // ===========================================================================
  // ClientBrainDocument — required fields
  // ===========================================================================

  describe('ClientBrainDocument', () => {
    it('has all required fields', () => {
      const doc: ClientBrainDocument = {
        id: 'doc-001',
        client_id: 'client-123',
        source_type: 'card',
        source_id: 'card-456',
        title: 'Homepage Redesign',
        content: 'Detailed content about the homepage redesign project.',
        chunk_index: 0,
        metadata: { sprint: 3 },
        is_active: true,
        created_at: '2025-01-15T10:00:00Z',
        updated_at: '2025-01-15T10:00:00Z',
      };

      expect(doc.id).toBe('doc-001');
      expect(doc.client_id).toBe('client-123');
      expect(doc.source_type).toBe('card');
      expect(doc.source_id).toBe('card-456');
      expect(doc.title).toBe('Homepage Redesign');
      expect(doc.content).toContain('homepage redesign');
      expect(doc.chunk_index).toBe(0);
      expect(doc.metadata).toEqual({ sprint: 3 });
      expect(doc.is_active).toBe(true);
      expect(doc.created_at).toBe('2025-01-15T10:00:00Z');
      expect(doc.updated_at).toBe('2025-01-15T10:00:00Z');
    });

    it('allows null source_id', () => {
      const doc: ClientBrainDocument = {
        id: 'doc-002',
        client_id: 'client-789',
        source_type: 'manual',
        source_id: null,
        title: 'Manual Entry',
        content: 'Manually indexed content.',
        chunk_index: 0,
        metadata: {},
        is_active: true,
        created_at: '2025-02-01T12:00:00Z',
        updated_at: '2025-02-01T12:00:00Z',
      };

      expect(doc.source_id).toBeNull();
      expect(doc.source_type).toBe('manual');
    });
  });

  // ===========================================================================
  // ClientBrainQuery — required fields
  // ===========================================================================

  describe('ClientBrainQuery', () => {
    it('has all required fields', () => {
      const query: ClientBrainQuery = {
        id: 'query-001',
        client_id: 'client-123',
        user_id: 'user-456',
        query: 'What are the brand guidelines?',
        response: 'The brand uses navy and electric blue colors.',
        confidence: 0.85,
        sources: [
          { document_id: 'doc-001', title: 'Brand Guide', similarity: 0.92 },
        ],
        model_used: 'claude-sonnet-4-20250514',
        input_tokens: 250,
        output_tokens: 80,
        latency_ms: 1200,
        created_at: '2025-01-20T14:30:00Z',
      };

      expect(query.id).toBe('query-001');
      expect(query.client_id).toBe('client-123');
      expect(query.user_id).toBe('user-456');
      expect(query.query).toBe('What are the brand guidelines?');
      expect(query.response).toContain('navy');
      expect(query.confidence).toBe(0.85);
      expect(query.sources).toHaveLength(1);
      expect(query.model_used).toBe('claude-sonnet-4-20250514');
      expect(query.input_tokens).toBe(250);
      expect(query.output_tokens).toBe(80);
      expect(query.latency_ms).toBe(1200);
      expect(query.created_at).toBe('2025-01-20T14:30:00Z');
    });

    it('allows null model_used', () => {
      const query: ClientBrainQuery = {
        id: 'query-002',
        client_id: 'client-789',
        user_id: 'user-abc',
        query: 'Summarize recent projects',
        response: 'No relevant documents found.',
        confidence: 0.1,
        sources: [],
        model_used: null,
        input_tokens: 50,
        output_tokens: 20,
        latency_ms: 300,
        created_at: '2025-02-10T09:00:00Z',
      };

      expect(query.model_used).toBeNull();
      expect(query.sources).toHaveLength(0);
    });

    it('sources contain document_id, title, and similarity', () => {
      const query: ClientBrainQuery = {
        id: 'query-003',
        client_id: 'client-123',
        user_id: 'user-456',
        query: 'Test query',
        response: 'Test response',
        confidence: 0.7,
        sources: [
          { document_id: 'doc-a', title: 'Doc A', similarity: 0.9 },
          { document_id: 'doc-b', title: 'Doc B', similarity: 0.75 },
        ],
        model_used: 'test-model',
        input_tokens: 100,
        output_tokens: 50,
        latency_ms: 500,
        created_at: '2025-03-01T00:00:00Z',
      };

      expect(query.sources[0].document_id).toBe('doc-a');
      expect(query.sources[0].title).toBe('Doc A');
      expect(query.sources[0].similarity).toBe(0.9);
      expect(query.sources[1].document_id).toBe('doc-b');
    });
  });

  // ===========================================================================
  // BrainSearchResult — required fields
  // ===========================================================================

  describe('BrainSearchResult', () => {
    it('has all required fields', () => {
      const result: BrainSearchResult = {
        document_id: 'doc-001',
        title: 'Brand Guidelines v2',
        content: 'Primary color: #0f172a (navy). Accent: #6366f1 (electric).',
        similarity: 0.94,
        source_type: 'brief',
        metadata: { version: 2, approved: true },
      };

      expect(result.document_id).toBe('doc-001');
      expect(result.title).toBe('Brand Guidelines v2');
      expect(result.content).toContain('#0f172a');
      expect(result.similarity).toBe(0.94);
      expect(result.source_type).toBe('brief');
      expect(result.metadata).toEqual({ version: 2, approved: true });
    });

    it('similarity is between 0 and 1', () => {
      const result: BrainSearchResult = {
        document_id: 'doc-002',
        title: 'Test Doc',
        content: 'Test content',
        similarity: 0.72,
        source_type: 'card',
        metadata: {},
      };

      expect(result.similarity).toBeGreaterThanOrEqual(0);
      expect(result.similarity).toBeLessThanOrEqual(1);
    });

    it('source_type is a valid BrainDocSourceType', () => {
      const validTypes: BrainDocSourceType[] = ['card', 'comment', 'brief', 'attachment', 'manual'];

      const result: BrainSearchResult = {
        document_id: 'doc-003',
        title: 'Attachment Doc',
        content: 'File content',
        similarity: 0.8,
        source_type: 'attachment',
        metadata: {},
      };

      expect(validTypes).toContain(result.source_type);
    });
  });
});
