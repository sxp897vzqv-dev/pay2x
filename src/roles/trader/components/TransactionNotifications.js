/* ─── Transaction Notification Sound Helper ─── */

// Notification sound (base64 encoded short alert tone)
const NOTIFICATION_SOUND_URL = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2JkJSQiH94cW90goqTlpWQiYB4cW90gpCZnJmVkIiAd3FwdX+KlJuempWPh3p0c3Z8h5OdoaCdl4+Gfnd1dnyHk56joqCZk4uBenV0eIGLmKKlpqOdk4qBe3d1doGKmKOoqaadlIqDfXl3dX+JlqKpq6ignJOJgnt4dnmCjJiirKuspp6XjoZ/enh3fIeMl6GrraynopyVjYaAenl5fYWNl6Cqra2qpp+Yj4eAe3l5fIOLlZ2mqquqpqGakY2Hgn16eX2Ci5SdpairqqejoJqUj4qFgHt6e3+Ei5OcpKiqqqilo56YlI+LhoF8e3t/g4qRm6SnqKmno6CdmZWRjYmEf3t7fIGHjpagpaiop6Wjo56bmJWRjomFgX17fH+FipGaoqaoqKaloqCdmpaUkY2JhYF9fH2AhYqQmKGlp6eno6KgnpuYlZKPi4eCf3x9f4KGi5CYn6Okpaalo6GfnZqYlZKPi4eCgH5+gIKGio+Wnp+io6Ojo6KgnZuZlpOQjYqHhIB+foCBhYmOlJqeoKGio6OioJ6cmpiWk5CMioeDgYB/gYOGio6UmZyfoKGhoaGgnp2bmJaUkY6LiIWDgoGBg4WHi46TmJudn6CgoKCfnp2bmJaUko+Mi4mHhYOCgoOFh4qNkZWYm52en5+fnp6dnJqYlpSSj42LiYeGhIODhIWHiYyPk5aYmp2en5+enp2cm5mYlpWTkY+NjIqJh4aFhISFhoiJi42Pk5WXmZqbm5ubmpmYl5aUk5GQjo2LioiHhoaFhYaHiImLjY+RlJaYmZqampqamZiXlpSUkpCPjoyLiomHh4aGhoeIiYqMjpCSk5WWl5iYmJiYl5aVlJOSkZCOjYyKiomIh4eHh4iIiYqKjI2PkJGTlJWWlpaWlpWVlJOSkJCPjY2Mi4qJiYiIiImJiYqKi4yNjpCRkpOUlJWVlZWVlJOSkZCQjo2MjIuKiYmIiImJiYqKi4yNjo+QkZKTlJSUlZSUlJOSkZGQj46NjIyLioqJiYmJiYqKiosMjI2Oj5CRkpOTlJSUlJSTkpKRkI+OjoyMi4qKiomJiYqKiouLjIyNjo+QkZGSk5OTk5OTkpKRkZCPj46NjIyLi4qKiomJiYqKiouLjI2Njo+QkJGRkpKSkpKSkZGQkI+Pjo6NjIyLi4uKioqKioqKi4uMjI2Ojo+QkJGRkZKSkpKRkZCQj4+OjY2MjIuLi4qKioqKioqLi4yMjY2Ojo+PkJCRkZGRkZGRkJCQj4+OjY2MjIuLi4qKioqKiouLi4yMjY2Ojo+PkJCQkZGRkZCQkJCPj46OjY2MjIuLi4uKioqKioqLi4uMjIyNjY6Ojo+Pj5CQkJCQkJCPj4+Ojo2NjIyMi4uLioqKioqKi4uLjIyMjY2Njo6Oj4+Pj4+Pj4+Pj4+Ojo6NjY2MjIyLi4uLioqKioqLi4uLjIyMjI2NjY6Ojo6Pj4+Pj4+Ojo6OjY2NjIyMi4uLi4uKioqKiouLi4uMjIyMjY2Njo6Ojo6Ojo+Pjo6Ojo2NjY2MjIyLi4uLi4uKioqKi4uLi4yMjIyNjY2Ojo6Ojo6Ojo6Ojo2NjY2NjIyMjIuLi4uLi4uKiouLi4uMjIyMjI2NjY2Ojo6Ojo6Ojo6NjY2NjYyMjIyMi4uLi4uLi4uLi4uLjIyMjIyNjY2NjY6Ojo6Ojo6OjY2NjY2MjIyMjIuLi4uLi4uLi4uLi4yMjIyMjI2NjY2NjY2Ojo6OjY2NjY2NjYyMjIyMi4uLi4uLi4uLi4yMjIyMjIyMjI2NjY2NjY2NjY2NjY2NjIyMjIyMjIuLi4uLi4uLjIyMjIyMjIyMjI2NjY2NjY2NjY2NjY2MjIyMjIyMjIyLi4uLi4yMjIyMjIyMjIyMjI2NjY2NjY2NjY2NjIyMjIyMjIyMjIuLi4yMjIyMjIyMjIyMjIyNjY2NjY2NjY2NjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjY2NjY2NjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyM';

class TransactionNotifications {
  constructor(storageKey = 'seenTransactions') {
    this.storageKey = storageKey;
    this.soundEnabled = true;
    this.seenIds = new Set(JSON.parse(localStorage.getItem(storageKey) || '[]'));
    this.audio = null;
    this._initAudio();
  }

  _initAudio() {
    try {
      this.audio = new Audio(NOTIFICATION_SOUND_URL);
      this.audio.volume = 0.7;
    } catch (e) {
      console.warn('Could not initialize notification sound:', e);
    }
  }

  playSound() {
    if (!this.soundEnabled || !this.audio) return;
    
    try {
      const sound = this.audio.cloneNode();
      sound.volume = 0.7;
      sound.play().catch(e => {
        console.warn('Could not play notification sound:', e);
      });
    } catch (e) {
      console.warn('Sound play error:', e);
    }
  }

  toggleSound(enabled) {
    this.soundEnabled = enabled;
  }

  /**
   * Check for new pending items and play sound if found
   * @param {Array} items - Array of transactions
   * @param {string} statusField - Field name for status (default: 'status')
   * @param {string} pendingValue - Value that indicates pending (default: 'pending')
   * @returns {boolean} - True if new pending items found
   */
  checkNewPending(items, statusField = 'status', pendingValue = 'pending') {
    const pendingItems = items.filter(item => item[statusField] === pendingValue);
    
    let hasNew = false;
    for (const item of pendingItems) {
      if (!this.seenIds.has(item.id)) {
        hasNew = true;
        this.seenIds.add(item.id);
      }
    }
    
    if (hasNew) {
      this.playSound();
      // Keep only last 500 IDs to prevent localStorage bloat
      const idsArray = [...this.seenIds];
      if (idsArray.length > 500) {
        this.seenIds = new Set(idsArray.slice(-500));
      }
      localStorage.setItem(this.storageKey, JSON.stringify([...this.seenIds]));
    }
    
    return hasNew;
  }

  markAsSeen(id) {
    this.seenIds.add(id);
    localStorage.setItem(this.storageKey, JSON.stringify([...this.seenIds]));
  }

  clearSeen() {
    this.seenIds.clear();
    localStorage.removeItem(this.storageKey);
  }
}

// Export singleton instances for payins and payouts
export const payinNotifications = new TransactionNotifications('seenPayins');
export const payoutNotifications = new TransactionNotifications('seenPayouts');

export default TransactionNotifications;
