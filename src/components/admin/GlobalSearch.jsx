import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabase';
import { Search, Users, Store, TrendingUp, TrendingDown, AlertCircle, X, Loader2 } from 'lucide-react';

const SEARCH_CONFIGS = [
  {
    key: 'traders',
    label: 'Traders',
    icon: Users,
    table: 'traders',
    searchFields: ['name', 'email', 'phone'],
    getRoute: (id) => `/admin/traders/${id}`,
    getTitle: (doc) => doc.name || doc.email || doc.id,
    getSubtitle: (doc) => doc.email || doc.phone || '',
  },
  {
    key: 'merchants',
    label: 'Merchants',
    icon: Store,
    table: 'merchants',
    searchFields: ['name', 'email', 'business_name'],
    getRoute: (id) => `/admin/merchants/${id}`,
    getTitle: (doc) => doc.business_name || doc.name || doc.email || doc.id,
    getSubtitle: (doc) => doc.email || '',
  },
  {
    key: 'payins',
    label: 'Payins',
    icon: TrendingUp,
    table: 'payins',
    searchFields: ['transaction_id', 'utr', 'order_id'],
    getRoute: (id) => `/admin/payins`,
    getTitle: (doc) => doc.transaction_id || doc.id,
    getSubtitle: (doc) => doc.utr ? `UTR: ${doc.utr}` : `₹${doc.amount || ''}`,
  },
  {
    key: 'payouts',
    label: 'Payouts',
    icon: TrendingDown,
    table: 'payouts',
    searchFields: ['id', 'payout_id', 'utr'],
    getRoute: (id) => `/admin/payouts`,
    getTitle: (doc) => doc.payout_id || doc.id,
    getSubtitle: (doc) => doc.utr ? `UTR: ${doc.utr}` : `₹${doc.amount || ''}`,
  },
  {
    key: 'disputes',
    label: 'Disputes',
    icon: AlertCircle,
    table: 'disputes',
    searchFields: ['id', 'transaction_id', 'dispute_id'],
    getRoute: (id) => `/admin/disputes`,
    getTitle: (doc) => doc.transaction_id || doc.dispute_id || doc.id,
    getSubtitle: (doc) => doc.status || '',
  },
];

export default function GlobalSearch({ isOpen, onClose }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const debounceRef = useRef(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setResults({});
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const performSearch = useCallback(async (term) => {
    if (!term || term.length < 2) {
      setResults({});
      setLoading(false);
      return;
    }

    setLoading(true);
    const lowerTerm = term.toLowerCase();
    const newResults = {};

    try {
      const promises = SEARCH_CONFIGS.map(async (config) => {
        try {
          // Build OR filter for text search across fields
          const orFilters = config.searchFields
            .map(f => `${f}.ilike.%${lowerTerm}%`)
            .join(',');
          const { data } = await supabase
            .from(config.table)
            .select('*')
            .or(orFilters)
            .order('created_at', { ascending: false })
            .limit(5);
          if (data?.length > 0) {
            newResults[config.key] = data;
          }
        } catch (err) {
          console.warn(`Search error for ${config.table}:`, err);
        }
      });

      await Promise.all(promises);
      setResults(newResults);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setSearchTerm(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => performSearch(val), 400);
  };

  const handleResultClick = (route) => {
    navigate(route);
    onClose();
  };

  if (!isOpen) return null;

  const hasResults = Object.keys(results).length > 0;
  const hasSearched = searchTerm.length >= 2;

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <Search className="w-5 h-5 text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            autoFocus
            type="text"
            value={searchTerm}
            onChange={handleInputChange}
            placeholder="Search traders, merchants, transactions..."
            className="flex-1 bg-transparent outline-none text-sm text-slate-900 dark:text-white placeholder:text-slate-400"
          />
          {loading && <Loader2 className="w-4 h-4 text-slate-400 animate-spin flex-shrink-0" />}
          <kbd className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto p-2">
          {!hasSearched && !loading && (
            <div className="text-center py-8 text-sm text-slate-400">
              Type at least 2 characters to search…
            </div>
          )}

          {hasSearched && !loading && !hasResults && (
            <div className="text-center py-8 text-sm text-slate-400">
              No results found for "{searchTerm}"
            </div>
          )}

          {hasResults && SEARCH_CONFIGS.map((config) => {
            const items = results[config.key];
            if (!items || items.length === 0) return null;
            const Icon = config.icon;
            return (
              <div key={config.key} className="mb-2">
                <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  <Icon className="w-3.5 h-3.5" />
                  {config.label}
                </div>
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleResultClick(config.getRoute(item.id))}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {config.getTitle(item)}
                      </div>
                      {config.getSubtitle(item) && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {config.getSubtitle(item)}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
