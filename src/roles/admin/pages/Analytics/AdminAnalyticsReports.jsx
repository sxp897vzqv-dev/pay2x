import React from 'react';
import { BarChart3, TrendingUp, PieChart, Activity } from 'lucide-react';

export const AdminAnalytics = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Analytics</h1>
        <p className="text-slate-600 mt-1">Platform performance and insights</p>
      </div>

      <div className="bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl p-12 text-center text-white">
        <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-80" />
        <h2 className="text-2xl font-bold mb-2">Analytics Dashboard</h2>
        <p className="text-purple-100 mb-6">
          Advanced analytics and reporting features coming soon
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8 text-left">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6">
            <TrendingUp className="w-8 h-8 mb-3" />
            <h3 className="font-semibold mb-1">Growth Metrics</h3>
            <p className="text-sm text-purple-100">Track user growth and revenue trends</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6">
            <PieChart className="w-8 h-8 mb-3" />
            <h3 className="font-semibold mb-1">Transaction Analysis</h3>
            <p className="text-sm text-purple-100">Breakdown by type, status, and time</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6">
            <Activity className="w-8 h-8 mb-3" />
            <h3 className="font-semibold mb-1">Real-time Monitoring</h3>
            <p className="text-sm text-purple-100">Live transaction flow visualization</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export const AdminReports = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Reports</h1>
        <p className="text-slate-600 mt-1">Generate and download reports</p>
      </div>

      <div className="bg-gradient-to-br from-blue-500 to-cyan-600 rounded-2xl p-12 text-center text-white">
        <Activity className="w-16 h-16 mx-auto mb-4 opacity-80" />
        <h2 className="text-2xl font-bold mb-2">Reports Generator</h2>
        <p className="text-blue-100 mb-6">
          Automated report generation features coming soon
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8 text-left">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6">
            <h3 className="font-semibold mb-2">📊 Financial Reports</h3>
            <p className="text-sm text-blue-100">
              Daily, weekly, and monthly financial summaries
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6">
            <h3 className="font-semibold mb-2">👥 User Reports</h3>
            <p className="text-sm text-blue-100">
              Trader and merchant activity reports
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6">
            <h3 className="font-semibold mb-2">💳 Transaction Reports</h3>
            <p className="text-sm text-blue-100">
              Detailed transaction logs and exports
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6">
            <h3 className="font-semibold mb-2">⚠️ Compliance Reports</h3>
            <p className="text-sm text-blue-100">
              KYC, AML, and regulatory reports
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};