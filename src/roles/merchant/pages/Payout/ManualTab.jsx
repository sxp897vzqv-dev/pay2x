import React, { useState } from 'react';
import { db } from '../../../../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import {
  Plus,
  Trash2,
  Send,
  RefreshCw,
  CreditCard,
  Building2,
  AlertCircle
} from 'lucide-react';
import { validatePayoutRow } from './payoutValidation';

const ManualTab = ({ merchantId, onPayoutsCreated }) => {
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [formData, setFormData] = useState({
    userId: '',
    upiId: '',
    accountNumber: '',
    ifscCode: '',
    bankName: '',
    accountHolderName: '',
    amount: ''
  });
  const [cart, setCart] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (field, value) => {
    setFormData({ ...formData, [field]: value });
  };

  const validateForm = () => {
    const errors = validatePayoutRow({
      ...formData,
      merchantId: merchantId,
      upiId: paymentMethod === 'upi' ? formData.upiId : '',
      accountNumber: paymentMethod === 'bank' ? formData.accountNumber : '',
      ifscCode: paymentMethod === 'bank' ? formData.ifscCode : '',
      bankName: paymentMethod === 'bank' ? formData.bankName : ''
    });
    return errors;
  };

  const addToCart = () => {
    const errors = validateForm();
    
    if (errors.length > 0) {
      alert('Please fix errors:\n' + errors.join('\n'));
      return;
    }

    const payout = {
      id: Date.now(),
      userId: formData.userId,
      paymentMethod,
      accountHolderName: formData.accountHolderName,
      amount: Number(formData.amount),
      ...(paymentMethod === 'upi'
        ? { upiId: formData.upiId }
        : {
            accountNumber: formData.accountNumber,
            ifscCode: formData.ifscCode,
            bankName: formData.bankName
          })
    };

    setCart([...cart, payout]);
    
    // Reset form
    setFormData({
      userId: '',
      upiId: '',
      accountNumber: '',
      ifscCode: '',
      bankName: '',
      accountHolderName: '',
      amount: ''
    });
  };

  const removeFromCart = (id) => {
    setCart(cart.filter(item => item.id !== id));
  };

  const handleSubmit = async () => {
    if (cart.length === 0) {
      alert('Cart is empty');
      return;
    }

    if (!window.confirm(`Create ${cart.length} payouts?`)) {
      return;
    }

    setSubmitting(true);

    try {
      for (const item of cart) {
        const payoutData = {
          userId: item.userId,
          merchantId: merchantId,
          paymentMethod: item.paymentMethod,
          accountHolderName: item.accountHolderName,
          amount: item.amount,
          createdBy: merchantId,
          creationMethod: 'manual',
          status: 'pending',
          requestTime: serverTimestamp()
        };

        if (item.paymentMethod === 'upi') {
          payoutData.upiId = item.upiId;
        } else {
          payoutData.accountNumber = item.accountNumber;
          payoutData.ifscCode = item.ifscCode;
          payoutData.bankName = item.bankName;
        }

        await addDoc(collection(db, 'payouts'), payoutData);
      }

      alert(`Successfully created ${cart.length} payouts!`);
      setCart([]);
      
      if (onPayoutsCreated) onPayoutsCreated();
    } catch (error) {
      alert('Error creating payouts: ' + error.message);
    }

    setSubmitting(false);
  };

  const totalAmount = cart.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Form */}
      <div className="space-y-6">
        <div className="bg-white rounded-2xl p-6 border-2 border-slate-200">
          <h3 className="text-lg font-bold text-slate-900 mb-6">Add Payout Details</h3>

          {/* Payment Method Toggle */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <button
              onClick={() => setPaymentMethod('upi')}
              className={`p-4 rounded-xl font-semibold transition-all border-2 ${
                paymentMethod === 'upi'
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <CreditCard className="w-6 h-6 mx-auto mb-2" />
              UPI
            </button>
            <button
              onClick={() => setPaymentMethod('bank')}
              className={`p-4 rounded-xl font-semibold transition-all border-2 ${
                paymentMethod === 'bank'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Building2 className="w-6 h-6 mx-auto mb-2" />
              Bank Account
            </button>
          </div>

          <div className="space-y-4">
            {/* User ID */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                User ID *
              </label>
              <input
                type="text"
                value={formData.userId}
                onChange={(e) => handleChange('userId', e.target.value)}
                placeholder="user123"
                className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
              />
            </div>

            {/* UPI ID or Bank Details */}
            {paymentMethod === 'upi' ? (
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  UPI ID *
                </label>
                <input
                  type="text"
                  value={formData.upiId}
                  onChange={(e) => handleChange('upiId', e.target.value)}
                  placeholder="user@paytm"
                  className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono"
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Account Number *
                  </label>
                  <input
                    type="text"
                    value={formData.accountNumber}
                    onChange={(e) => handleChange('accountNumber', e.target.value)}
                    placeholder="1234567890123"
                    className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    IFSC Code *
                  </label>
                  <input
                    type="text"
                    value={formData.ifscCode}
                    onChange={(e) => handleChange('ifscCode', e.target.value.toUpperCase())}
                    placeholder="SBIN0001234"
                    className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Bank Name *
                  </label>
                  <input
                    type="text"
                    value={formData.bankName}
                    onChange={(e) => handleChange('bankName', e.target.value)}
                    placeholder="State Bank of India"
                    className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </>
            )}

            {/* Account Holder Name */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Account Holder Name *
              </label>
              <input
                type="text"
                value={formData.accountHolderName}
                onChange={(e) => handleChange('accountHolderName', e.target.value)}
                placeholder="John Doe"
                className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Amount (Rs.100 - Rs.50,000) *
              </label>
              <input
                type="number"
                value={formData.amount}
                onChange={(e) => handleChange('amount', e.target.value)}
                placeholder="5000"
                min="100"
                max="50000"
                className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent font-bold text-lg"
              />
            </div>

            <button
              onClick={addToCart}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-bold text-lg shadow-lg"
            >
              <Plus className="w-6 h-6" />
              Add to Cart
            </button>
          </div>
        </div>
      </div>

      {/* Cart */}
      <div className="space-y-6">
        <div className="bg-white rounded-2xl p-6 border-2 border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-900">
              Cart ({cart.length} {cart.length === 1 ? 'item' : 'items'})
            </h3>
            {cart.length > 0 && (
              <button
                onClick={() => setCart([])}
                className="text-sm text-red-600 hover:text-red-700 font-semibold"
              >
                Clear All
              </button>
            )}
          </div>

          {cart.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600 font-medium">Cart is empty</p>
              <p className="text-sm text-slate-500 mt-1">Add payouts using the form</p>
            </div>
          ) : (
            <>
              <div className="space-y-3 mb-6 max-h-[400px] overflow-y-auto">
                {cart.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="font-mono text-sm font-semibold text-slate-900 mb-1">
                          {item.userId}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          {item.paymentMethod === 'upi' ? (
                            <>
                              <CreditCard className="w-4 h-4 text-purple-600" />
                              <span className="font-mono">{item.upiId}</span>
                            </>
                          ) : (
                            <>
                              <Building2 className="w-4 h-4 text-blue-600" />
                              <span className="font-mono">{item.accountNumber}</span>
                            </>
                          )}
                        </div>
                        <p className="text-sm text-slate-600 mt-1">{item.accountHolderName}</p>
                      </div>
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                      <span className="text-sm text-slate-600">Amount:</span>
                      <span className="text-lg font-bold text-slate-900">
                        Rs.{item.amount.toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl border-2 border-blue-200 mb-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-slate-700">Total Amount:</span>
                  <span className="text-2xl font-extrabold text-blue-700">
                    Rs.{totalAmount.toLocaleString()}
                  </span>
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-bold text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-6 h-6 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Send className="w-6 h-6" />
                    Create {cart.length} Payouts
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ManualTab;