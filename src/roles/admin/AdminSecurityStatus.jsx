import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import AuditIntegrityPanel from '../../components/admin/AuditIntegrityPanel';
import {
  Shield, ShieldCheck, ShieldAlert, ShieldX, Lock, Unlock, Key, Users,
  AlertTriangle, CheckCircle, XCircle, Clock, Activity, Globe, Server,
  RefreshCw, ChevronRight, TrendingUp, TrendingDown, Eye, Settings,
} from 'lucide-react';

const SecurityScore = ({ score, maxScore }) => {
  const percentage = Math.round((score / maxScore) * 100);
  const color = percentage >= 80 ? 'green' : percentage >= 60 ? 'yellow' : 'red';
  
  return (
    <div className="relative w-32 h-32">
      <svg className="w-32 h-32 transform -rotate-90">
        <circle cx="64" cy="64" r="56" stroke="#1f2937" strokeWidth="8" fill="none" />
        <circle
          cx="64" cy="64" r="56"
          stroke={color === 'green' ? '#22c55e' : color === 'yellow' ? '#eab308' : '#ef4444'}
          strokeWidth="8"
          fill="none"
          strokeDasharray={`${percentage * 3.52} 352`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-bold text-${color}-400`}>{percentage}</span>
        <span className="text-xs text-gray-500">/ 100</span>
      </div>
    </div>
  );
};

const StatusCard = ({ icon: Icon, title, status, detail, action, onClick, severity = 'info' }) => {
  const colors = {
    success: { bg: 'bg-green-500/10', border: 'border-green-500/30', icon: 'text-green-400', badge: 'bg-green-500/20 text-green-400' },
    warning: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', icon: 'text-yellow-400', badge: 'bg-yellow-500/20 text-yellow-400' },
    error: { bg: 'bg-red-500/10', border: 'border-red-500/30', icon: 'text-red-400', badge: 'bg-red-500/20 text-red-400' },
    info: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-400' },
  };
  const c = colors[severity];

  return (
    <div className={`${c.bg} ${c.border} border rounded-xl p-4`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${c.bg}`}>
            <Icon className={`w-5 h-5 ${c.icon}`} />
          </div>
          <div>
            <h3 className="text-white font-medium">{title}</h3>
            <p className="text-gray-400 text-sm mt-0.5">{detail}</p>
          </div>
        </div>
        <span className={`px-2 py-1 text-xs rounded-full ${c.badge}`}>{status}</span>
      </div>
      {action && onClick && (
        <button
          onClick={onClick}
          className="mt-3 text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
        >
          {action} <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export default function AdminSecurityStatus() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [securityData, setSecurityData] = useState({
    // Auth & Access
    totalAdmins: 0,
    adminsWithout2FA: 0,
    adminsWith2FA: 0,
    totalWorkers: 0,
    activeWorkers: 0,
    
    // Login Security
    failedLogins24h: 0,
    lockedAccounts: 0,
    successfulLogins24h: 0,
    uniqueIPs24h: 0,
    
    // API Security
    totalMerchants: 0,
    merchantsWithIPWhitelist: 0,
    merchantsEnforcingWhitelist: 0,
    apiRequestsToday: 0,
    rateLimitHits: 0,
    
    // Webhooks
    totalWebhooks: 0,
    failedWebhooks: 0,
    pendingWebhooks: 0,
    
    // Audit
    totalAuditLogs: 0,
    criticalEvents24h: 0,
    warningEvents24h: 0,
    
    // KYC
    pendingKYC: 0,
    approvedKYC: 0,
    expiredKYC: 0,
    
    // Sessions
    activeSessions: 0,
    
    // Disputes/Holds
    openDisputes: 0,
    activeHolds: 0,
    holdAmount: 0,
  });

  useEffect(() => {
    fetchSecurityData();
  }, []);

  const fetchSecurityData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const now = new Date();
      const yesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString();

      // Parallel queries for performance
      const [
        adminsRes,
        twoFARes,
        workersRes,
        loginAttemptsRes,
        lockedRes,
        merchantsRes,
        ipWhitelistRes,
        webhookQueueRes,
        auditLogsRes,
        criticalLogsRes,
        kycRes,
        disputesRes,
        holdsRes,
      ] = await Promise.all([
        // Admins
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin'),
        // 2FA enabled
        supabase.from('user_2fa').select('user_id', { count: 'exact', head: true }).eq('is_enabled', true),
        // Workers
        supabase.from('workers').select('id, is_active', { count: 'exact' }),
        // Failed logins 24h
        supabase.from('login_attempts').select('id, ip_address', { count: 'exact' }).eq('success', false).gte('created_at', yesterday),
        // Locked accounts
        supabase.from('account_lockouts').select('id', { count: 'exact', head: true }).eq('is_active', true),
        // Merchants
        supabase.from('merchants').select('id, enforce_ip_whitelist', { count: 'exact' }),
        // IP whitelist
        supabase.from('ip_whitelist').select('entity_id').eq('entity_type', 'merchant').eq('is_active', true),
        // Webhook queue
        supabase.from('webhook_queue').select('status', { count: 'exact' }),
        // Total audit logs
        supabase.from('admin_logs').select('id', { count: 'exact', head: true }),
        // Critical events 24h
        supabase.from('admin_logs').select('severity', { count: 'exact' }).in('severity', ['critical', 'warning']).gte('created_at', yesterday),
        // KYC
        supabase.from('kyc_documents').select('status', { count: 'exact' }),
        // Open disputes
        supabase.from('disputes').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        // Active holds
        supabase.from('balance_holds').select('amount').eq('status', 'active'),
      ]);

      // Process results
      const merchants = merchantsRes.data || [];
      const merchantsEnforcing = merchants.filter(m => m.enforce_ip_whitelist).length;
      const uniqueMerchantsWithWhitelist = new Set(ipWhitelistRes.data?.map(r => r.entity_id) || []).size;

      const webhooks = webhookQueueRes.data || [];
      const failedWebhooks = webhooks.filter(w => w.status === 'failed' || w.status === 'exhausted').length;
      const pendingWebhooks = webhooks.filter(w => w.status === 'pending').length;

      const criticalLogs = criticalLogsRes.data || [];
      const criticalCount = criticalLogs.filter(l => l.severity === 'critical').length;
      const warningCount = criticalLogs.filter(l => l.severity === 'warning').length;

      const kycDocs = kycRes.data || [];
      const pendingKYC = kycDocs.filter(k => k.status === 'pending').length;
      const approvedKYC = kycDocs.filter(k => k.status === 'approved').length;
      const expiredKYC = kycDocs.filter(k => k.status === 'expired').length;

      const workers = workersRes.data || [];
      const activeWorkers = workers.filter(w => w.is_active).length;

      const holds = holdsRes.data || [];
      const holdAmount = holds.reduce((sum, h) => sum + Number(h.amount || 0), 0);

      const uniqueIPs = new Set(loginAttemptsRes.data?.map(l => l.ip_address) || []).size;

      setSecurityData({
        totalAdmins: adminsRes.count || 0,
        adminsWith2FA: twoFARes.count || 0,
        adminsWithout2FA: (adminsRes.count || 0) - (twoFARes.count || 0),
        totalWorkers: workers.length,
        activeWorkers,
        
        failedLogins24h: loginAttemptsRes.count || 0,
        lockedAccounts: lockedRes.count || 0,
        successfulLogins24h: 0, // Would need separate query
        uniqueIPs24h: uniqueIPs,
        
        totalMerchants: merchants.length,
        merchantsWithIPWhitelist: uniqueMerchantsWithWhitelist,
        merchantsEnforcingWhitelist: merchantsEnforcing,
        apiRequestsToday: 0, // Would need rate_limits table query
        rateLimitHits: 0,
        
        totalWebhooks: webhooks.length,
        failedWebhooks,
        pendingWebhooks,
        
        totalAuditLogs: auditLogsRes.count || 0,
        criticalEvents24h: criticalCount,
        warningEvents24h: warningCount,
        
        pendingKYC,
        approvedKYC,
        expiredKYC,
        
        openDisputes: disputesRes.count || 0,
        activeHolds: holds.length,
        holdAmount,
      });
    } catch (error) {
      console.error('Error fetching security data:', error);
    }

    setLoading(false);
    setRefreshing(false);
  };

  // Calculate security score
  const calculateScore = () => {
    let score = 0;
    const d = securityData;

    // 2FA (25 points)
    if (d.totalAdmins > 0) {
      const twoFAPercent = d.adminsWith2FA / d.totalAdmins;
      score += Math.round(twoFAPercent * 25);
    }

    // No locked accounts = good (10 points)
    if (d.lockedAccounts === 0) score += 10;
    else if (d.lockedAccounts <= 2) score += 5;

    // Low failed logins (15 points)
    if (d.failedLogins24h === 0) score += 15;
    else if (d.failedLogins24h < 10) score += 10;
    else if (d.failedLogins24h < 50) score += 5;

    // IP whitelist configured (15 points)
    if (d.totalMerchants > 0) {
      const whitelistPercent = d.merchantsWithIPWhitelist / d.totalMerchants;
      score += Math.round(whitelistPercent * 15);
    }

    // Webhook health (10 points)
    if (d.totalWebhooks === 0 || d.failedWebhooks === 0) score += 10;
    else if (d.failedWebhooks / d.totalWebhooks < 0.1) score += 7;
    else if (d.failedWebhooks / d.totalWebhooks < 0.3) score += 3;

    // No critical events (15 points)
    if (d.criticalEvents24h === 0) score += 15;
    else if (d.criticalEvents24h <= 3) score += 8;

    // KYC compliance (10 points)
    const totalKYC = d.pendingKYC + d.approvedKYC + d.expiredKYC;
    if (totalKYC > 0 && d.expiredKYC === 0) score += 10;
    else if (totalKYC > 0 && d.expiredKYC / totalKYC < 0.1) score += 5;

    return score;
  };

  const score = calculateScore();

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-white/10 rounded w-48 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-[#1a1a2e] rounded-xl p-6 animate-pulse">
              <div className="h-4 bg-white/10 rounded w-24 mb-3" />
              <div className="h-8 bg-white/10 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="w-7 h-7 text-indigo-400" />
            Security Status
          </h1>
          <p className="text-gray-400 text-sm mt-1">Real-time security posture overview</p>
        </div>
        <button
          onClick={() => fetchSecurityData(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-white hover:bg-white/5 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Score Card */}
      <div className="bg-gradient-to-r from-[#1a1a2e] to-[#252542] rounded-2xl p-6 border border-white/5">
        <div className="flex items-center gap-8">
          <SecurityScore score={score} maxScore={100} />
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-white mb-2">Security Score</h2>
            <p className="text-gray-400 text-sm mb-4">
              {score >= 80 ? 'Excellent! Your security posture is strong.' :
               score >= 60 ? 'Good, but there are areas to improve.' :
               'Action needed! Several security issues require attention.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {securityData.adminsWithout2FA > 0 && (
                <span className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded-full">
                  {securityData.adminsWithout2FA} admin(s) without 2FA
                </span>
              )}
              {securityData.lockedAccounts > 0 && (
                <span className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-400 rounded-full">
                  {securityData.lockedAccounts} locked account(s)
                </span>
              )}
              {securityData.criticalEvents24h > 0 && (
                <span className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded-full">
                  {securityData.criticalEvents24h} critical event(s)
                </span>
              )}
              {securityData.failedWebhooks > 0 && (
                <span className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-400 rounded-full">
                  {securityData.failedWebhooks} failed webhook(s)
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-white/5">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <Users className="w-4 h-4" />
            Admins with 2FA
          </div>
          <p className="text-2xl font-bold text-white">
            {securityData.adminsWith2FA}/{securityData.totalAdmins}
          </p>
          <p className={`text-xs ${securityData.adminsWithout2FA === 0 ? 'text-green-400' : 'text-red-400'}`}>
            {securityData.adminsWithout2FA === 0 ? '✓ All protected' : `⚠ ${securityData.adminsWithout2FA} unprotected`}
          </p>
        </div>

        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-white/5">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <AlertTriangle className="w-4 h-4" />
            Failed Logins (24h)
          </div>
          <p className="text-2xl font-bold text-white">{securityData.failedLogins24h}</p>
          <p className="text-xs text-gray-500">from {securityData.uniqueIPs24h} unique IPs</p>
        </div>

        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-white/5">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <Lock className="w-4 h-4" />
            Locked Accounts
          </div>
          <p className="text-2xl font-bold text-white">{securityData.lockedAccounts}</p>
          <p className={`text-xs ${securityData.lockedAccounts === 0 ? 'text-green-400' : 'text-yellow-400'}`}>
            {securityData.lockedAccounts === 0 ? '✓ None locked' : 'Review needed'}
          </p>
        </div>

        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-white/5">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <Activity className="w-4 h-4" />
            Audit Events (24h)
          </div>
          <p className="text-2xl font-bold text-white">
            {securityData.criticalEvents24h + securityData.warningEvents24h}
          </p>
          <p className="text-xs">
            <span className="text-red-400">{securityData.criticalEvents24h} critical</span>
            {' · '}
            <span className="text-yellow-400">{securityData.warningEvents24h} warning</span>
          </p>
        </div>
      </div>

      {/* Detailed Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Authentication & Access */}
        <div className="bg-[#1a1a2e] rounded-xl border border-white/5 p-5">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Key className="w-5 h-5 text-indigo-400" />
            Authentication & Access
          </h3>
          <div className="space-y-3">
            <StatusCard
              icon={ShieldCheck}
              title="Two-Factor Authentication"
              status={securityData.adminsWithout2FA === 0 ? 'Enabled' : 'Partial'}
              detail={`${securityData.adminsWith2FA}/${securityData.totalAdmins} admins have 2FA enabled`}
              severity={securityData.adminsWithout2FA === 0 ? 'success' : 'warning'}
              action={securityData.adminsWithout2FA > 0 ? 'Enforce 2FA' : null}
            />
            <StatusCard
              icon={Users}
              title="Worker Accounts"
              status={`${securityData.activeWorkers} Active`}
              detail={`${securityData.totalWorkers} total workers configured`}
              severity="info"
            />
            <StatusCard
              icon={securityData.lockedAccounts > 0 ? Lock : Unlock}
              title="Account Lockouts"
              status={securityData.lockedAccounts === 0 ? 'None' : `${securityData.lockedAccounts} Locked`}
              detail={securityData.lockedAccounts === 0 ? 'No accounts currently locked' : 'Review and unlock if legitimate'}
              severity={securityData.lockedAccounts === 0 ? 'success' : 'warning'}
              action={securityData.lockedAccounts > 0 ? 'Review' : null}
            />
          </div>
        </div>

        {/* API Security */}
        <div className="bg-[#1a1a2e] rounded-xl border border-white/5 p-5">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Globe className="w-5 h-5 text-indigo-400" />
            API Security
          </h3>
          <div className="space-y-3">
            <StatusCard
              icon={Shield}
              title="IP Whitelisting"
              status={`${securityData.merchantsWithIPWhitelist}/${securityData.totalMerchants}`}
              detail={`${securityData.merchantsEnforcingWhitelist} merchants enforcing whitelist`}
              severity={securityData.merchantsWithIPWhitelist >= securityData.totalMerchants * 0.5 ? 'success' : 'warning'}
            />
            <StatusCard
              icon={Activity}
              title="Rate Limiting"
              status="Active"
              detail="100 req/min per merchant (configurable)"
              severity="success"
            />
            <StatusCard
              icon={Server}
              title="Webhook Delivery"
              status={securityData.failedWebhooks === 0 ? 'Healthy' : `${securityData.failedWebhooks} Failed`}
              detail={`${securityData.pendingWebhooks} pending, ${securityData.totalWebhooks} total in queue`}
              severity={securityData.failedWebhooks === 0 ? 'success' : 'warning'}
            />
          </div>
        </div>

        {/* Compliance */}
        <div className="bg-[#1a1a2e] rounded-xl border border-white/5 p-5">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-indigo-400" />
            Compliance & KYC
          </h3>
          <div className="space-y-3">
            <StatusCard
              icon={Eye}
              title="KYC Documents"
              status={`${securityData.pendingKYC} Pending`}
              detail={`${securityData.approvedKYC} approved, ${securityData.expiredKYC} expired`}
              severity={securityData.pendingKYC === 0 ? 'success' : 'info'}
              action={securityData.pendingKYC > 0 ? 'Review KYC' : null}
            />
            <StatusCard
              icon={AlertTriangle}
              title="Open Disputes"
              status={securityData.openDisputes === 0 ? 'None' : `${securityData.openDisputes} Open`}
              detail={securityData.openDisputes === 0 ? 'All disputes resolved' : 'Requires attention'}
              severity={securityData.openDisputes === 0 ? 'success' : 'warning'}
            />
            <StatusCard
              icon={Lock}
              title="Balance Holds"
              status={`${securityData.activeHolds} Active`}
              detail={`₹${securityData.holdAmount.toLocaleString('en-IN')} total held`}
              severity="info"
            />
          </div>
        </div>

        {/* Audit & Monitoring */}
        <div className="bg-[#1a1a2e] rounded-xl border border-white/5 p-5">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            Audit & Monitoring
          </h3>
          <div className="space-y-3">
            <StatusCard
              icon={Activity}
              title="Audit Logging"
              status="Active"
              detail={`${securityData.totalAuditLogs.toLocaleString()} total events recorded`}
              severity="success"
            />
            <StatusCard
              icon={securityData.criticalEvents24h > 0 ? ShieldAlert : ShieldCheck}
              title="Critical Events (24h)"
              status={securityData.criticalEvents24h === 0 ? 'None' : `${securityData.criticalEvents24h} Events`}
              detail={securityData.criticalEvents24h === 0 ? 'No critical security events' : 'Review required'}
              severity={securityData.criticalEvents24h === 0 ? 'success' : 'error'}
              action={securityData.criticalEvents24h > 0 ? 'View Logs' : null}
            />
            <StatusCard
              icon={Clock}
              title="Session Management"
              status="Active"
              detail="30 min idle timeout, 8h max session"
              severity="success"
            />
          </div>
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-[#1a1a2e] rounded-xl border border-white/5 p-5">
        <h3 className="text-lg font-semibold text-white mb-4">🎯 Recommendations</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {securityData.adminsWithout2FA > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <p className="text-red-400 font-medium text-sm">Enable 2FA for all admins</p>
              <p className="text-gray-400 text-xs mt-1">{securityData.adminsWithout2FA} admin(s) unprotected</p>
            </div>
          )}
          {securityData.merchantsWithIPWhitelist < securityData.totalMerchants && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
              <p className="text-yellow-400 font-medium text-sm">Configure IP whitelists</p>
              <p className="text-gray-400 text-xs mt-1">{securityData.totalMerchants - securityData.merchantsWithIPWhitelist} merchants without whitelist</p>
            </div>
          )}
          {securityData.pendingKYC > 0 && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
              <p className="text-blue-400 font-medium text-sm">Review pending KYC</p>
              <p className="text-gray-400 text-xs mt-1">{securityData.pendingKYC} document(s) awaiting review</p>
            </div>
          )}
          {securityData.failedWebhooks > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
              <p className="text-yellow-400 font-medium text-sm">Check failed webhooks</p>
              <p className="text-gray-400 text-xs mt-1">{securityData.failedWebhooks} webhook(s) failed delivery</p>
            </div>
          )}
          {securityData.expiredKYC > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <p className="text-red-400 font-medium text-sm">Update expired KYC</p>
              <p className="text-gray-400 text-xs mt-1">{securityData.expiredKYC} document(s) expired</p>
            </div>
          )}
          {score >= 80 && securityData.adminsWithout2FA === 0 && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
              <p className="text-green-400 font-medium text-sm">Security posture is strong! 💪</p>
              <p className="text-gray-400 text-xs mt-1">Continue monitoring for anomalies</p>
            </div>
          )}
        </div>
      </div>

      {/* Audit Trail Integrity */}
      <AuditIntegrityPanel />
    </div>
  );
}
