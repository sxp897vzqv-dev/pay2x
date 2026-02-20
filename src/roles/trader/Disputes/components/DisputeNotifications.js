/* ─── Browser Notification + Sound Helper ─── */

// Notification sound (base64 encoded short alert tone)
const NOTIFICATION_SOUND_URL = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2JkJSQiH94cW90goqTlpWQiYB4cW90gpCZnJmVkIiAd3FwdX+KlJuempWPh3p0c3Z8h5OdoaCdl4+Gfnd1dnyHk56joqCZk4uBenV0eIGLmKKlpqOdk4qBe3d1doGKmKOoqaadlIqDfXl3dX+JlqKpq6ignJOJgnt4dnmCjJiirKuspp6XjoZ/enh3fIeMl6GrraynopyVjYaAenl5fYWNl6Cqra2qpp+Yj4eAe3l5fIOLlZ2mqquqpqGakY2Hgn16eX2Ci5SdpairqqejoJqUj4qFgHt6e3+Ei5OcpKiqqqilo56YlI+LhoF8e3t/g4qRm6SnqKmno6CdmZWRjYmEf3t7fIGHjpagpaiop6Wjo56bmJWRjomFgX17fH+FipGaoqaoqKaloqCdmpaUkY2JhYF9fH2AhYqQmKGlp6eno6KgnpuYlZKPi4eCf3x9f4KGi5CYn6Okpaalo6GfnZqYlZKPi4eCgH5+gIKGio+Wnp+io6Ojo6KgnZuZlpOQjYqHhIB+foCBhYmOlJqeoKGio6OioJ6cmpiWk5CMioeDgYB/gYOGio6UmZyfoKGhoaGgnp2bmJaUkY6LiIWDgoGBg4WHi46TmJudn6CgoKCfnp2bmJaUko+Mi4mHhYOCgoOFh4qNkZWYm52en5+fnp6dnJqYlpSSj42LiYeGhIODhIWHiYyPk5aYmp2en5+enp2cm5mYlpSSj42LioiGhYSDhIWGiImMj5KVl5manJ2dnZ2cmpmYlpWTkY+NjIqJh4aFhISFhoiJi42Pk5WXmZqbm5ubmpmYl5aUk5GQjo2LioiHhoaFhYaHiImLjY+RlJaYmZqampqamZiXlpSUkpCPjoyLiomHh4aGhoeIiYqMjpCSk5WWl5iYmJiYl5aVlJOSkZCOjYyKiomIh4eHh4iIiYqMjY+QkpSVlpaXl5eXlpaVlJOSkZCPjYyLiomJiIiIiIiIiYqKjI2PkJGTlJWWlpaWlpWVlJOSkJCPjY2Mi4qJiYiIiImJiYqKi4yNjpCRkpOUlJWVlZWVlJOSkZCQjo2MjIuKiYmIiImJiYqKi4yNjo+QkZKTlJSUlZSUlJOSkZGQj46NjIyLioqJiYmJiYqKiosMjI2Oj5CRkpOTlJSUlJSTkpKRkI+OjoyMi4qKiomJiYqKiouLjIyNjo+QkZGSk5OTk5OTkpKRkZCPj46NjIyLi4qKiomJiYqKiouLjI2Njo+QkJGRkpKSkpKSkZGQkI+Pjo6NjIyLi4uKioqKioqKi4uMjI2Ojo+QkJGRkZKSkpKRkZCQj4+OjY2MjIuLi4qKioqKioqLi4yMjY2Ojo+PkJCRkZGRkZGRkJCQj4+OjY2MjIuLi4qKioqKiouLi4yMjY2Ojo+PkJCQkZGRkZCQkJCPj46OjY2MjIuLi4uKioqKioqLi4uMjIyNjY6Ojo+PkJCQkJCQkJCPj4+Ojo2NjIyMi4uLioqKioqKi4uLjIyMjY2Njo6Oj4+Pj5CQj4+Pj46Ojo2NjYyMi4uLi4qKioqKiouLi4yMjI2NjY6Ojo+Pj4+Pj4+Pj4+Ojo6NjY2MjIyLi4uLioqKioqLi4uLjIyMjI2NjY6Ojo6Pj4+Pj4+Ojo6OjY2NjIyMi4uLi4uKioqKiouLi4uMjIyMjY2Njo6Ojo6Ojo+Pjo6Ojo2NjY2MjIyLi4uLi4uKioqKi4uLi4yMjIyNjY2Ojo6Ojo6Ojo6Ojo2NjY2NjIyMjIuLi4uLi4uKiouLi4uMjIyMjI2NjY2Ojo6Ojo6Ojo6NjY2NjYyMjIyMi4uLi4uLi4uLi4uLjIyMjIyNjY2NjY6Ojo6Ojo6OjY2NjY2MjIyMjIuLi4uLi4uLi4uLi4yMjIyMjI2NjY2NjY2Ojo6OjY2NjY2NjYyMjIyMi4uLi4uLi4uLi4yMjIyMjIyNjY2NjY2NjY2NjY2NjY2NjIyMjIyMjIuLi4uLi4uLi4yMjIyMjIyMjI2NjY2NjY2NjY2NjY2NjIyMjIyMjIyLi4uLi4uLjIyMjIyMjIyMjI2NjY2NjY2NjY2NjY2MjIyMjIyMjIyLi4uLi4yMjIyMjIyMjIyMjI2NjY2NjY2NjY2NjIyMjIyMjIyMjIuLi4yMjIyMjIyMjIyMjIyNjY2NjY2NjY2NjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjY2NjY2NjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyM';

export default class DisputeNotifications {
  constructor() {
    this.permission = 'default';
    this.enabled = false;
    this.soundEnabled = true;
    this.seenDisputes = new Set(JSON.parse(localStorage.getItem('seenDisputes') || '[]'));
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
      // Clone audio to allow overlapping sounds
      const sound = this.audio.cloneNode();
      sound.volume = 0.7;
      sound.play().catch(e => {
        // Autoplay might be blocked - user interaction required first
        console.warn('Could not play notification sound:', e);
      });
    } catch (e) {
      console.warn('Sound play error:', e);
    }
  }

  async requestPermission() {
    if (!('Notification' in window)) {
      return false;
    }
    
    try {
      const permission = await Notification.requestPermission();
      this.permission = permission;
      this.enabled = permission === 'granted';
      return this.enabled;
    } catch (e) {
      console.error('Notification permission error:', e);
      return false;
    }
  }

  notify(title, body, data = {}) {
    // Always play sound if enabled (doesn't require notification permission)
    this.playSound();
    
    if (!this.enabled || this.permission !== 'granted') return;
    
    try {
      const notification = new Notification(title, {
        body,
        icon: '/pay2x.svg',
        badge: '/pay2x.svg',
        tag: data.disputeId || 'dispute',
        requireInteraction: true,
        data,
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // Auto-close after 10 seconds
      setTimeout(() => notification.close(), 10000);
    } catch (e) {
      console.error('Notification error:', e);
    }
  }

  checkNewDisputes(disputes) {
    const pendingDisputes = disputes.filter(d => 
      d.status === 'pending' || d.status === 'routed_to_trader'
    );
    
    let hasNew = false;
    for (const dispute of pendingDisputes) {
      if (!this.seenDisputes.has(dispute.id)) {
        hasNew = true;
        this.notify(
          '⚠️ New Dispute',
          `${dispute.type === 'payin' ? 'Payin' : 'Payout'} dispute for ₹${dispute.amount?.toLocaleString()} - Action required!`,
          { disputeId: dispute.id }
        );
        this.seenDisputes.add(dispute.id);
      }
    }
    
    // Save seen disputes to localStorage
    if (hasNew) {
      localStorage.setItem('seenDisputes', JSON.stringify([...this.seenDisputes]));
    }
    
    return hasNew;
  }

  markAsSeen(disputeId) {
    this.seenDisputes.add(disputeId);
    localStorage.setItem('seenDisputes', JSON.stringify([...this.seenDisputes]));
  }

  toggleSound(enabled) {
    this.soundEnabled = enabled;
  }
}
