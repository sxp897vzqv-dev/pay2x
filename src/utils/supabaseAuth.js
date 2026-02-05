// src/utils/supabaseAuth.js
// Helper functions for Supabase authentication
import { supabase } from '../supabase';

/**
 * Sign in with email and password
 * @returns {{ user, session }} auth data
 */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

/**
 * Sign out current user
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Get current authenticated user (makes network request to verify)
 * @returns {object|null} user object or null
 */
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * Get current session (local, no network request)
 * @returns {object|null} session object or null
 */
export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

/**
 * Get user profile from profiles table
 * @param {string} userId - UUID of the user (auth.users.id)
 * @returns {object|null} profile row or null
 */
export async function getUserProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching profile:', error);
    return null;
  }
  return data;
}

/**
 * Get user role from profiles table
 * @param {string} userId - UUID of the user
 * @returns {string|null} role string or null
 */
export async function getUserRole(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (error) return null;
  return data?.role || null;
}

/**
 * Check if the entity (trader/merchant/worker) is active
 * Admins are always considered active.
 * @param {string} role - 'trader' | 'merchant' | 'worker' | 'admin'
 * @param {string} profileId - UUID of the profile (= auth.users.id)
 * @returns {{ isActive: boolean, entity: object|null }}
 */
export async function checkEntityActive(role, profileId) {
  const tableMap = {
    trader: 'traders',
    merchant: 'merchants',
    worker: 'workers',
  };

  const tableName = tableMap[role];
  if (!tableName) return { isActive: true, entity: null }; // admin — always active

  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .eq('profile_id', profileId)
    .single();

  if (error || !data) return { isActive: false, entity: null };
  return { isActive: data.is_active === true, entity: data };
}

/**
 * Map a role to its dashboard route
 * @param {string} role
 * @returns {string} route path
 */
export function getRouteForRole(role) {
  const routes = {
    admin: '/admin/dashboard',
    worker: '/admin/dashboard',
    merchant: '/merchant/dashboard',
    trader: '/trader/dashboard',
  };
  return routes[role] || '/signin';
}
