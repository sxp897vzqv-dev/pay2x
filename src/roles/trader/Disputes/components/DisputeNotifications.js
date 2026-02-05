/* ─── Browser Notification Helper ─── */
export default class DisputeNotifications {
  constructor() {
    this.permission = 'default';
    this.enabled = false;
    this.seenDisputes = new Set(JSON.parse(localStorage.getItem('seenDisputes') || '[]'));
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
    if (!this.enabled || this.permission !== 'granted') return;
    
    try {
      const notification = new Notification(title, {
        body,
        icon: '/logo192.png',
        badge: '/logo192.png',
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
    if (!this.enabled) return;
    
    const pendingDisputes = disputes.filter(d => d.status === 'pending');
    
    for (const dispute of pendingDisputes) {
      if (!this.seenDisputes.has(dispute.id)) {
        this.notify(
          '⚠️ New Dispute',
          `${dispute.type === 'payin' ? 'Payin' : 'Payout'} dispute for ₹${dispute.amount?.toLocaleString()} - Action required!`,
          { disputeId: dispute.id }
        );
        this.seenDisputes.add(dispute.id);
      }
    }
    
    // Save seen disputes to localStorage
    localStorage.setItem('seenDisputes', JSON.stringify([...this.seenDisputes]));
  }

  markAsSeen(disputeId) {
    this.seenDisputes.add(disputeId);
    localStorage.setItem('seenDisputes', JSON.stringify([...this.seenDisputes]));
  }
}
