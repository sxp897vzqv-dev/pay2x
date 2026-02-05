import React from 'react';
import { Trash2 } from 'lucide-react';

export default function TeamMemberCard({ member, onRemove }) {
  const roleColors = {
    admin: 'bg-purple-100 text-purple-700',
    finance: 'bg-blue-100 text-blue-700',
    viewer: 'bg-slate-100 text-slate-700',
  };

  return (
    <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-blue-400 rounded-full flex items-center justify-center text-white font-bold">
          {member.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-slate-900 text-sm">{member.name}</p>
          <p className="text-xs text-slate-500">{member.email}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${roleColors[member.role] || roleColors.viewer}`}>
          {member.role?.toUpperCase()}
        </span>
        <button onClick={() => onRemove(member.id)}
          className="w-8 h-8 flex items-center justify-center hover:bg-red-50 rounded-lg">
          <Trash2 className="w-4 h-4 text-red-500" />
        </button>
      </div>
    </div>
  );
}
