// src/roles/merchant/MerchantTeam.jsx
// Team member management

import { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { 
  UserGroupIcon, 
  PlusIcon,
  EnvelopeIcon,
  TrashIcon,
  PencilIcon,
  CheckCircleIcon,
  ClockIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

const ROLES = [
  { id: 'owner', name: 'Owner', description: 'Full access to everything', color: 'purple' },
  { id: 'admin', name: 'Admin', description: 'Manage team, settings, and transactions', color: 'blue' },
  { id: 'developer', name: 'Developer', description: 'API keys, webhooks, and integration', color: 'green' },
  { id: 'viewer', name: 'Viewer', description: 'View-only access to dashboard', color: 'gray' },
];

export default function MerchantTeam() {
  const [loading, setLoading] = useState(true);
  const [merchant, setMerchant] = useState(null);
  const [members, setMembers] = useState([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [inviteForm, setInviteForm] = useState({ email: '', name: '', role: 'viewer' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: merchantData } = await supabase
        .from('merchants')
        .select('*')
        .eq('profile_id', user.id)
        .single();
      setMerchant(merchantData);

      if (merchantData) {
        const { data: teamData } = await supabase
          .from('merchant_team')
          .select('*')
          .eq('merchant_id', merchantData.id)
          .order('created_at', { ascending: true });
        setMembers(teamData || []);
      }
    } catch (err) {
      console.error('Error loading team:', err);
    }
    setLoading(false);
  }

  async function inviteMember(e) {
    e.preventDefault();
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase.from('merchant_team').insert({
        merchant_id: merchant.id,
        email: inviteForm.email,
        name: inviteForm.name,
        role: inviteForm.role,
        invited_by: user.id,
      });

      if (error) throw error;

      // Log activity
      await supabase.rpc('log_merchant_activity', {
        p_merchant_id: merchant.id,
        p_user_id: user.id,
        p_action: 'invite_team_member',
        p_resource_type: 'team_member',
        p_resource_id: inviteForm.email,
        p_details: { role: inviteForm.role }
      });

      setShowInviteModal(false);
      setInviteForm({ email: '', name: '', role: 'viewer' });
      loadData();
    } catch (err) {
      console.error('Error inviting member:', err);
      alert('Failed to invite member: ' + err.message);
    }
    setSaving(false);
  }

  async function updateMemberRole(memberId, newRole) {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('merchant_team')
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq('id', memberId);

      if (error) throw error;

      await supabase.rpc('log_merchant_activity', {
        p_merchant_id: merchant.id,
        p_user_id: user.id,
        p_action: 'update_team_role',
        p_resource_type: 'team_member',
        p_resource_id: memberId,
        p_details: { new_role: newRole }
      });

      setEditingMember(null);
      loadData();
    } catch (err) {
      console.error('Error updating role:', err);
      alert('Failed to update role');
    }
  }

  async function removeMember(member) {
    if (!confirm(`Remove ${member.name || member.email} from the team?`)) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('merchant_team')
        .delete()
        .eq('id', member.id);

      if (error) throw error;

      await supabase.rpc('log_merchant_activity', {
        p_merchant_id: merchant.id,
        p_user_id: user.id,
        p_action: 'remove_team_member',
        p_resource_type: 'team_member',
        p_resource_id: member.email,
      });

      loadData();
    } catch (err) {
      console.error('Error removing member:', err);
      alert('Failed to remove member');
    }
  }

  function getRoleColor(role) {
    const r = ROLES.find(r => r.id === role);
    const colors = {
      purple: 'bg-purple-100 text-purple-700',
      blue: 'bg-blue-100 text-blue-700',
      green: 'bg-green-100 text-green-700',
      gray: 'bg-gray-100 text-gray-700',
    };
    return colors[r?.color] || colors.gray;
  }

  function formatDate(date) {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <UserGroupIcon className="h-7 w-7 text-indigo-500" />
            Team Members
          </h1>
          <p className="text-gray-500 mt-1">Manage who has access to your merchant account</p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
        >
          <PlusIcon className="h-5 w-5" />
          Invite Member
        </button>
      </div>

      {/* Role Guide */}
      <div className="bg-white rounded-lg shadow mb-6 p-4">
        <h3 className="font-medium text-gray-900 mb-3">Role Permissions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {ROLES.map(role => (
            <div key={role.id} className="p-3 bg-gray-50 rounded-lg">
              <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getRoleColor(role.id)}`}>
                {role.name}
              </span>
              <p className="text-xs text-gray-500 mt-2">{role.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Team List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">
            {members.length} Team Member{members.length !== 1 ? 's' : ''}
          </h2>
        </div>

        {members.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <UserGroupIcon className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No team members yet</p>
            <p className="text-sm mt-1">Invite your first team member to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {members.map(member => (
              <div key={member.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                    <span className="text-indigo-600 font-medium">
                      {(member.name || member.email).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {member.name || 'Unnamed'}
                    </p>
                    <p className="text-sm text-gray-500 flex items-center gap-2">
                      <EnvelopeIcon className="h-4 w-4" />
                      {member.email}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {member.accepted_at ? (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircleIcon className="h-4 w-4" />
                      Active
                    </span>
                  ) : (
                    <span className="text-xs text-yellow-600 flex items-center gap-1">
                      <ClockIcon className="h-4 w-4" />
                      Pending
                    </span>
                  )}

                  {editingMember === member.id ? (
                    <select
                      value={member.role}
                      onChange={(e) => updateMemberRole(member.id, e.target.value)}
                      className="text-sm border rounded-lg px-2 py-1"
                      autoFocus
                      onBlur={() => setEditingMember(null)}
                    >
                      {ROLES.map(role => (
                        <option key={role.id} value={role.id}>{role.name}</option>
                      ))}
                    </select>
                  ) : (
                    <span 
                      className={`px-2 py-1 rounded text-xs font-medium cursor-pointer ${getRoleColor(member.role)}`}
                      onClick={() => setEditingMember(member.id)}
                      title="Click to change role"
                    >
                      {ROLES.find(r => r.id === member.role)?.name || member.role}
                    </span>
                  )}

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditingMember(member.id)}
                      className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                      title="Edit role"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    {member.role !== 'owner' && (
                      <button
                        onClick={() => removeMember(member)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        title="Remove member"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Invite Team Member</h3>
              <button
                onClick={() => setShowInviteModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={inviteMember}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="colleague@company.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={inviteForm.name}
                    onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role *
                  </label>
                  <select
                    value={inviteForm.role}
                    onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    {ROLES.filter(r => r.id !== 'owner').map(role => (
                      <option key={role.id} value={role.id}>
                        {role.name} - {role.description}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? 'Sending...' : 'Send Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
