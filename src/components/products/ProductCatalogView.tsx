'use client';

import { useState, useEffect, useCallback } from 'react';

interface Product {
  id: string;
  name: string;
  category: string;
  base_price: number | null;
  size_variants: Record<string, unknown> | null;
  color_options: Record<string, unknown> | null;
  is_active: boolean;
  frequency_count: number;
  notes: string | null;
  created_at: string;
}

const CATEGORIES = [
  { value: 'arch', label: 'Arch' },
  { value: 'bouquet', label: 'Bouquet' },
  { value: 'wall', label: 'Wall' },
  { value: 'banner', label: 'Banner' },
  { value: 'garland', label: 'Garland' },
  { value: 'centerpiece', label: 'Centerpiece' },
  { value: 'marquee_letter', label: 'Marquee Letter' },
  { value: 'other', label: 'Other' },
];

export default function ProductCatalogView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('');

  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState('other');
  const [basePrice, setBasePrice] = useState('');
  const [notes, setNotes] = useState('');

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/products');
      const json = await res.json();
      if (json.ok) setProducts(json.data || []);
    } catch (err) {
      console.error('Failed to fetch products:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const resetForm = () => {
    setName('');
    setCategory('other');
    setBasePrice('');
    setNotes('');
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      name,
      category,
      base_price: basePrice ? parseFloat(basePrice) : null,
      notes: notes || null,
    };

    try {
      if (editingId) {
        await fetch(`/api/products/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      resetForm();
      fetchProducts();
    } catch (err) {
      console.error('Save failed:', err);
    }
  };

  const handleEdit = (product: Product) => {
    setName(product.name);
    setCategory(product.category);
    setBasePrice(product.base_price?.toString() || '');
    setNotes(product.notes || '');
    setEditingId(product.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this product?')) return;
    try {
      await fetch(`/api/products/${id}`, { method: 'DELETE' });
      fetchProducts();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleToggleActive = async (product: Product) => {
    try {
      await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !product.is_active }),
      });
      fetchProducts();
    } catch (err) {
      console.error('Toggle failed:', err);
    }
  };

  const filtered = filterCategory
    ? products.filter((p) => p.category === filterCategory)
    : products;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2 text-sm border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {filtered.length} product{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 text-sm font-medium transition-colors"
        >
          Add Product
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="border rounded-lg p-4 dark:border-gray-700 bg-white dark:bg-gray-800/50 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Product name"
              required
              className="px-3 py-2 text-sm border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="px-3 py-2 text-sm border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <input
              type="number"
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
              placeholder="Base price ($)"
              step="0.01"
              min="0"
              className="px-3 py-2 text-sm border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
            />
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="px-3 py-2 text-sm border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">
              {editingId ? 'Update' : 'Add'}
            </button>
            <button type="button" onClick={resetForm} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Product Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500" />
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Product</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Category</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Base Price</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Used</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Active</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
              {filtered.map((product) => (
                <tr key={product.id} className={!product.is_active ? 'opacity-50' : ''}>
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{product.name}</span>
                    {product.notes && (
                      <span className="block text-xs text-gray-400 mt-0.5">{product.notes}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 capitalize">
                    {product.category.replace('_', ' ')}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">
                    {product.base_price ? `$${product.base_price.toLocaleString()}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">
                    {product.frequency_count}x
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggleActive(product)}
                      className={`w-8 h-5 rounded-full transition-colors ${
                        product.is_active ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span
                        className={`block w-3.5 h-3.5 rounded-full bg-white shadow transform transition-transform ${
                          product.is_active ? 'translate-x-3.5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleEdit(product)}
                      className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 mr-2"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(product.id)}
                      className="text-xs text-red-600 hover:text-red-700 dark:text-red-400"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    No products found. Add your first product above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
