import React, { useEffect, useState } from 'react';
import { db } from '../../../firebase';
import { collection, query, onSnapshot, orderBy, where, doc, updateDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import {
  ClipboardCheck, Search, RefreshCw, User, Clock, CheckCircle, XCircle,
  AlertTriangle, AlertCircle, FileText, Filter, X, Eye,
} from 'lucide-react';

/* ─── Review Card ─── */
function ReviewCard({ log, onMarkReviewed, onDismiss }) {
  const [expanding, setExpanding] = useState(false);
  const [note, setNote] = useState('');
  const [processing, setProcessing] = useState(false);

  const handleApprove = async () => {
    setProcessing(true);
    await onMarkReviewed(log.id, 'approved', note);
    setProcessing(false);
  };

  const handleDismiss = async () => {
    setProcessing(true);
    await onDismiss(log.id, note);
    setProcessing(false);
  };

  return (
    <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
      {/* Critical stripe */}
      <div className={`h-1.5 ${log.severity === 'critical' ? 'bg-red-500' : 'bg-amber-400'}`} />
      
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-900">{log.action?.replace(/_/g, ' ').toUpperCase()}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                log.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {log.severity?.toUpperCase()}
              </span>
            </div>
            
            {/* Entity */}
            {log.entityName && (
              <div className="flex items-center gap-1.5 mt-1">
                {log.entityType === 'trader' && log.entityId ? (
                  <Link to={`/admin/traders/${log.entityId}`} className="text-sm text-indigo-600 font-semibold hover:underline flex items-center gap-1">
                    <User className="w-3.5 h-3.5" /> {log.entityName}
                  </Link>
                ) : log.entityType === 'merchant' && log.entityId ? (
                  <Link to={`/admin/merchants/${log.entityId}`} className="text-sm text-indigo-600 font-semibold hover:underline flex items-center gap-1">
                    <User className="w-3.5 h-3.5" /> {log.entityName}
                  </Link>
                ) : (
                  <span className="text-sm text-slate-600">{log.entityType}: {log.entityName}</span>
                )}
              </div>
            )}
          </div>

          {/* Timestamp */}
          <div className="text-xs text-slate-400 flex items-center gap-1 whitespace-nowrap">
            <Clock className="w-3.5 h-3.5" />
            {log.createdAt?.seconds
              ? new Date(log.createdAt.seconds * 1000).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
              : '—'}
          </div>
        </div>

        {/* Details */}
        {(log.details?.note || log.details?.amount) && (
          <div className="bg-slate-50 rounded-lg p-3 mb-3 text-sm">
            {log.details?.amount && (
              <p className="font-bold text-green-600 mb-1">₹{Number(log.details.amount).toLocaleString()}</p>
            )}
            {log.details?.note && <p className="text-slate-600">{log.details.note}</p>}
            {log.details?.before && log.details?.after && (
              <p className="text-slate-500 mt-1">
                Changed: <span className="line-through">{log.details.before}</span> → <span className="font-semibold">{log.details.after}</span>
              </p>
            )}
          </div>
        )}

        {/* Performer */}
        <div className="flex items-center gap-3 text-xs text-slate-500 mb-3">
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" /> {log.performedByName || 'Unknown'}
          </span>
          {log.performedByIp && log.performedByIp !== 'unknown' && (
            <span className="font-mono bg-slate-100 px-2 py-0.5 rounded">{log.performedByIp}</span>
          )}
        </div>

        {/* Expandable review section */}
        {!expanding ? (
          <button
            onClick={() => setExpanding(true)}
            className="w-full py-2 bg-amber-50 text-amber-700 rounded-lg font-semibold text-sm hover:bg-amber-100 transition-colors flex items-center justify-center gap-2"
          >
            <Eye className="w-4 h-4" /> Review This Action
          </button>
        ) : (
          <div className="border-t border-slate-200 pt-3 mt-2 space-y-3">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add review note (optional)..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
              rows={2}
            />
            <div className="flex gap-2">
              <button
                onClick={handleApprove}
                disabled={processing}
                className="flex-1 py-2 bg-green-600 text-white rounded-lg font-semibold text-sm hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" /> {processing ? 'Processing...' : 'Approve'}
              </button>
              <button
                onClick={handleDismiss}
                disabled={processing}
                className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-lg font-semibold text-sm hover:bg-slate-200 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <XCircle className="w-4 h-4" /> Dismiss
              </button>
              <button
                onClick={() => setExpanding(false)}
                className="px-3 py-2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export default function AdminReviewQueue() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');

  useEffect(() => {
    setError(null);
    const q = query(
      collection(db, 'adminLog'),
      where('requiresReview', '==', true),
      where('reviewedAt', '==', null), // Only unreviewed items
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setLogs(list);
        setLoading(false);
      },
      (err) => {
        console.error('Review queue error:', err);
        // Fallback: fetch all requiresReview logs without the reviewedAt filter
        const fallbackQ = query(
          collection(db, 'adminLog'),
          where('requiresReview', '==', true),
          orderBy('createdAt', 'desc')
        );
        onSnapshot(fallbackQ, (snap) => {
          const list = [];
          snap.forEach((d) => {
            const data = d.data();
            if (!data.reviewedAt) list.push({ id: d.id, ...data });
          });
          setLogs(list);
          setLoading(false);
        });
      }
    );

    return () => unsub();
  }, []);

  // Filter logs
  const filtered = logs.filter((l) => {
    if (severityFilter !== 'all' && l.severity !== severityFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        l.entityName?.toLowerCase().includes(s) ||
        l.action?.toLowerCase().includes(s) ||
        l.performedByName?.toLowerCase().includes(s)
      );
    }
    return true;
  });

  // Mark as reviewed
  const handleMarkReviewed = async (logId, status, note) => {
    try {
      await updateDoc(doc(db, 'adminLog', logId), {
        reviewedAt: new Date(),
        reviewStatus: status,
        reviewNote: note || null,
        reviewedBy: 'admin', // Could get current user
      });
    } catch (err) {
      console.error('Failed to mark as reviewed:', err);
      alert('Failed to update. Please try again.');
    }
  };

  // Dismiss (mark reviewed without approval)
  const handleDismiss = async (logId, note) => {
    try {
      await updateDoc(doc(db, 'adminLog', logId), {
        reviewedAt: new Date(),
        reviewStatus: 'dismissed',
        reviewNote: note || null,
        reviewedBy: 'admin',
      });
    } catch (err) {
      console.error('Failed to dismiss:', err);
      alert('Failed to update. Please try again.');
    }
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl shadow-sm">
              <ClipboardCheck className="w-5 h-5 text-white" />
            </div>
            Review Queue
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">
            Actions flagged for compliance review
          </p>
        </div>
        <div className="flex items-center gap-2">
          {logs.length > 0 && (
            <span className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-full text-sm font-bold">
              {logs.length} pending
            </span>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search entity, action, performer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
          />
        </div>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <option value="all">All Severity</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
        </select>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-amber-700">{logs.length}</p>
          <p className="text-xs text-amber-600 font-semibold">Pending Review</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-red-700">{logs.filter(l => l.severity === 'critical').length}</p>
          <p className="text-xs text-red-600 font-semibold">Critical</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-slate-700">{logs.filter(l => l.severity === 'warning').length}</p>
          <p className="text-xs text-slate-600 font-semibold">Warning</p>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <div>
            <p className="font-semibold text-red-700">Failed to load review queue</p>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-12 bg-white rounded-xl border border-slate-200">
          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
        </div>
      ) : filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((log) => (
            <ReviewCard
              key={log.id}
              log={log}
              onMarkReviewed={handleMarkReviewed}
              onDismiss={handleDismiss}
            />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-3" />
          <p className="text-slate-700 font-semibold">All caught up!</p>
          <p className="text-slate-400 text-sm mt-1">No actions pending review</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <FileText className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No matching items</p>
          <p className="text-slate-400 text-sm mt-1">Try adjusting your search</p>
        </div>
      )}
    </div>
  );
}
