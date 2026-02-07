// src/components/SessionManager.jsx
// Handles session timeout, activity tracking, and auto-logout
import React, { useEffect, useCallback, useState } from 'react';
import { supabase } from '../supabase';
import { setupActivityTracking, checkSessionValidity } from '../utils/security';
import { logAuditEvent } from '../utils/auditLogger';
import { AlertTriangle, Clock, LogOut } from 'lucide-react';

const SessionManager = ({ children, onSessionExpired }) => {
  const [showWarning, setShowWarning] = useState(false);
  const [warningCountdown, setWarningCountdown] = useState(60);

  // Check session validity periodically
  const checkSession = useCallback(async () => {
    const { valid, reason } = await checkSessionValidity();
    
    if (!valid) {
      console.log('Session invalid:', reason);
      
      // Log the session expiry
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await logAuditEvent({
          action: 'session_expired',
          category: 'security',
          entityType: 'user',
          entityId: user.id,
          entityName: user.email,
          details: {
            note: `Session expired due to ${reason}`,
            metadata: { reason },
          },
          severity: 'info',
        });
      }
      
      // Sign out and redirect
      await supabase.auth.signOut();
      localStorage.removeItem('pay2x_last_activity');
      
      if (onSessionExpired) {
        onSessionExpired(reason);
      }
    }
  }, [onSessionExpired]);

  // Show warning before timeout
  const checkIdleWarning = useCallback(() => {
    const lastActivity = localStorage.getItem('pay2x_last_activity');
    if (!lastActivity) return;
    
    const idleTime = Date.now() - parseInt(lastActivity);
    const warningThreshold = 25 * 60 * 1000; // 25 minutes (5 min before 30 min timeout)
    
    if (idleTime > warningThreshold && !showWarning) {
      setShowWarning(true);
      setWarningCountdown(300); // 5 minutes = 300 seconds
    }
  }, [showWarning]);

  // Set up activity tracking and session checks
  useEffect(() => {
    // Set up activity tracking
    const cleanupActivity = setupActivityTracking();
    
    // Check session every minute
    const sessionCheck = setInterval(checkSession, 60000);
    
    // Check for idle warning every 30 seconds
    const idleCheck = setInterval(checkIdleWarning, 30000);
    
    // Initial check
    checkSession();
    
    return () => {
      cleanupActivity();
      clearInterval(sessionCheck);
      clearInterval(idleCheck);
    };
  }, [checkSession, checkIdleWarning]);

  // Warning countdown timer
  useEffect(() => {
    if (!showWarning) return;
    
    const timer = setInterval(() => {
      setWarningCountdown((prev) => {
        if (prev <= 1) {
          // Time's up, log out
          handleLogout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [showWarning]);

  // Extend session (user clicked "Stay logged in")
  const extendSession = () => {
    localStorage.setItem('pay2x_last_activity', Date.now().toString());
    setShowWarning(false);
    setWarningCountdown(300);
  };

  // Manual logout
  const handleLogout = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await logAuditEvent({
        action: 'logout',
        category: 'security',
        entityType: 'user',
        entityId: user.id,
        entityName: user.email,
        details: {
          note: showWarning ? 'Session timeout logout' : 'Manual logout',
        },
        severity: 'info',
      });
    }
    
    await supabase.auth.signOut();
    localStorage.removeItem('pay2x_last_activity');
    window.location.href = '/signin';
  };

  // Format countdown
  const formatCountdown = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <>
      {children}
      
      {/* Session Warning Modal */}
      {showWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md mx-4 animate-fade-in">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">Session Expiring Soon</h3>
                <p className="text-sm text-gray-600 mt-1">
                  You've been inactive for a while. Your session will expire in:
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <Clock className="w-5 h-5 text-amber-600" />
                  <span className="text-2xl font-bold text-amber-600">
                    {formatCountdown(warningCountdown)}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleLogout}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Log out
              </button>
              <button
                onClick={extendSession}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Stay logged in
              </button>
            </div>
          </div>
        </div>
      )}
      
      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }
      `}</style>
    </>
  );
};

export default SessionManager;
