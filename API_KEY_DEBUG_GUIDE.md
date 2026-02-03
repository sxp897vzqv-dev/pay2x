# API Key Generation Debug Guide

## How to Debug API Key Issues

### Step 1: Open Browser Console
1. Open the pay2x app in browser
2. Press `F12` or right-click → Inspect
3. Go to **Console** tab
4. Navigate to **API & Webhooks** page

---

## Console Logs to Watch For

### 1. Page Load (Initial)
```
🚀 MerchantAPI.jsx loaded
🔑 MerchantAPI: Component mounted, user: <uid>
🔍 MerchantAPI: Fetching merchant data for uid: <uid>
📦 MerchantAPI: Query result - found docs: 1
📄 MerchantAPI: Merchant document ID: <docId>
🔑 MerchantAPI: Current API keys: { live: 'EMPTY', test: 'EMPTY' }
✅ MerchantAPI: State updated successfully
🎴 APIKeyCard (live): Rendered with apiKey: EMPTY/NULL
🎴 APIKeyCard (test): Rendered with apiKey: EMPTY/NULL
```

**✅ GOOD:** If you see "found docs: 1" and "State updated successfully"
**❌ BAD:** If you see "found docs: 0" → merchant document missing!

---

### 2. Click Generate Button
```
🖱️ APIKeyCard (live): Regenerate button clicked
🔄 handleRegenerateKey: Called with mode: live
🔄 handleRegenerateKey: Current keys state: { live: '', test: '' }
🔄 handleRegenerateKey: Has existing key? false
🔄 handleRegenerateKey: Current user: <uid>
🔑 handleRegenerateKey: Generated new key: live_1738589800_abc123
📡 handleRegenerateKey: Querying merchant document...
📦 handleRegenerateKey: Found merchants: 1
💾 handleRegenerateKey: Updating document: <docId>
💾 handleRegenerateKey: Field: liveApiKey
💾 handleRegenerateKey: New value: live_1738589800_abc123
✅ handleRegenerateKey: Firestore update successful
🔄 handleRegenerateKey: Updating state to: { live: 'live_1738589800_abc123', test: '' }
🎉 handleRegenerateKey: ✅ Live API key generated successfully!
🏁 handleRegenerateKey: Setting regenerating to false
```

**✅ GOOD:** All steps complete, key appears in UI
**❌ BAD:** Check where it stops!

---

## Common Errors & Solutions

### Error 1: "No merchant document found"
```
❌ MerchantAPI: No merchant document found for uid: <uid>
```

**Solution:**
1. Check if `merchants` collection exists in Firestore
2. Verify merchant document has field `uid: <current_user_uid>`
3. Create document manually:
   ```javascript
   // In Firebase Console → Firestore
   Collection: merchants
   Document ID: <auto>
   Fields:
     uid: "<user_uid>"
     liveApiKey: ""
     testApiKey: ""
   ```

---

### Error 2: "Found merchants: 0"
```
📦 handleRegenerateKey: Found merchants: 0
❌ handleRegenerateKey: No merchant document found
```

**Solution:** Same as Error 1 - merchant document missing

---

### Error 3: Firestore Permission Denied
```
❌ handleRegenerateKey: Error: Missing or insufficient permissions
```

**Solution:** Check `firestore.rules`:
```javascript
match /merchants/{merchantId} {
  allow read, write: if request.auth != null && 
                        resource.data.uid == request.auth.uid;
}
```

---

### Error 4: Key Generated but UI Doesn't Update
```
✅ handleRegenerateKey: Firestore update successful
🔄 handleRegenerateKey: Updating state to: { live: 'live_xxx', test: '' }
🎴 APIKeyCard (live): Rendered with apiKey: EMPTY/NULL  ❌ STILL EMPTY!
```

**Solution:** React state not updating properly
- Check if `setApiKeys` is working
- Look for conflicting state updates
- Try hard refresh (Ctrl+Shift+R)

---

### Error 5: Button Click Does Nothing
```
🖱️ APIKeyCard (live): Regenerate button clicked
(nothing else happens)
```

**Solution:**
- Check if `onRegenerate` callback is passed correctly
- Check browser console for JavaScript errors
- Verify button is not disabled

---

## Quick Debugging Checklist

1. [ ] Open Console (F12)
2. [ ] Navigate to API & Webhooks
3. [ ] Look for: "Component mounted, user: <uid>"
4. [ ] Check: "found docs: 1" (not 0)
5. [ ] Click Generate button
6. [ ] Watch for: "Generated new key: live_xxx"
7. [ ] Confirm: "Firestore update successful"
8. [ ] Verify: Key appears in UI

---

## Testing Steps

### Test 1: Fresh Install
1. Clear browser cache
2. Sign in
3. Go to API & Webhooks
4. Check console for "No merchant document found"
5. If so, create merchant document manually

### Test 2: Generate Live Key
1. Click "Generate" on Live API Key
2. Watch console logs
3. Confirm success message appears
4. Copy key and verify it's the correct value

### Test 3: Regenerate Existing Key
1. Click "Regenerate" on Live API Key
2. Confirm warning appears
3. Click OK
4. Verify new key is different from old key

---

## Where to Send Console Output

When reporting bugs, copy ALL console output that includes:
- 🔑 (key emoji) logs
- 🔄 (refresh emoji) logs  
- ❌ (X emoji) error logs
- The full error message if any

**Example:**
```
Copy everything from Console tab:
🔑 MerchantAPI: Component mounted...
...
❌ handleRegenerateKey: Error: ...
```

---

## Firebase Collection Structure

For reference, merchant document should look like:
```
merchants/{docId}
  ├─ uid: "abc123xyz"
  ├─ liveApiKey: "live_1738589800_abc123" (or empty string)
  ├─ testApiKey: "test_1738589800_xyz789" (or empty string)
  ├─ webhookUrl: "https://..."
  ├─ webhookSecret: "..."
  └─ webhookEvents: ["payin.success", ...]
```

---

## Expected Console Output (Success Case)

**Full successful flow:**
```
🚀 MerchantAPI.jsx loaded
🔑 MerchantAPI: Component mounted, user: xyz123
🔍 MerchantAPI: Fetching merchant data for uid: xyz123
📦 MerchantAPI: Query result - found docs: 1
📄 MerchantAPI: Merchant document ID: doc123
🔑 MerchantAPI: Current API keys: { live: 'EMPTY', test: 'EMPTY' }
✅ MerchantAPI: State updated successfully
🎴 APIKeyCard (live): Rendered with apiKey: EMPTY/NULL
🎴 APIKeyCard (live): hasKey = false
🎴 APIKeyCard (test): Rendered with apiKey: EMPTY/NULL
🎴 APIKeyCard (test): hasKey = false

[User clicks Generate on Live API Key]

🖱️ APIKeyCard (live): Regenerate button clicked
🔄 handleRegenerateKey: Called with mode: live
🔄 handleRegenerateKey: Current keys state: { live: '', test: '' }
🔄 handleRegenerateKey: Has existing key? false
🔄 handleRegenerateKey: Current user: xyz123
🔑 handleRegenerateKey: Generated new key: live_1738589800_abc123
📡 handleRegenerateKey: Querying merchant document...
📦 handleRegenerateKey: Found merchants: 1
💾 handleRegenerateKey: Updating document: doc123
💾 handleRegenerateKey: Field: liveApiKey
💾 handleRegenerateKey: New value: live_1738589800_abc123
✅ handleRegenerateKey: Firestore update successful
🔄 handleRegenerateKey: Updating state to: { live: 'live_1738589800_abc123', test: '' }
🎉 handleRegenerateKey: ✅ Live API key generated successfully!
🏁 handleRegenerateKey: Setting regenerating to false
🎴 APIKeyCard (live): Rendered with apiKey: live_1738589800...
🎴 APIKeyCard (live): hasKey = true

[Success toast appears in UI]
```

---

Last Updated: 2026-02-03 18:06 GMT+5:30
