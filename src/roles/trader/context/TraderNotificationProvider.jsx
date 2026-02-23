import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../../../supabase';
import { useRealtimeSubscription } from '../../../hooks/useRealtimeSubscription';

// Notification sound (base64 encoded short alert tone)
const NOTIFICATION_SOUND_URL = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2JkJSQiH94cW90goqTlpWQiYB4cW90gpCZnJmVkIiAd3FwdX+KlJuempWPh3p0c3Z8h5OdoaCdl4+Gfnd1dnyHk56joqCZk4uBenV0eIGLmKKlpqOdk4qBe3d1doGKmKOoqaadlIqDfXl3dX+JlqKpq6ignJOJgnt4dnmCjJiirKuspp6XjoZ/enh3fIeMl6GrraynopyVjYaAenl5fYWNl6Cqra2qpp+Yj4eAe3l5fIOLlZ2mqquqpqGakY2Hgn16eX2Ci5SdpairqqejoJqUj4qFgHt6e3+Ei5OcpKiqqqilo56YlI+LhoF8e3t/g4qRm6SnqKmno6CdmZWRjYmEf3t7fIGHjpagpaiop6Wjo56bmJWRjomFgX17fH+FipGaoqaoqKaloqCdmpaUkY2JhYF9fH2AhYqQmKGlp6eno6KgnpuYlZKPi4eCf3x9f4KGi5CYn6Okpaalo6GfnZqYlZKPi4eCgH5+gIKGio+Wnp+io6Ojo6KgnZuZlpOQjYqHhIB+foCBhYmOlJqeoKGio6OioJ6cmpiWk5CMioeDgYB/gYOGio6UmZyfoKGhoaGgnp2bmJaUkY6LiIWDgoGBg4WHi46TmJudn6CgoKCfnp2bmJaUko+Mi4mHhYOCgoOFh4qNkZWYm52en5+fnp6dnJqYlpSSj42LiYeGhIODhIWHiYyPk5aYmp2en5+enp2cm5mYlpWTkY+NjIqJh4aFhISFhoiJi42Pk5WXmZqbm5ubmpmYl5aUk5GQjo2LioiHhoaFhYaHiImLjY+RlJaYmZqampqamZiXlpSUkpCPjoyLiomHh4aGhoeIiYqMjpCSk5WWl5iYmJiYl5aVlJOSkZCOjYyKiomIh4eHh4iIiYqKjI2PkJGTlJWWlpaWlpWVlJOSkJCPjY2Mi4qJiYiIiImJiYqKi4yNjpCRkpOUlJWVlZWVlJOSkZCQjo2MjIuKiYmIiImJiYqKi4yNjo+QkZKTlJSUlZSUlJOSkZGQj46NjIyLioqJiYmJiYqKiosMjI2Oj5CRkpOTlJSUlJSTkpKRkI+OjoyMi4qKiomJiYqKiouLjIyNjo+QkZGSk5OTk5OTkpKRkZCPj46NjIyLi4qKiomJiYqKiouLjI2Njo+QkJGRkpKSkpKSkZGQkI+Pjo6NjIyLi4uKioqKioqKi4uMjI2Ojo+QkJGRkZKSkpKRkZCQj4+OjY2MjIuLi4qKioqKioqLi4yMjY2Ojo+PkJCRkZGRkZGRkJCQj4+OjY2MjIuLi4qKioqKiouLi4yMjY2Ojo+PkJCQkZGRkZCQkJCPj46OjY2MjIuLi4uKioqKioqLi4uMjIyNjY6Ojo+Pj5CQkJCQkJCPj4+Ojo2NjIyMi4uLioqKioqKi4uLjIyMjY2Njo6Oj4+Pj4+Pj4+Pj4+Ojo6NjY2MjIyLi4uLioqKioqLi4uLjIyMjI2NjY6Ojo6Pj4+Pj4+Ojo6OjY2NjIyMi4uLi4uKioqKiouLi4uMjIyMjY2Njo6Ojo6Ojo+Pjo6Ojo2NjY2MjIyLi4uLi4uKioqKi4uLi4yMjIyNjY2Ojo6Ojo6Ojo6Ojo2NjY2NjIyMjIuLi4uLi4uKiouLi4uMjIyMjI2NjY2Ojo6Ojo6Ojo6NjY2NjYyMjIyMi4uLi4uLi4uLi4uLjIyMjIyNjY2NjY6Ojo6Ojo6OjY2NjY2MjIyMjIuLi4uLi4uLi4uLi4yMjIyMjI2NjY2NjY2Ojo6OjY2NjY2NjYyMjIyMi4uLi4uLi4uLi4yMjIyMjIyMjI2NjY2NjY2NjY2NjY2NjIyMjIyMjIuLi4uLi4uLjIyMjIyMjIyMjI2NjY2NjY2NjY2NjY2MjIyMjIyMjIyLi4uLi4yMjIyMjIyMjIyMjIyNjY2NjY2NjY2NjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjY2NjY2NjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyM';

const TraderNotificationContext = createContext(null);

export function useTraderNotifications() {
  return useContext(TraderNotificationContext);
}

export default function TraderNotificationProvider({ children }) {
  const [traderId, setTraderId] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('traderGlobalSoundEnabled');
    return saved !== null ? saved === 'true' : true;
  });
  
  // Track seen IDs to avoid duplicate notifications
  const seenPayins = useRef(new Set(JSON.parse(localStorage.getItem('seenPayins') || '[]')));
  const seenPayouts = useRef(new Set(JSON.parse(localStorage.getItem('seenPayouts') || '[]')));
  const seenDisputes = useRef(new Set(JSON.parse(localStorage.getItem('seenDisputes') || '[]')));
  
  const audioRef = useRef(null);
  const isFirstLoad = useRef(true);

  // Initialize audio
  useEffect(() => {
    try {
      audioRef.current = new Audio(NOTIFICATION_SOUND_URL);
      audioRef.current.volume = 0.7;
    } catch (e) {
      console.warn('Could not initialize notification sound:', e);
    }
  }, []);

  // Get trader ID on mount
  useEffect(() => {
    const getTrader = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      // Get actual trader ID
      const { data: trader } = await supabase
        .from('traders')
        .select('id')
        .or(`id.eq.${user.id},profile_id.eq.${user.id}`)
        .single();
      
      setTraderId(trader?.id || user.id);
      
      // Mark first load complete after a short delay
      setTimeout(() => { isFirstLoad.current = false; }, 2000);
    };
    getTrader();
  }, []);

  // Persist sound preference
  useEffect(() => {
    localStorage.setItem('traderGlobalSoundEnabled', String(soundEnabled));
  }, [soundEnabled]);

  const playSound = useCallback(() => {
    if (!soundEnabled || !audioRef.current) return;
    try {
      const sound = audioRef.current.cloneNode();
      sound.volume = 0.7;
      sound.play().catch(e => console.warn('Could not play sound:', e));
    } catch (e) {
      console.warn('Sound play error:', e);
    }
  }, [soundEnabled]);

  const saveSeen = useCallback((key, setRef) => {
    const arr = [...setRef.current];
    if (arr.length > 500) {
      setRef.current = new Set(arr.slice(-500));
    }
    localStorage.setItem(key, JSON.stringify([...setRef.current]));
  }, []);

  // Check for new items and play sound
  const checkNewItems = useCallback((items, seenRef, storageKey, statusField = 'status', targetStatus = 'pending') => {
    if (isFirstLoad.current) return false;
    
    const targetItems = items.filter(item => item[statusField] === targetStatus);
    let hasNew = false;
    
    for (const item of targetItems) {
      if (!seenRef.current.has(item.id)) {
        hasNew = true;
        seenRef.current.add(item.id);
      }
    }
    
    if (hasNew) {
      playSound();
      saveSeen(storageKey, seenRef);
    }
    
    return hasNew;
  }, [playSound, saveSeen]);

  // Global realtime subscriptions
  useRealtimeSubscription('payins', {
    enabled: !!traderId,
    onChange: async (eventType, payload) => {
      if (!traderId || isFirstLoad.current) return;
      
      const newRecord = payload?.new;
      if (newRecord?.trader_id === traderId && newRecord?.status === 'pending') {
        if (!seenPayins.current.has(newRecord.id)) {
          console.log('🔔 New payin notification:', newRecord.id);
          seenPayins.current.add(newRecord.id);
          playSound();
          saveSeen('seenPayins', seenPayins);
        }
      }
    },
  });

  useRealtimeSubscription('payouts', {
    enabled: !!traderId,
    onChange: async (eventType, payload) => {
      if (!traderId || isFirstLoad.current) return;
      
      const newRecord = payload?.new;
      if (newRecord?.trader_id === traderId && newRecord?.status === 'assigned') {
        if (!seenPayouts.current.has(newRecord.id)) {
          console.log('🔔 New payout notification:', newRecord.id);
          seenPayouts.current.add(newRecord.id);
          playSound();
          saveSeen('seenPayouts', seenPayouts);
        }
      }
    },
  });

  useRealtimeSubscription('disputes', {
    enabled: !!traderId,
    onChange: async (eventType, payload) => {
      if (!traderId || isFirstLoad.current) return;
      
      const newRecord = payload?.new;
      const needsAttention = newRecord?.status === 'pending' || newRecord?.status === 'routed_to_trader';
      
      if (newRecord?.trader_id === traderId && needsAttention) {
        if (!seenDisputes.current.has(newRecord.id)) {
          console.log('🔔 New dispute notification:', newRecord.id);
          seenDisputes.current.add(newRecord.id);
          playSound();
          saveSeen('seenDisputes', seenDisputes);
        }
      }
    },
  });

  const value = {
    soundEnabled,
    setSoundEnabled,
    playSound,
    traderId,
  };

  return (
    <TraderNotificationContext.Provider value={value}>
      {children}
    </TraderNotificationContext.Provider>
  );
}
