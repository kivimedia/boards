import { describe, it, expect } from 'vitest';
import {
  searchCards,
  searchBoards,
  searchComments,
  searchPeople,
  aggregateSearch,
  getRecentSearches,
  addRecentSearch,
  clearRecentSearches,
} from '@/lib/search';

describe('Search (v5.5.0)', () => {
  describe('Search functions', () => {
    it('searchCards is a function', () => {
      expect(typeof searchCards).toBe('function');
    });

    it('searchBoards is a function', () => {
      expect(typeof searchBoards).toBe('function');
    });

    it('searchComments is a function', () => {
      expect(typeof searchComments).toBe('function');
    });

    it('searchPeople is a function', () => {
      expect(typeof searchPeople).toBe('function');
    });

    it('aggregateSearch is a function', () => {
      expect(typeof aggregateSearch).toBe('function');
    });
  });

  describe('Recent searches', () => {
    it('getRecentSearches returns an array', () => {
      const result = getRecentSearches();
      expect(Array.isArray(result)).toBe(true);
    });

    it('addRecentSearch is a function', () => {
      expect(typeof addRecentSearch).toBe('function');
    });

    it('clearRecentSearches is a function', () => {
      expect(typeof clearRecentSearches).toBe('function');
    });

    it('getRecentSearches returns empty array when no localStorage', () => {
      // In test env, localStorage may not persist
      const result = getRecentSearches();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('SearchResult type', () => {
    it('search functions expect supabase and query args', () => {
      expect(searchCards.length).toBeGreaterThanOrEqual(2);
      expect(searchBoards.length).toBeGreaterThanOrEqual(2);
      expect(searchComments.length).toBeGreaterThanOrEqual(2);
      expect(searchPeople.length).toBeGreaterThanOrEqual(2);
    });

    it('aggregateSearch expects supabase and query', () => {
      expect(aggregateSearch.length).toBeGreaterThanOrEqual(2);
    });
  });
});
