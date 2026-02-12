import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabase';
import { createAffiliate } from '../../supabaseAdmin';
import { 
  Users, Plus, Search, Filter, MoreVertical, Eye, Edit2, 
  Ban, CheckCircle, TrendingUp, DollarSign, Calendar,
  CreditCard, UserPlus, X, Save, Building, Phone, Mail
} from 'lucide-react';

export default function AdminAffiliates() {
  const [affiliates, setAffiliates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // create, edit, view, settle
  const [selectedAffiliate, setSelectedAffiliate] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    default_commission_rate: 5,
    bank_account_number: '',
    bank_ifsc: '',
    bank_account_name: '',
    bank_name: '',
  });
  const [settlements, setSettlements] = useState([]);
  const [pendingSettlements, setPendingSettlements] = useState([]);
  const [activeTab, setActiveTab] = useState('affiliates'); // affiliates, settlements
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    totalEarnings: 0,
    pendingSettlement: 0
  });

  useEffect(() => {
    fetchAffiliates();
    fetchStats();
    if (activeTab === 'settlements') {
      fetchSettlements();
    }
  }, [activeTab]);

  const fetchAffiliates = async () => {
    setLoading(true);
    
    // Try view first, fallback to table
    let { data, error } = await supabase
      .from('affiliate_dashboard_view')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.warn('View not found, falling back to affiliates table:', error.message);
      // Fallback to direct table query
      const result = await supabase
        .from('affiliates')
        .select('*')
        .order('created_at', { ascending: false });
      data = result.data;
      error = result.error;
    }
    
    if (error) {
      console.error('Error fetching affiliates:', error);
    }
    
    setAffiliates(data || []);
    setLoading(false);
  };

  const fetchStats = async () => {
    const { data } = await supabase
      .from('affiliates')
      .select('status, total_earned, pending_settlement');
    
    if (data) {
      setStats({
        total: data.length,
        active: data.filter(a => a.status === 'active').length,
        totalEarnings: data.reduce((sum, a) => sum + Number(a.total_earned || 0), 0),
        pendingSettlement: data.reduce((sum, a) => sum + Number(a.pending_settlement || 0), 0)
      });
    }
  };

  const fetchSettlements = async () => {
    const { data } = await supabase
      .from('affiliate_settlements')
      .select(`
        *,
        affiliate:affiliates(name, email)
      `)
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (data) {
      setSettlements(data);
      setPendingSettlements(data.filter(s => s.status === 'pending'));
    }
  };

  const filteredAffiliates = useMemo(() => {
    return affiliates.filter(a => {
      const matchesSearch = 
        a.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.email?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [affiliates, searchQuery, statusFilter]);

  const handleCreateAffiliate = async () => {
    try {
      if (!formData.name.trim() || !formData.email.trim()) {
        alert('Name and email are required');
        return;
      }

      const result = await createAffiliate({
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone,
        default_commission_rate: formData.default_commission_rate,
        bank_account_number: formData.bank_account_number,
        bank_ifsc: formData.bank_ifsc,
        bank_account_name: formData.bank_account_name,
        bank_name: formData.bank_name,
      });

      if (!result.success) {
        throw new Error('Failed to create affiliate');
      }

      setShowModal(false);
      resetForm();
      fetchAffiliates();
      fetchStats();
      
      alert(`Affiliate created! Login credentials have been sent to ${formData.email.trim()}`);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleUpdateAffiliate = async () => {
    try {
      const { error } = await supabase
        .from('affiliates')
        .update({
          name: formData.name,
          phone: formData.phone,
          default_commission_rate: formData.default_commission_rate,
          bank_account_number: formData.bank_account_number,
          bank_ifsc: formData.bank_ifsc,
          bank_account_name: formData.bank_account_name,
          bank_name: formData.bank_name
        })
        .eq('id', selectedAffiliate.id);

      if (error) throw error;

      setShowModal(false);
      fetchAffiliates();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleToggleStatus = async (affiliate) => {
    const newStatus = affiliate.status === 'active' ? 'suspended' : 'active';
    await supabase
      .from('affiliates')
      .update({ status: newStatus })
      .eq('id', affiliate.id);
    fetchAffiliates();
    fetchStats();
  };

  const handleGenerateSettlement = async (affiliateId) => {
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const monthStart = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1)
      .toISOString().split('T')[0];

    const { data, error } = await supabase.rpc('generate_affiliate_settlement', {
      p_affiliate_id: affiliateId,
      p_month: monthStart
    });

    if (error) {
      alert('Error: ' + error.message);
    } else if (data?.success) {
      alert(`Settlement created: ₹${data.amount} for ${data.earnings_count} transactions`);
      fetchSettlements();
      fetchAffiliates();
    } else {
      alert('Error: ' + (data?.error || 'Unknown error'));
    }
  };

  const handleCompleteSettlement = async (settlement) => {
    const reference = prompt('Enter transaction reference (UTR):');
    if (!reference) return;

    const { data: { user } } = await supabase.auth.getUser();
    
    const { data, error } = await supabase.rpc('complete_affiliate_settlement', {
      p_settlement_id: settlement.id,
      p_admin_id: user.id,
      p_transaction_reference: reference
    });

    if (error) {
      alert('Error: ' + error.message);
    } else if (data?.success) {
      alert('Settlement marked as completed');
      fetchSettlements();
      fetchAffiliates();
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      default_commission_rate: 5,
      bank_account_number: '',
      bank_ifsc: '',
      bank_account_name: '',
      bank_name: '',
    });
    setSelectedAffiliate(null);
  };

  const openEditModal = (affiliate) => {
    setSelectedAffiliate(affiliate);
    setFormData({
      name: affiliate.name,
      email: affiliate.email,
      phone: affiliate.phone || '',
      default_commission_rate: affiliate.default_commission_rate,
      bank_account_number: affiliate.bank_account_number || '',
      bank_ifsc: affiliate.bank_ifsc || '',
      bank_account_name: affiliate.bank_account_name || '',
      bank_name: affiliate.bank_name || '',
    });
    setModalMode('edit');
    setShowModal(true);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Affiliates</h1>
          <p className="text-gray-600">Manage affiliate partners and settlements</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setModalMode('create');
            setShowModal(true);
          }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <UserPlus size={20} />
          Add Affiliate
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Affiliates</p>
              <p className="text-xl font-bold">{stats.total}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Active</p>
              <p className="text-xl font-bold">{stats.active}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <TrendingUp size={20} className="text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Earnings</p>
              <p className="text-xl font-bold">₹{stats.totalEarnings.toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <DollarSign size={20} className="text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending Settlement</p>
              <p className="text-xl font-bold">₹{stats.pendingSettlement.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b">
        <button
          onClick={() => setActiveTab('affiliates')}
          className={`pb-3 px-1 font-medium ${
            activeTab === 'affiliates'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500'
          }`}
        >
          Affiliates
        </button>
        <button
          onClick={() => setActiveTab('settlements')}
          className={`pb-3 px-1 font-medium ${
            activeTab === 'settlements'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500'
          }`}
        >
          Settlements {pendingSettlements.length > 0 && (
            <span className="ml-1 bg-orange-100 text-orange-600 text-xs px-2 py-0.5 rounded-full">
              {pendingSettlements.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'affiliates' && (
        <>
          {/* Filters */}
          <div className="flex gap-4 mb-4">
            <div className="relative flex-1 max-w-md">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search affiliates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border rounded-lg px-3 py-2"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          {/* Affiliates Table */}
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Affiliate</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Commission</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Traders</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Earnings</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Pending</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-gray-500">Loading...</td>
                  </tr>
                ) : filteredAffiliates.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-gray-500">No affiliates found</td>
                  </tr>
                ) : (
                  filteredAffiliates.map((affiliate) => (
                    <tr key={affiliate.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-gray-900">{affiliate.name}</p>
                          <p className="text-sm text-gray-500">{affiliate.email}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-blue-600 font-medium">
                          {affiliate.default_commission_rate}%
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium">{affiliate.total_traders || 0}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium">₹{Number(affiliate.total_earned || 0).toLocaleString()}</p>
                          <p className="text-xs text-gray-500">
                            30d: ₹{Number(affiliate.earnings_30d || 0).toLocaleString()}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-orange-600 font-medium">
                          ₹{Number(affiliate.pending_settlement || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          affiliate.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {affiliate.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEditModal(affiliate)}
                            className="p-1 hover:bg-gray-100 rounded"
                            title="Edit"
                          >
                            <Edit2 size={16} className="text-gray-600" />
                          </button>
                          <button
                            onClick={() => handleToggleStatus(affiliate)}
                            className="p-1 hover:bg-gray-100 rounded"
                            title={affiliate.status === 'active' ? 'Suspend' : 'Activate'}
                          >
                            {affiliate.status === 'active' ? (
                              <Ban size={16} className="text-red-600" />
                            ) : (
                              <CheckCircle size={16} className="text-green-600" />
                            )}
                          </button>
                          {affiliate.pending_settlement > 0 && (
                            <button
                              onClick={() => handleGenerateSettlement(affiliate.id)}
                              className="p-1 hover:bg-gray-100 rounded"
                              title="Generate Settlement"
                            >
                              <CreditCard size={16} className="text-blue-600" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === 'settlements' && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Affiliate</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Month</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Amount</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Transactions</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Reference</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {settlements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-500">No settlements yet</td>
                </tr>
              ) : (
                settlements.map((settlement) => (
                  <tr key={settlement.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium">{settlement.affiliate?.name}</p>
                        <p className="text-sm text-gray-500">{settlement.affiliate?.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {new Date(settlement.settlement_month).toLocaleDateString('en-IN', { 
                        month: 'long', year: 'numeric' 
                      })}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      ₹{Number(settlement.amount).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">{settlement.earnings_count}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        settlement.status === 'completed'
                          ? 'bg-green-100 text-green-700'
                          : settlement.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {settlement.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {settlement.transaction_reference || '-'}
                    </td>
                    <td className="px-4 py-3">
                      {settlement.status === 'pending' && (
                        <button
                          onClick={() => handleCompleteSettlement(settlement)}
                          className="text-sm text-blue-600 hover:underline"
                        >
                          Mark Paid
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-semibold">
                {modalMode === 'create' ? 'Add New Affiliate' : 'Edit Affiliate'}
              </h2>
              <button onClick={() => setShowModal(false)}>
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Affiliate name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="email@example.com"
                  disabled={modalMode === 'edit'}
                />
                {modalMode === 'create' && (
                  <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                    <Mail size={12} />
                    Password will be auto-generated and emailed
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="+91 9876543210"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Commission Rate (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={formData.default_commission_rate}
                  onChange={(e) => setFormData({...formData, default_commission_rate: parseFloat(e.target.value)})}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <div className="border-t pt-4 mt-4">
                <h3 className="font-medium text-gray-900 mb-3">Bank Details</h3>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Bank Name</label>
                    <input
                      type="text"
                      value={formData.bank_name}
                      onChange={(e) => setFormData({...formData, bank_name: e.target.value})}
                      className="w-full border rounded-lg px-3 py-2"
                      placeholder="HDFC Bank"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">IFSC</label>
                    <input
                      type="text"
                      value={formData.bank_ifsc}
                      onChange={(e) => setFormData({...formData, bank_ifsc: e.target.value.toUpperCase()})}
                      className="w-full border rounded-lg px-3 py-2"
                      placeholder="HDFC0001234"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm text-gray-600 mb-1">Account Number</label>
                    <input
                      type="text"
                      value={formData.bank_account_number}
                      onChange={(e) => setFormData({...formData, bank_account_number: e.target.value})}
                      className="w-full border rounded-lg px-3 py-2"
                      placeholder="1234567890"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm text-gray-600 mb-1">Account Holder Name</label>
                    <input
                      type="text"
                      value={formData.bank_account_name}
                      onChange={(e) => setFormData({...formData, bank_account_name: e.target.value})}
                      className="w-full border rounded-lg px-3 py-2"
                      placeholder="John Doe"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-4 border-t">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={modalMode === 'create' ? handleCreateAffiliate : handleUpdateAffiliate}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <Save size={18} />
                {modalMode === 'create' ? 'Create Affiliate' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
