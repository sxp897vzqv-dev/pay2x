import { useEffect } from 'react';
import { supabase } from '../supabase';

/**
 * Subscribe to Supabase Realtime changes on a table.
 * Calls `onUpdate` whenever an INSERT, UPDATE, or DELETE happens.
 * 
 * @param {string} table - Table name (e.g. 'payins')
 * @param {Function} onUpdate - Callback when data changes (receives payload)
 * @param {Object} [options] - Optional filter config
 * @param {string} [options.event] - 'INSERT'|'UPDATE'|'DELETE'|'*' (default: '*')
 * @param {string} [options.filter] - PostgREST-style filter (e.g. 'status=eq.pending')
 * @param {boolean} [options.enabled] - Enable/disable subscription (default: true)
 */
export function useRealtimeSubscription(table, onUpdate, options = {}) {
  const { event = '*', filter, enabled = true } = options;

  useEffect(() => {
    if (!enabled || !table) return;

    const channelName = `realtime-${table}-${Date.now()}`;
    const channelConfig = {
      event,
      schema: 'public',
      table,
    };

    if (filter) {
      channelConfig.filter = filter;
    }

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', channelConfig, (payload) => {
        console.log(`🔄 Realtime [${table}]:`, payload.eventType, payload.new?.id || '');
        onUpdate(payload);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`📡 Subscribed to ${table} changes`);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, event, filter, enabled]);
}

/**
 * Subscribe to multiple tables at once.
 * Calls `onUpdate` for any change on any of the listed tables.
 * 
 * @param {string[]} tables - Array of table names
 * @param {Function} onUpdate - Callback when data changes
 * @param {boolean} [enabled] - Enable/disable
 */
export function useRealtimeMulti(tables, onUpdate, enabled = true) {
  useEffect(() => {
    if (!enabled || !tables?.length) return;

    const channelName = `realtime-multi-${tables.join('-')}-${Date.now()}`;
    let channel = supabase.channel(channelName);

    for (const table of tables) {
      channel = channel.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table,
      }, (payload) => {
        console.log(`🔄 Realtime [${table}]:`, payload.eventType);
        onUpdate(payload, table);
      });
    }

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`📡 Subscribed to [${tables.join(', ')}] changes`);
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tables?.join(','), enabled]);
}
