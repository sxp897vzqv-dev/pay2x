# Pay2X Security Implementation

## 🛡️ Security Features Added

Based on vulnerabilities discovered during the Surfgate security assessment, the following security controls have been implemented for Pay2X.

---

## ✅ Implemented Features

### 1. Rate Limiting & Account Lockout

**Files:**
- `supabase-migration/003_security.sql` - Database tables & functions
- `src/utils/security.js` - Frontend utilities
- `src/SignIn.jsx` - Updated login flow

**How it works:**
- Failed login attempts are tracked in `login_attempts` table
- After **5 failed attempts in 15 minutes**, account is locked for **30 minutes**
- Users see remaining attempts before lockout
- Locked accounts show countdown timer
- Admins can manually unlock accounts from Security Dashboard

### 2. Audit Logging (Enhanced)

**Already exists:** `src/utils/auditLogger.js`

**New logged events:**
- `login_success` - Successful logins with IP, user agent
- `login_failed` - Failed attempts with reason
- `account_locked` - When account gets locked (critical)
- `account_unlocked` - Admin unlocks account
- `session_expired` - Session timeout
- `security_setting_changed` - Config changes

### 3. Session Management

**File:** `src/components/SessionManager.jsx`

**Features:**
- Idle timeout warning (5 minutes before expiry)
- Activity tracking (mouse, keyboard, scroll)
- Automatic logout after 30 minutes idle
- Absolute session timeout (12 hours)
- "Stay logged in" option when warned

### 4. Security Dashboard (Admin)

**File:** `src/roles/admin/AdminSecurity.jsx`
**Route:** `/admin/security`

**Features:**
- View all login attempts (success/failed)
- See locked accounts with unlock option
- Configure security settings (lockout threshold, timeout, etc.)
- Search/filter by email
- Pagination for large datasets

### 5. Password Security

**File:** `src/utils/security.js`

**Features:**
- Configurable password policy
- Min length (8 chars)
- Uppercase requirement
- Number requirement
- Special character requirement (optional)
- Common password rejection

### 6. Input Validation

**File:** `src/utils/security.js`

**Functions:**
- `validateEmail()` - Email format check
- `validateUPI()` - UPI ID format check
- `validateAmount()` - Amount validation (positive, max 1 crore, 2 decimals)
- `sanitizeInput()` - XSS prevention

### 7. Sensitive Data Access Logging

**Table:** `sensitive_data_access`

Logs when users access sensitive tables like:
- Bank accounts
- API keys
- Balances
- Credentials

---

## 📋 Database Changes (003_security.sql)

### New Tables

```sql
-- Login attempts tracking
CREATE TABLE login_attempts (
  id, email, ip_address, user_agent, success, failure_reason, created_at
);

-- Account lockouts
CREATE TABLE account_lockouts (
  id, email, locked_at, locked_until, failed_attempts, last_attempt_ip
);

-- Security configuration
CREATE TABLE security_settings (
  id, setting_key, setting_value (JSONB), description
);

-- 2FA secrets (future)
CREATE TABLE user_2fa (
  id, user_id, secret_encrypted, is_enabled, backup_codes_hash
);

-- Sensitive data access audit
CREATE TABLE sensitive_data_access (
  id, user_id, table_name, record_id, fields_accessed, ip_address
);
```

### New Database Functions

- `is_account_locked(email)` - Check if locked
- `get_failed_login_count(email, window)` - Get fail count
- `record_login_attempt(...)` - Log attempt & check lockout
- `check_and_lock_account(email, ip)` - Lock if threshold exceeded
- `unlock_account(email)` - Admin unlock

### New Profile Columns

- `two_factor_enabled` - 2FA status
- `last_login_at` - Last successful login
- `last_login_ip` - Last login IP
- `failed_login_count` - Consecutive failures

---

## 🚀 How to Deploy

### Step 1: Run Database Migration

1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `supabase-migration/003_security.sql`
3. Run the SQL
4. Verify tables created:
   - `login_attempts`
   - `account_lockouts`
   - `security_settings`
   - `user_2fa`
   - `sensitive_data_access`

### Step 2: Deploy Frontend

```bash
cd C:\Users\hones\pay2x
npm run build
# Deploy to your hosting
```

### Step 3: Test

1. Go to `/signin`
2. Enter wrong password 5 times
3. Verify account lockout message appears
4. Wait 30 mins or unlock via `/admin/security`
5. Login successfully
6. Check `/admin/security` for logged attempts

---

## 🔧 Configuration

Default security settings (in `security_settings` table):

```json
{
  "rate_limit": { "max_attempts": 5, "window_minutes": 15 },
  "account_lockout": { "enabled": true, "threshold": 5, "duration_minutes": 30 },
  "password_policy": { "min_length": 8, "require_uppercase": true, "require_number": true },
  "session_timeout": { "idle_minutes": 30, "absolute_hours": 12 },
  "two_factor": { "required_roles": ["admin"], "optional_roles": ["trader", "merchant"] }
}
```

Admins can modify these via `/admin/security` → Security Settings tab.

---

## 📁 Files Changed/Created

### New Files
- `supabase-migration/003_security.sql`
- `src/utils/security.js`
- `src/components/SessionManager.jsx`
- `src/roles/admin/AdminSecurity.jsx`

### Modified Files
- `src/SignIn.jsx` - Added lockout checking & display
- `src/App.jsx` - Added AdminSecurity route
- `src/roles/admin/AdminLayout.jsx` - Added Security nav link

---

## 🔜 Future Enhancements

1. **2FA Implementation** - TOTP with backup codes (table ready)
2. **CAPTCHA** - hCaptcha/reCAPTCHA on login (config ready)
3. **IP Whitelist** - Restrict admin access by IP (config ready)
4. **Real-time Alerts** - Telegram/email on suspicious activity
5. **Password Reset Flow** - Secure token-based reset
6. **Session Fingerprinting** - Detect session hijacking

---

## 🆚 Comparison: Surfgate vs Pay2X

| Vulnerability | Surfgate | Pay2X |
|---------------|----------|-------|
| Rate Limiting | ❌ None | ✅ 5 attempts/15 min |
| Account Lockout | ❌ None | ✅ 30 min lockout |
| 2FA | ❌ All admins disabled | ⏳ Ready for implementation |
| Audit Logging | ❌ Minimal | ✅ Comprehensive |
| Session Timeout | ❌ Unknown | ✅ 30 min idle, 12h absolute |
| Sensitive Data | ❌ Bot tokens leaked | ✅ Environment variables only |
| CAPTCHA | ❌ Disabled (threshold=0) | ⏳ Config ready |
| Brute Force | ❌ 150+ attempts allowed | ✅ Blocked after 5 |

---

*Security implementation completed: 2026-02-06*
