import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { reviewKycDocument } from '../../utils/enterprise';
import { Search, FileText, CheckCircle, XCircle, Clock, Eye, Download, Filter, RefreshCw, User, Store } from 'lucide-react';

const STATUS_CONFIG = {
  pending: { color: 'yellow', icon: Clock, label: 'Pending' },
  under_review: { color: 'blue', icon: Eye, label: 'Under Review' },
  approved: { color: 'green', icon: CheckCircle, label: 'Approved' },
  rejected: { color: 'red', icon: XCircle, label: 'Rejected' },
  expired: { color: 'gray', icon: XCircle, label: 'Expired' },
};

const DOC_TYPES = {
  pan_card: 'PAN Card',
  aadhaar_front: 'Aadhaar Front',
  aadhaar_back: 'Aadhaar Back',
  passport: 'Passport',
  driving_license: 'Driving License',
  voter_id: 'Voter ID',
  gst_certificate: 'GST Certificate',
  bank_statement: 'Bank Statement',
  cancelled_cheque: 'Cancelled Cheque',
  address_proof: 'Address Proof',
  business_registration: 'Business Registration',
  selfie: 'Selfie',
  other: 'Other',
};

export default function AdminKYC() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', entityType: '', search: '' });
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [traders, setTraders] = useState({});
  const [merchants, setMerchants] = useState({});

  useEffect(() => { fetchData(); }, [filters.status, filters.entityType]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch documents
      let query = supabase
        .from('kyc_documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters.status) query = query.eq('status', filters.status);
      if (filters.entityType) query = query.eq('entity_type', filters.entityType);

      const { data: docs, error } = await query;
      if (error) throw error;

      // Fetch entity names
      const traderIds = [...new Set(docs.filter(d => d.entity_type === 'trader').map(d => d.entity_id))];
      const merchantIds = [...new Set(docs.filter(d => d.entity_type === 'merchant').map(d => d.entity_id))];

      const [tradersRes, merchantsRes] = await Promise.all([
        traderIds.length ? supabase.from('traders').select('id, name').in('id', traderIds) : { data: [] },
        merchantIds.length ? supabase.from('merchants').select('id, name').in('id', merchantIds) : { data: [] },
      ]);

      const tradersMap = {};
      const merchantsMap = {};
      tradersRes.data?.forEach(t => { tradersMap[t.id] = t.name; });
      merchantsRes.data?.forEach(m => { merchantsMap[m.id] = m.name; });

      setTraders(tradersMap);
      setMerchants(merchantsMap);
      setDocuments(docs || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const getEntityName = (doc) => {
    if (doc.entity_type === 'trader') return traders[doc.entity_id] || 'Unknown Trader';
    if (doc.entity_type === 'merchant') return merchants[doc.entity_id] || 'Unknown Merchant';
    return 'Unknown';
  };

  const filteredDocs = documents.filter(doc => {
    if (!filters.search) return true;
    const name = getEntityName(doc).toLowerCase();
    const docNum = (doc.document_number || '').toLowerCase();
    return name.includes(filters.search.toLowerCase()) || docNum.includes(filters.search.toLowerCase());
  });

  const stats = {
    pending: documents.filter(d => d.status === 'pending').length,
    approved: documents.filter(d => d.status === 'approved').length,
    rejected: documents.filter(d => d.status === 'rejected').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <FileText className="w-6 h-6" />
          KYC Management
        </h1>
        <p className="text-gray-400 text-sm mt-1">Review and manage KYC documents</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-white/5">
          <p className="text-gray-400 text-sm">Pending Review</p>
          <p className="text-2xl font-bold text-yellow-400">{stats.pending}</p>
        </div>
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-white/5">
          <p className="text-gray-400 text-sm">Approved</p>
          <p className="text-2xl font-bold text-green-400">{stats.approved}</p>
        </div>
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-white/5">
          <p className="text-gray-400 text-sm">Rejected</p>
          <p className="text-2xl font-bold text-red-400">{stats.rejected}</p>
        </div>
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-white/5">
          <p className="text-gray-400 text-sm">Total Documents</p>
          <p className="text-2xl font-bold text-white">{documents.length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search by name or document number..."
            value={filters.search}
            onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
            className="w-full pl-10 pr-4 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-white text-sm"
          />
        </div>
        <select
          value={filters.status}
          onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}
          className="bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
        >
          <option value="">All Status</option>
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.label}</option>
          ))}
        </select>
        <select
          value={filters.entityType}
          onChange={(e) => setFilters(f => ({ ...f, entityType: e.target.value }))}
          className="bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
        >
          <option value="">All Entities</option>
          <option value="trader">Traders</option>
          <option value="merchant">Merchants</option>
        </select>
        <button onClick={fetchData} className="p-2 bg-[#1a1a2e] rounded-lg hover:bg-white/10">
          <RefreshCw className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Documents Grid */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : filteredDocs.length === 0 ? (
        <div className="bg-[#1a1a2e] rounded-xl border border-white/5 p-8 text-center">
          <FileText className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No documents found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocs.map(doc => {
            const StatusIcon = STATUS_CONFIG[doc.status]?.icon || Clock;
            const statusColor = STATUS_CONFIG[doc.status]?.color || 'gray';

            return (
              <div
                key={doc.id}
                className="bg-[#1a1a2e] rounded-xl border border-white/5 p-4 hover:border-white/10 cursor-pointer transition-colors"
                onClick={() => setSelectedDoc(doc)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {doc.entity_type === 'trader' ? (
                      <User className="w-4 h-4 text-blue-400" />
                    ) : (
                      <Store className="w-4 h-4 text-purple-400" />
                    )}
                    <span className="text-white font-medium">{getEntityName(doc)}</span>
                  </div>
                  <span className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-${statusColor}-500/20 text-${statusColor}-400`}>
                    <StatusIcon className="w-3 h-3" />
                    {STATUS_CONFIG[doc.status]?.label}
                  </span>
                </div>

                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-gray-500">Document Type</p>
                    <p className="text-sm text-white">{DOC_TYPES[doc.document_type] || doc.document_type}</p>
                  </div>
                  {doc.document_number && (
                    <div>
                      <p className="text-xs text-gray-500">Document Number</p>
                      <p className="text-sm text-white font-mono">{doc.document_number}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-gray-500">Uploaded</p>
                    <p className="text-sm text-gray-400">{new Date(doc.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Review Modal */}
      {selectedDoc && (
        <ReviewModal
          document={selectedDoc}
          entityName={getEntityName(selectedDoc)}
          onClose={() => setSelectedDoc(null)}
          onSuccess={fetchData}
        />
      )}
    </div>
  );
}

function ReviewModal({ document: doc, entityName, onClose, onSuccess }) {
  const [action, setAction] = useState('');
  const [notes, setNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [imageUrl, setImageUrl] = useState(null);

  useEffect(() => {
    // Get signed URL for image
    const fetchImage = async () => {
      if (doc.file_path) {
        const { data } = await supabase.storage
          .from('kyc-documents')
          .createSignedUrl(doc.file_path, 3600);
        if (data?.signedUrl) setImageUrl(data.signedUrl);
      }
    };
    fetchImage();
  }, [doc.file_path]);

  const handleSubmit = async () => {
    if (!action) return;
    setProcessing(true);
    try {
      await reviewKycDocument(doc.id, action, notes, action === 'rejected' ? rejectionReason : null);
      onSuccess();
      onClose();
    } catch (e) {
      console.error(e);
      alert('Failed to update document');
    }
    setProcessing(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1a2e] rounded-xl w-full max-w-3xl border border-white/10 max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Review KYC Document</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded">
            <XCircle className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-4 grid md:grid-cols-2 gap-4">
          {/* Document Preview */}
          <div className="bg-black/30 rounded-lg p-4">
            {imageUrl ? (
              <img src={imageUrl} alt="Document" className="w-full rounded-lg" />
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500">
                <FileText className="w-16 h-16" />
              </div>
            )}
            {imageUrl && (
              <a
                href={imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 mt-3 py-2 bg-white/10 rounded-lg text-white text-sm hover:bg-white/20"
              >
                <Download className="w-4 h-4" />
                Download Original
              </a>
            )}
          </div>

          {/* Details & Actions */}
          <div className="space-y-4">
            <div className="bg-black/30 rounded-lg p-3">
              <p className="text-xs text-gray-500">Entity</p>
              <p className="text-white">{entityName}</p>
              <p className="text-xs text-gray-400 capitalize">{doc.entity_type}</p>
            </div>

            <div className="bg-black/30 rounded-lg p-3">
              <p className="text-xs text-gray-500">Document Type</p>
              <p className="text-white">{DOC_TYPES[doc.document_type] || doc.document_type}</p>
            </div>

            {doc.document_number && (
              <div className="bg-black/30 rounded-lg p-3">
                <p className="text-xs text-gray-500">Document Number</p>
                <p className="text-white font-mono">{doc.document_number}</p>
              </div>
            )}

            <div className="bg-black/30 rounded-lg p-3">
              <p className="text-xs text-gray-500">Current Status</p>
              <p className={`text-${STATUS_CONFIG[doc.status]?.color || 'gray'}-400 capitalize`}>
                {STATUS_CONFIG[doc.status]?.label}
              </p>
            </div>

            {doc.status === 'pending' || doc.status === 'under_review' ? (
              <>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Action</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAction('approved')}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                        action === 'approved'
                          ? 'bg-green-600 text-white'
                          : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                      }`}
                    >
                      <CheckCircle className="w-4 h-4 inline mr-1" />
                      Approve
                    </button>
                    <button
                      onClick={() => setAction('rejected')}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                        action === 'rejected'
                          ? 'bg-red-600 text-white'
                          : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                      }`}
                    >
                      <XCircle className="w-4 h-4 inline mr-1" />
                      Reject
                    </button>
                  </div>
                </div>

                {action === 'rejected' && (
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Rejection Reason</label>
                    <select
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
                    >
                      <option value="">Select reason...</option>
                      <option value="blurry">Document is blurry/unreadable</option>
                      <option value="expired">Document has expired</option>
                      <option value="mismatch">Name/details don't match</option>
                      <option value="incomplete">Document is incomplete</option>
                      <option value="fake">Suspected fake document</option>
                      <option value="wrong_type">Wrong document type</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Notes (optional)</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add review notes..."
                    rows={3}
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm resize-none"
                  />
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={!action || processing || (action === 'rejected' && !rejectionReason)}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
                >
                  {processing ? 'Processing...' : 'Submit Review'}
                </button>
              </>
            ) : (
              <div className="bg-black/30 rounded-lg p-3">
                <p className="text-xs text-gray-500">Reviewed At</p>
                <p className="text-white">{doc.reviewed_at ? new Date(doc.reviewed_at).toLocaleString() : '-'}</p>
                {doc.review_notes && (
                  <>
                    <p className="text-xs text-gray-500 mt-2">Notes</p>
                    <p className="text-gray-300 text-sm">{doc.review_notes}</p>
                  </>
                )}
                {doc.rejection_reason && (
                  <>
                    <p className="text-xs text-gray-500 mt-2">Rejection Reason</p>
                    <p className="text-red-400 text-sm">{doc.rejection_reason}</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
