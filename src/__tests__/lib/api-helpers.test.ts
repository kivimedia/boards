import { describe, it, expect } from 'vitest';
import { successResponse, errorResponse } from '@/lib/api-helpers';

describe('api-helpers', () => {
  describe('successResponse', () => {
    it('returns JSON response with data wrapper and 200 status', async () => {
      const response = successResponse({ id: '123', name: 'Test' });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ data: { id: '123', name: 'Test' } });
    });

    it('supports custom status codes', async () => {
      const response = successResponse({ created: true }, 201);

      expect(response.status).toBe(201);
    });

    it('handles null data', async () => {
      const response = successResponse(null);
      const body = await response.json();

      expect(body).toEqual({ data: null });
    });
  });

  describe('errorResponse', () => {
    it('returns JSON response with error message and 400 status by default', async () => {
      const response = errorResponse('Something went wrong');
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body).toEqual({ error: 'Something went wrong' });
    });

    it('supports custom status codes', async () => {
      const response = errorResponse('Not found', 404);

      expect(response.status).toBe(404);
    });

    it('supports 500 server errors', async () => {
      const response = errorResponse('Internal error', 500);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body).toEqual({ error: 'Internal error' });
    });
  });
});
