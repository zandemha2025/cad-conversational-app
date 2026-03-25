import { useState, useEffect } from 'react';
import { fetchHardwareCatalog } from '../lib/api';
import type { HardwareCatalogItem } from '../types';

interface HardwareCatalogResult {
  items: HardwareCatalogItem[];
  loading: boolean;
  error: string | null;
}

interface Query {
  q?: string;
  category?: string;
  supplier?: string;
}

export function useHardwareCatalog(query: Query = {}): HardwareCatalogResult {
  const [items, setItems] = useState<HardwareCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchHardwareCatalog(query)
      .then((data) => { setItems(data ?? []); })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [query.q, query.category, query.supplier]);

  return { items, loading, error };
}
