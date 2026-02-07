import React, { useState, useEffect } from 'react';
import {
  Shield, ShieldCheck, ShieldAlert, ShieldX, RefreshCw, CheckCircle,
  XCircle, Clock, Link, Hash, FileText, AlertTriangle, Download,
} from 'lucide-react';
import {
  getAuditChainStatus,
  verifyAuditChain,
  createAuditSnapshot,
  getAuditSnapshots,
  getAuditLogsWithHashes,
  formatHash,
  timeSinceLastSnapshot,
} from '../../utils/auditIntegrity';

export default function AuditIntegrityPanel() {
  const [status, setStatus] = useState(null);
  const [verification, setVerification] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statusData, snapshotsData] = await Promise.all([
        getAuditChainStatus(),
        getAuditSnapshots(5),
      ]);
      setStatus(statusData);
      setSnapshots(snapshotsData);
    } catch (error) {
      console.error('Error fetching audit data:', error);
    }
    setLoading(false);
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const result = await verifyAuditChain();
      setVerification(result);
    } catch (error) {
      console.error('Verification error:', error);
      setVerification({ is_valid: false, first_invalid_reason: error.message });
    }
    setVerifying(false);
  };

  const handleCreateSnapshot = async () => {
    setCreatingSnapshot(true);
    try {
      await createAuditSnapshot('Manual verification snapshot');
      await fetchData();
    } catch (error) {
      console.error('Snapshot error:', error);
    }
    setCreatingSnapshot(false);
  };

  const handleShowLogs = async () => {
    if (!showLogs) {
      const logs = await getAuditLogsWithHashes(20);
      setRecentLogs(logs);
    }
    setShowLogs(!showLogs);
  };

  if (loading) {
    return (
      <div className="bg-[#1a1a2e] rounded-xl border border-white/5 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-white/10 rounded w-48" />
          <div className="h-24 bg-white/10 rounded" />
        </div>
      </div>
    );
  }

  const isValid = status?.chain_valid;
  const lastSnapshotTime = timeSinceLastSnapshot(snapshots);

  return (
    <div className="bg-[#1a1a2e] rounded-xl border border-white/5 overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isValid ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
              {isValid ? (
                <ShieldCheck className="w-6 h-6 text-green-400" />
              ) : (
                <ShieldAlert className="w-6 h-6 text-red-400" />
              )}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Audit Trail Integrity</h3>
              <p className="text-sm text-gray-400">
                Cryptographic hash chain verification
              </p>
            </div>
          </div>
          <span className={`px-3 py-1 text-sm rounded-full ${
            isValid 
              ? 'bg-green-500/20 text-green-400' 
              : 'bg-red-500/20 text-red-400'
          }`}>
            {isValid ? 'Chain Valid' : 'Chain Invalid'}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4 border-b border-white/5">
        <div>
          <p className="text-xs text-gray-500 uppercase">Total Records</p>
          <p className="text-xl font-bold text-white">{status?.total_records?.toLocaleString() || 0}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase">First Record</p>
          <p className="text-sm text-white">
            {status?.first_record_at 
              ? new Date(status.first_record_at).toLocaleDateString() 
              : 'N/A'}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase">Last Record</p>
          <p className="text-sm text-white">
            {status?.last_record_at 
              ? new Date(status.last_record_at).toLocaleString() 
              : 'N/A'}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase">Last Hash</p>
          <p className="text-sm text-white font-mono">{formatHash(status?.last_hash, 12)}</p>
        </div>
      </div>

      {/* Verification Result */}
      {verification && (
        <div className={`p-4 mx-5 mt-5 rounded-lg ${
          verification.is_valid 
            ? 'bg-green-500/10 border border-green-500/30' 
            : 'bg-red-500/10 border border-red-500/30'
        }`}>
          <div className="flex items-start gap-3">
            {verification.is_valid ? (
              <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <p className={`font-medium ${verification.is_valid ? 'text-green-400' : 'text-red-400'}`}>
                {verification.is_valid 
                  ? `✓ All ${verification.verified_records?.toLocaleString()} records verified` 
                  : '✗ Chain integrity compromised'}
              </p>
              {!verification.is_valid && verification.first_invalid_reason && (
                <p className="text-sm text-red-300 mt-1">
                  Issue at sequence #{verification.first_invalid_seq}: {verification.first_invalid_reason}
                </p>
              )}
              {verification.is_valid && (
                <p className="text-sm text-green-300 mt-1">
                  Hash chain is intact. No tampering detected.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="p-5 flex flex-wrap gap-3">
        <button
          onClick={handleVerify}
          disabled={verifying}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 transition-colors"
        >
          {verifying ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Shield className="w-4 h-4" />
          )}
          {verifying ? 'Verifying...' : 'Verify Chain'}
        </button>

        <button
          onClick={handleCreateSnapshot}
          disabled={creatingSnapshot}
          className="flex items-center gap-2 px-4 py-2 bg-[#252542] hover:bg-white/10 text-white rounded-lg border border-white/10 disabled:opacity-50 transition-colors"
        >
          {creatingSnapshot ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Create Snapshot
        </button>

        <button
          onClick={handleShowLogs}
          className="flex items-center gap-2 px-4 py-2 bg-[#252542] hover:bg-white/10 text-white rounded-lg border border-white/10 transition-colors"
        >
          <Hash className="w-4 h-4" />
          {showLogs ? 'Hide' : 'View'} Hash Chain
        </button>
      </div>

      {/* Hash Chain Visualization */}
      {showLogs && recentLogs.length > 0 && (
        <div className="px-5 pb-5">
          <div className="bg-black/30 rounded-lg p-4 overflow-x-auto">
            <p className="text-xs text-gray-500 mb-3">Recent Audit Entries (newest first)</p>
            <div className="space-y-2">
              {recentLogs.map((log, idx) => (
                <div key={log.id} className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500 w-8">#{log.sequence_num}</span>
                  <div className="flex items-center gap-1">
                    <Link className="w-3 h-3 text-indigo-400" />
                    <code className="text-indigo-300 font-mono">{formatHash(log.prev_hash, 8)}</code>
                  </div>
                  <span className="text-gray-600">→</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-white">{log.action}</span>
                    <span className="text-gray-500 mx-1">·</span>
                    <span className="text-gray-400">{log.entity_type}</span>
                    {log.entity_name && (
                      <>
                        <span className="text-gray-500 mx-1">·</span>
                        <span className="text-gray-400 truncate">{log.entity_name}</span>
                      </>
                    )}
                  </div>
                  <span className="text-gray-600">→</span>
                  <code className="text-green-300 font-mono">{formatHash(log.row_hash, 8)}</code>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-600 mt-3 flex items-center gap-1">
              <Link className="w-3 h-3" />
              Each row's hash includes the previous row's hash, creating an unbreakable chain
            </p>
          </div>
        </div>
      )}

      {/* Snapshots */}
      {snapshots.length > 0 && (
        <div className="px-5 pb-5">
          <p className="text-xs text-gray-500 uppercase mb-3">Verification Snapshots</p>
          <div className="space-y-2">
            {snapshots.map(snapshot => {
              const result = snapshot.verification_result;
              const isSnapshotValid = result?.is_valid;
              
              return (
                <div 
                  key={snapshot.id} 
                  className="flex items-center justify-between p-3 bg-black/20 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {isSnapshotValid ? (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400" />
                    )}
                    <div>
                      <p className="text-sm text-white">
                        {new Date(snapshot.snapshot_at).toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500">
                        {result?.verified_records?.toLocaleString()} records verified
                        {snapshot.notes && ` · ${snapshot.notes}`}
                      </p>
                    </div>
                  </div>
                  <code className="text-xs text-gray-400 font-mono">
                    {formatHash(snapshot.last_row_hash, 10)}
                  </code>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Info */}
      <div className="px-5 pb-5">
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
          <p className="text-xs text-blue-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              <strong>Tamper-proof design:</strong> Each audit log entry contains a SHA-256 hash 
              of its contents plus the previous entry's hash. Any modification breaks the chain 
              and is immediately detectable. Audit logs cannot be updated or deleted.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
