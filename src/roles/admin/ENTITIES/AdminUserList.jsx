import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../../supabase';
import { Link, useNavigate } from 'react-router-dom';
import { UserCircle, Search, RefreshCw, Eye, Clock, TrendingUp, TrendingDown, Download } from 'lucide-react';

function UserCard({ user }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="h-1 bg-indigo-500" />
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-900 text-sm truncate">{user.name || user.email || 'Anonymous User'}</h3>
            <p className="text-xs text-slate-400 font-mono mt-0.5" style={{ fontFamily: 'var(--font-mono)' }}>{user.id?.slice(0, 12)}...</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-green-50 rounded-lg p-2 border border-green-100">
            <p className="text-xs text-green-600 mb-0.5 flex items-center gap-1"><TrendingUp className="w-3 h-3" />Payins</p>
            <p className="text-sm font-bold text-green-700">{user.totalPayins || 0}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-2 border border-blue-100">
            <p className="text-xs text-blue-600 mb-0.5 flex items-center gap-1"><TrendingDown className="w-3 h-3" />Payouts</p>
            <p className="text-sm font-bold text-blue-700">{user.totalPayouts || 0}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-3">
          <Clock className="w-3 h-3" />
          {user.createdAt?.seconds ? new Date(user.createdAt.seconds * 1000).toLocaleDateString('en-IN') : 'Unknown'}
        </div>

        <Link to={`/admin/users/${user.id}`} className="w-full flex items-center justify-center gap-1.5 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold hover:bg-indigo-100 active:scale-[0.97] transition-all">
          <Eye className="w-3.5 h-3.5" /> View Details
        </Link>
      </div>
    </div>
  );
}

export default function AdminUserList() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchUsers = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      setUsers((data || []).map(u => ({
        ...u,
        name: u.display_name || u.email,
        createdAt: u.created_at ? { seconds: new Date(u.created_at).getTime() / 1000 } : null,
      })));
      setLoading(false);
    };
    fetchUsers();
  }, []);

  const filtered = useMemo(() => {
    if (!search) return users;
    const s = search.toLowerCase();
    return users.filter(u => u.name?.toLowerCase().includes(s) || u.email?.toLowerCase().includes(s) || u.id?.toLowerCase().includes(s));
  }, [users, search]);

  const handleExport = () => {
    const csv = [
      ['ID', 'Name', 'Email', 'Total Payins', 'Total Payouts', 'Created'],
      ...filtered.map(u => [u.id, u.name || '', u.email || '', u.totalPayins || 0, u.totalPayouts || 0, u.createdAt?.seconds ? new Date(u.createdAt.seconds * 1000).toISOString() : ''])
    ].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `users-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl shadow-sm"><UserCircle className="w-5 h-5 text-white" /></div>
            Users
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">End-user accounts</p>
        </div>
        <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 text-sm font-semibold">
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="text" placeholder="Search name, email, ID..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" /></div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(user => <UserCard key={user.id} user={user} />)}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <UserCircle className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No users found</p>
        </div>
      )}
    </div>
  );
}