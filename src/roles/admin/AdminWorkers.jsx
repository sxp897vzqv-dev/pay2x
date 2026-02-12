import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { createWorker, deleteWorker } from '../../supabaseAdmin';
import {
  Users, Plus, X, Shield, Check, Edit2, Trash2,
  ToggleLeft, ToggleRight, CheckSquare, Square,
  Loader, AlertCircle, Search, Mail,
} from 'lucide-react';

const ALL_PERMISSIONS = [
  { key: 'traders', label: 'Traders', desc: 'View and manage traders' },
  { key: 'merchants', label: 'Merchants', desc: 'View and manage merchants' },
  { key: 'users', label: 'Users', desc: 'View users' },
  { key: 'payins', label: 'Payins', desc: 'View and manage payins' },
  { key: 'payouts', label: 'Payouts', desc: 'View and manage payouts' },
  { key: 'disputes', label: 'Disputes', desc: 'View and manage disputes' },
  { key: 'upi_pool', label: 'UPI Pool', desc: 'Manage UPI pool' },
  { key: 'payin_engine', label: 'Payin Engine', desc: 'Payin engine dashboard' },
  { key: 'payout_engine', label: 'Payout Engine', desc: 'Payout engine dashboard' },
  { key: 'dispute_engine', label: 'Dispute Engine', desc: 'Dispute engine + resolve' },
  { key: 'logs', label: 'Audit Logs', desc: 'View audit logs' },
  { key: 'commission', label: 'Commission', desc: 'View commission reports' },
];

export default function AdminWorkers() {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingWorker, setEditingWorker] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Create form state (no password - auto-generated)
  const [createForm, setCreateForm] = useState({
    name: '', email: '', permissions: [],
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Edit form state
  const [editPermissions, setEditPermissions] = useState([]);
  const [saving, setSaving] = useState(false);

  // Delete state
  const [deletingId, setDeletingId] = useState(null);

  const fetchWorkers = async () => {
    const { data, error } = await supabase
      .from('workers')
      .select('*')
      .order('name', { ascending: true });
    if (error) { console.error('Error fetching workers:', error); }
    setWorkers((data || []).map(w => ({ ...w, isActive: w.is_active })));
    setLoading(false);
  };

  useEffect(() => { fetchWorkers(); }, []);

  /* ─── Create Worker ─── */
  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateError('');

    if (!createForm.name.trim() || !createForm.email.trim()) {
      setCreateError('Name and email are required');
      return;
    }

    setCreating(true);
    try {
      const result = await createWorker({
        name: createForm.name.trim(),
        email: createForm.email.trim(),
        permissions: createForm.permissions,
      });
      
      if (!result.success) {
        throw new Error('Failed to create worker');
      }
      
      // Reset form & close
      setCreateForm({ name: '', email: '', permissions: [] });
      setShowCreate(false);
      fetchWorkers();
      
      // Show success message
      alert(`Worker created! Login credentials have been sent to ${createForm.email.trim()}`);
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  /* ─── Toggle Active ─── */
  const handleToggleActive = async (worker) => {
    try {
      await supabase.from('workers').update({ is_active: !worker.isActive }).eq('id', worker.id);
      fetchWorkers();
    } catch (err) {
      console.error('Toggle error:', err);
      alert('Failed to toggle worker status');
    }
  };

  /* ─── Save Permissions ─── */
  const handleSavePermissions = async () => {
    if (!editingWorker) return;
    setSaving(true);
    try {
      await supabase.from('workers').update({ permissions: editPermissions }).eq('id', editingWorker.id);
      setEditingWorker(null);
      fetchWorkers();
    } catch (err) {
      console.error('Save error:', err);
      alert('Failed to update permissions');
    } finally {
      setSaving(false);
    }
  };

  /* ─── Delete Worker ─── */
  const handleDelete = async (worker) => {
    if (!window.confirm(`Delete worker "${worker.name}"? This will remove their account and all records.`)) return;
    setDeletingId(worker.id);
    try {
      await deleteWorker(worker.id);
      fetchWorkers();
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete worker: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  /* ─── Permission toggle helpers ─── */
  const toggleCreatePermission = (key) => {
    setCreateForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(key)
        ? prev.permissions.filter(p => p !== key)
        : [...prev.permissions, key],
    }));
  };
  const selectAllCreate = () => setCreateForm(prev => ({ ...prev, permissions: ALL_PERMISSIONS.map(p => p.key) }));
  const deselectAllCreate = () => setCreateForm(prev => ({ ...prev, permissions: [] }));

  const toggleEditPermission = (key) => {
    setEditPermissions(prev =>
      prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]
    );
  };
  const selectAllEdit = () => setEditPermissions(ALL_PERMISSIONS.map(p => p.key));
  const deselectAllEdit = () => setEditPermissions([]);

  /* ─── Open edit modal ─── */
  const openEdit = (worker) => {
    setEditingWorker(worker);
    setEditPermissions(worker.permissions || []);
  };

  /* ─── Filter workers ─── */
  const filtered = workers.filter(w => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (w.name || '').toLowerCase().includes(q) || (w.email || '').toLowerCase().includes(q);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="w-7 h-7 text-indigo-600" />
            Worker Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">Create and manage worker accounts with granular permissions</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl hover:from-indigo-700 hover:to-violet-700 transition-all font-medium text-sm shadow-lg"
        >
          <Plus className="w-4 h-4" />
          Create Worker
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search workers by name or email..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm"
        />
      </div>

      {/* Workers List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">
            {workers.length === 0 ? 'No workers yet' : 'No workers match your search'}
          </p>
          {workers.length === 0 && (
            <p className="text-gray-400 text-sm mt-1">Create your first worker to get started</p>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map(worker => (
            <div key={worker.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                {/* Left: Info */}
                <div className="flex items-start gap-4 min-w-0">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${worker.isActive ? 'bg-indigo-100' : 'bg-gray-100'}`}>
                    <Users className={`w-5 h-5 ${worker.isActive ? 'text-indigo-600' : 'text-gray-400'}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 truncate">{worker.name || 'Unnamed'}</h3>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        worker.isActive
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {worker.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 truncate">{worker.email}</p>
                    {/* Permission badges */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {(worker.permissions || []).length === 0 ? (
                        <span className="text-xs text-gray-400 italic">No permissions</span>
                      ) : (
                        (worker.permissions || []).map(perm => {
                          const permInfo = ALL_PERMISSIONS.find(p => p.key === perm);
                          return (
                            <span
                              key={perm}
                              className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100"
                            >
                              {permInfo?.label || perm}
                            </span>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Toggle active */}
                  <button
                    onClick={() => handleToggleActive(worker)}
                    className={`p-2 rounded-lg transition-colors ${
                      worker.isActive
                        ? 'text-green-600 hover:bg-green-50'
                        : 'text-gray-400 hover:bg-gray-100'
                    }`}
                    title={worker.isActive ? 'Deactivate' : 'Activate'}
                  >
                    {worker.isActive
                      ? <ToggleRight className="w-5 h-5" />
                      : <ToggleLeft className="w-5 h-5" />
                    }
                  </button>
                  {/* Edit permissions */}
                  <button
                    onClick={() => openEdit(worker)}
                    className="p-2 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-colors"
                    title="Edit permissions"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(worker)}
                    disabled={deletingId === worker.id}
                    className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                    title="Delete worker"
                  >
                    {deletingId === worker.id
                      ? <Loader className="w-4 h-4 animate-spin" />
                      : <Trash2 className="w-4 h-4" />
                    }
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══════ CREATE WORKER MODAL ═══════ */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-2xl z-10">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-600" />
                Create Worker
              </h2>
              <button onClick={() => setShowCreate(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-5">
              {createError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {createError}
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
                <input
                  type="text"
                  required
                  value={createForm.name}
                  onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm"
                  placeholder="Worker name"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <input
                  type="email"
                  required
                  value={createForm.email}
                  onChange={e => setCreateForm(p => ({ ...p, email: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm"
                  placeholder="worker@example.com"
                />
                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                  <Mail className="w-3 h-3" />
                  Password will be auto-generated and emailed
                </p>
              </div>

              {/* Permissions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Permissions</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={selectAllCreate} className="text-xs text-indigo-600 hover:underline">Select all</button>
                    <span className="text-gray-300">|</span>
                    <button type="button" onClick={deselectAllCreate} className="text-xs text-gray-500 hover:underline">Deselect all</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_PERMISSIONS.map(perm => {
                    const checked = createForm.permissions.includes(perm.key);
                    return (
                      <button
                        key={perm.key}
                        type="button"
                        onClick={() => toggleCreatePermission(perm.key)}
                        className={`flex items-start gap-2 p-2.5 rounded-lg border text-left transition-colors text-sm ${
                          checked
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-800'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {checked
                          ? <CheckSquare className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                          : <Square className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
                        }
                        <div>
                          <p className="font-medium text-xs">{perm.label}</p>
                          <p className="text-[10px] opacity-70">{perm.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={creating}
                className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-violet-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {creating ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Create Worker
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ═══════ EDIT PERMISSIONS MODAL ═══════ */}
      {editingWorker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEditingWorker(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-2xl z-10">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Edit Permissions</h2>
                <p className="text-sm text-gray-500">{editingWorker.name} — {editingWorker.email}</p>
              </div>
              <button onClick={() => setEditingWorker(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">Permissions</label>
                <div className="flex gap-2">
                  <button onClick={selectAllEdit} className="text-xs text-indigo-600 hover:underline">Select all</button>
                  <span className="text-gray-300">|</span>
                  <button onClick={deselectAllEdit} className="text-xs text-gray-500 hover:underline">Deselect all</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {ALL_PERMISSIONS.map(perm => {
                  const checked = editPermissions.includes(perm.key);
                  return (
                    <button
                      key={perm.key}
                      type="button"
                      onClick={() => toggleEditPermission(perm.key)}
                      className={`flex items-start gap-2 p-2.5 rounded-lg border text-left transition-colors text-sm ${
                        checked
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-800'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {checked
                        ? <CheckSquare className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                        : <Square className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
                      }
                      <div>
                        <p className="font-medium text-xs">{perm.label}</p>
                        <p className="text-[10px] opacity-70">{perm.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleSavePermissions}
                disabled={saving}
                className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-violet-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Save Permissions
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
