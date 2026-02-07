/**
 * Supabase Realtime Subscription Hook
 * Provides live updates for any table
 */

import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabase';

/**
 * Subscribe to realtime changes on a table
 * @param {string} table - Table name to subscribe to
 * @param {object} options - Configuration options
 * @param {function} options.onInsert - Callback when row inserted
 * @param {function} options.onUpdate - Callback when row updated
 * @param {function} options.onDelete - Callback when row deleted
 * @param {function} options.onChange - Callback for any change (receives event type + payload)
 * @param {string} options.filter - Optional filter (e.g., 'merchant_id=eq.abc123')
 * @param {boolean} options.enabled - Whether subscription is active (default: true)
 */
export function useRealtimeSubscription(table, options = {}) {
  const {
    onInsert,
    onUpdate,
    onDelete,
    onChange,
    filter,
    enabled = true,
  } = options;

  const channelRef = useRef(null);

  useEffect(() => {
    if (!enabled || !table) return;

    // Create unique channel name
    const channelName = `realtime:${table}:${filter || 'all'}:${Date.now()}`;

    // Build channel configuration
    let channelConfig = supabase.channel(channelName);

    // Subscribe to postgres changes
    const subscriptionConfig = {
      event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
      schema: 'public',
      table: table,
    };

    // Add filter if provided
    if (filter) {
      subscriptionConfig.filter = filter;
    }

    channelConfig = channelConfig.on(
      'postgres_changes',
      subscriptionConfig,
      (payload) => {
        const { eventType, new: newRecord, old: oldRecord } = payload;

        // Call specific handlers
        if (eventType === 'INSERT' && onInsert) {
          onInsert(newRecord);
        } else if (eventType === 'UPDATE' && onUpdate) {
          onUpdate(newRecord, oldRecord);
        } else if (eventType === 'DELETE' && onDelete) {
          onDelete(oldRecord);
        }

        // Call generic onChange handler
        if (onChange) {
          onChange(eventType, payload);
        }
      }
    );

    // Subscribe
    channelConfig.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`📡 Realtime subscribed to ${table}`);
      } else if (status === 'CHANNEL_ERROR') {
        console.error(`❌ Realtime error on ${table}`);
      }
    });

    channelRef.current = channelConfig;

    // Cleanup on unmount
    return () => {
      if (channelRef.current) {
        console.log(`🔌 Unsubscribing from ${table}`);
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [table, filter, enabled, onInsert, onUpdate, onDelete, onChange]);

  // Return unsubscribe function for manual control
  const unsubscribe = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  return { unsubscribe };
}

/**
 * Subscribe to multiple tables at once
 * @param {Array} subscriptions - Array of {table, options} objects
 */
export function useMultipleRealtimeSubscriptions(subscriptions) {
  const channelsRef = useRef([]);

  useEffect(() => {
    if (!subscriptions || subscriptions.length === 0) return;

    // Create channels for each subscription
    subscriptions.forEach(({ table, options = {} }) => {
      const { onInsert, onUpdate, onDelete, onChange, filter, enabled = true } = options;
      
      if (!enabled) return;

      const channelName = `realtime:${table}:${filter || 'all'}:${Date.now()}`;
      let channel = supabase.channel(channelName);

      const subscriptionConfig = {
        event: '*',
        schema: 'public',
        table: table,
      };

      if (filter) {
        subscriptionConfig.filter = filter;
      }

      channel = channel.on('postgres_changes', subscriptionConfig, (payload) => {
        const { eventType, new: newRecord, old: oldRecord } = payload;

        if (eventType === 'INSERT' && onInsert) onInsert(newRecord);
        else if (eventType === 'UPDATE' && onUpdate) onUpdate(newRecord, oldRecord);
        else if (eventType === 'DELETE' && onDelete) onDelete(oldRecord);

        if (onChange) onChange(eventType, payload);
      });

      channel.subscribe();
      channelsRef.current.push(channel);
    });

    return () => {
      channelsRef.current.forEach((channel) => {
        supabase.removeChannel(channel);
      });
      channelsRef.current = [];
    };
  }, [subscriptions]);
}

/**
 * Simple hook for live count updates
 * @param {string} table - Table name
 * @param {function} refetchFn - Function to refetch data when changes occur
 */
export function useRealtimeRefresh(table, refetchFn, options = {}) {
  const { filter, debounceMs = 500, enabled = true } = options;
  const timeoutRef = useRef(null);

  const debouncedRefetch = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      refetchFn();
    }, debounceMs);
  }, [refetchFn, debounceMs]);

  useRealtimeSubscription(table, {
    onChange: debouncedRefetch,
    filter,
    enabled,
  });

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
}

export default useRealtimeSubscription;
