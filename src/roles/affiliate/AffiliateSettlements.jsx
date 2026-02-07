import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../supabase';
import { CreditCard, CheckCircle, Clock, Calendar, DollarSign } from 'lucide-react';

export default function AffiliateSettlements() {
  const { affiliate } = useOutletContext();
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (affiliate) {
      fetchSettlements();
    }
  }, [affiliate]);

  const fetchSettlements = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('affiliate_settlements')
      .select('*')
      .eq('affiliate_id', affiliate.id)
      .order('settlement_month', { ascending: false });

    if (!error) {
      setSettlements(data || []);
    }
    setLoading(false);
  };

  const totalSettled = settlements
    .filter(s => s.status === 'completed')
    .reduce((sum, s) => sum + Number(s.amount), 0);

  const pendingSettlement = settlements
    .filter(s => s.status === 'pending')
    .reduce((sum, s) => sum + Number(s.amount), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settlements</h1>
        <p className="text-gray-600">View your monthly settlement history</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Settled</p>
              <p className="text-xl font-bold text-green-600">₹{totalSettled.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Clock size={20} className="text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending Settlement</p>
              <p className="text-xl font-bold text-orange-600">
                ₹{Number(affiliate?.pending_settlement || 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Calendar size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Next Settlement</p>
              <p className="text-xl font-bold">2nd of month</p>
            </div>
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <CreditCard size={20} className="text-blue-600 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-900">How Settlements Work</h3>
            <p className="text-sm text-blue-700 mt-1">
              Your earnings are automatically settled on the 2nd of every month. 
              The settlement will be transferred to your registered bank account. 
              If the 2nd falls on a holiday, settlement will be processed on the next working day.
            </p>
          </div>
        </div>
      </div>

      {/* Settlements Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-gray-900">Settlement History</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Month</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Amount</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Transactions</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Reference</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Paid On</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-500">Loading...</td>
              </tr>
            ) : settlements.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-500">
                  No settlements yet. Your first settlement will appear after the 2nd of next month.
                </td>
              </tr>
            ) : (
              settlements.map((settlement) => (
                <tr key={settlement.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">
                    {new Date(settlement.settlement_month).toLocaleDateString('en-IN', {
                      month: 'long',
                      year: 'numeric'
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-green-600 font-bold">
                      ₹{Number(settlement.amount).toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3">{settlement.earnings_count}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                      settlement.status === 'completed'
                        ? 'bg-green-100 text-green-700'
                        : settlement.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {settlement.status === 'completed' && <CheckCircle size={12} />}
                      {settlement.status === 'pending' && <Clock size={12} />}
                      {settlement.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {settlement.transaction_reference || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {settlement.processed_at 
                      ? new Date(settlement.processed_at).toLocaleDateString()
                      : '-'
                    }
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Bank Details */}
      <div className="bg-white rounded-xl shadow-sm border p-4">
        <h2 className="font-semibold text-gray-900 mb-3">Settlement Bank Account</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Bank Name</p>
            <p className="font-medium">{affiliate?.bank_name || 'Not set'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Account Number</p>
            <p className="font-medium">
              {affiliate?.bank_account_number 
                ? '****' + affiliate.bank_account_number.slice(-4)
                : 'Not set'
              }
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">IFSC</p>
            <p className="font-medium">{affiliate?.bank_ifsc || 'Not set'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Account Holder</p>
            <p className="font-medium">{affiliate?.bank_account_name || 'Not set'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
