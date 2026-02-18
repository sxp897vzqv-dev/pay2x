# Pay2X Trader Manual
## Complete Guide for Payment Processing

---

# Table of Contents

1. [Getting Started](#1-getting-started)
2. [Dashboard Overview](#2-dashboard-overview)
3. [Managing UPIs & Banks](#3-managing-upis--banks)
4. [Processing Payins](#4-processing-payins)
5. [Handling Payouts](#5-handling-payouts)
6. [Balance Management](#6-balance-management)
   - [USDT Deposits](#61-usdt-deposits-adding-balance)
7. [Disputes](#7-disputes)
8. [Important Rules](#8-important-rules)
9. [FAQs](#9-faqs)

---

# 1. Getting Started

## 1.1 Logging In

1. Open the Pay2X trader portal URL provided by admin
2. Enter your registered email and password
3. Click **Sign In**

> ⚠️ **Security Tip:** Never share your login credentials with anyone.

## 1.2 Navigation

The trader panel has two navigation modes:

**Desktop:** Sidebar on the left with all menu options

**Mobile:** 
- Bottom navigation bar with 5 main sections
- Hamburger menu (☰) for additional options like Disputes

### Menu Items:
| Icon | Section | Purpose |
|------|---------|---------|
| 🏠 | Dashboard | Overview of your performance |
| ↗️ | Payins | Accept incoming payments |
| ↘️ | Payouts | Process outgoing payments |
| 🏦 | Banks & UPI | Manage your UPI accounts |
| 💰 | Balance | View balance & commission history |
| ⚠️ | Disputes | Handle payment disputes |

---

# 2. Dashboard Overview

The Dashboard shows your real-time performance metrics:

## 2.1 Key Metrics

| Metric | Description |
|--------|-------------|
| **Working Balance** | Available balance (Total - Security Hold) |
| **Today's Payins** | Number of payins processed today |
| **Today's Payouts** | Number of payouts completed today |
| **Success Rate** | Your overall transaction success percentage |
| **Commission Earned** | Total commission earned |

## 2.2 Real-Time Updates

All numbers update in real-time. You don't need to refresh the page.

---

# 3. Managing UPIs & Banks

## 3.1 Adding a New UPI

1. Go to **Banks & UPI** section
2. Click **+ Add UPI** button
3. Follow the 3-step wizard:

### Step 1: Select Type
- **UPI Provider:** GPay, PhonePe, Paytm, BHIM, or Others
- **Account Type:** Savings, Current, or Corporate
- **QR Type:** Personal or Merchant QR

### Step 2: Enter Details
- **UPI ID** (required): e.g., `yourname@ybl`
- **Holder Name** (required): Account holder's name
- **Bank** (required): Select from dropdown
- **Account Number** (required): Bank account number
- **IFSC Code** (required): 11-character IFSC code
- **Mobile Number** (optional)

> ✅ IFSC auto-detects bank branch, city, and state

### Step 3: Set Limits
- **Daily Limit:** Maximum transactions per day (₹)
- **Per Transaction Limit:** Maximum single transaction (₹)
- **Monthly Limit:** Maximum monthly volume (₹)

4. Click **Add UPI** to save

## 3.2 Activating UPI (Adding to Pool)

After adding, UPI is **inactive** by default.

**To activate:**
1. Find the UPI card
2. Click the toggle switch (🔘) on the right
3. UPI moves to "IN POOL" status

> ⚠️ **Minimum Balance Required:** Your working balance must be ₹30,000+ to activate any UPI.

## 3.3 Deactivating UPI

Click the toggle switch again to remove UPI from the active pool.

## 3.4 Editing UPI

1. Click **Edit** button on the UPI card
2. Modify details (UPI ID cannot be changed)
3. Save changes

## 3.5 Deleting UPI

1. Click **Delete** button
2. Confirm deletion
3. UPI is soft-deleted (can be recovered by admin if needed)

---

# 4. Processing Payins

## 4.1 How Payins Work

1. Customer initiates payment on merchant website
2. System assigns your UPI based on scoring algorithm
3. You receive the payin in your **Pending** tab
4. Customer sends money to your UPI
5. Customer submits UTR number
6. You verify and **Accept** or **Reject**

## 4.2 Payin Tabs

| Tab | Shows |
|-----|-------|
| **Pending** | Payins waiting for your action |
| **Completed** | Successfully processed payins |
| **Rejected** | Rejected or expired payins |

## 4.3 Payin Card Information

Each payin card shows:
- **Transaction ID:** Unique identifier
- **User ID:** Customer identifier
- **UPI ID:** Your UPI where payment is expected
- **UTR:** Customer's transaction reference (when submitted)
- **Amount:** Payment amount with your commission
- **Timer:** Countdown for customer to pay

## 4.4 Timer & Auto-Reject

- Customer has **15 minutes** to submit UTR
- Timer shows on each pending payin
- If UTR not submitted in time → **Auto-rejected**
- Timer turns red when < 3 minutes remaining

## 4.5 Accepting a Payin

1. Wait for customer to submit UTR
2. Verify payment received in your bank app
3. Match the UTR number
4. Click **Accept** ✅

> ⚠️ Only accept if money is actually received!

## 4.6 Rejecting a Payin

Click **Reject** ❌ if:
- Payment not received
- Wrong amount received
- UTR doesn't match
- Suspicious transaction

## 4.7 Editing Amount

If customer paid a different amount:
1. Click the ✏️ edit icon next to amount
2. Enter the actual received amount
3. Confirm the change
4. Then Accept/Reject

## 4.8 Commission

Your commission is shown on each payin:
- **Fee:** ₹X (Y%)
- This amount is added to your balance on completion

---

# 5. Handling Payouts

## 5.1 How Payouts Work

1. You request payouts to withdraw your earnings
2. System assigns pending merchant payouts to you
3. You pay the customer from your own funds
4. Upload proof and mark complete
5. Your balance is credited back + commission

## 5.2 Requesting Payouts

1. Go to **Payouts** → **Request** tab
2. Enter amount (Min ₹5,000 - Max ₹1,00,000 per request)
3. Click **Request Payout**

### Assignment Rules:
- System assigns matching payouts automatically
- May get multiple smaller payouts to match your request
- Maximum assignment = 120% of requested amount
- If no match available → Added to waiting list

## 5.3 Payout Tabs

| Tab | Shows |
|-----|-------|
| **Request** | Create new payout request |
| **Assigned** | Payouts assigned to you (need action) |
| **History** | Completed/cancelled payouts |

## 5.4 Processing Assigned Payouts

Each assigned payout shows:
- **Payout ID:** Unique identifier
- **Amount:** Amount to pay
- **Customer Details:**
  - UPI ID
  - Account Number
  - Beneficiary Name
  - IFSC Code

### Steps to Complete:

1. **Pay the customer** using bank app/NEFT/IMPS/UPI
2. Click **Complete** on the payout card
3. **Enter UTR** (transaction reference)
4. **Upload Proof** (screenshot of payment)
   - Statement screenshot
   - Or video recording
5. Click **Submit**

> ✅ Uploads happen in background - you can navigate away

## 5.5 Batch Verification

For multiple payouts:
1. Complete all payments
2. Click **Batch Upload** 
3. Upload single video showing all transactions
4. System links proof to all pending payouts

## 5.6 Cancelling Request

You can cancel your payout request if:
- No payouts assigned yet
- You change your mind

Click **Cancel Request** on the active request banner.

---

# 6. Balance Management

## 6.1 USDT Deposits (Adding Balance)

You can add funds to your trader balance by depositing USDT (Tether).

### How USDT Deposits Work

1. Go to **Balance** section
2. Click **Deposit USDT** button
3. You'll see:
   - **USDT Address:** Platform's TRC-20 wallet address
   - **Current USDT Rate:** Live INR rate (updates from Binance P2P)
   - **Minimum Deposit:** 10 USDT

### Deposit Steps

1. **Copy the USDT Address** (TRC-20 network only!)
2. **Send USDT** from your wallet (Binance, Trust Wallet, etc.)
3. **Enter Transaction Hash (TXID)** after sending
4. **Submit** and wait for confirmation

### Rate Calculation

| Item | Value |
|------|-------|
| **Admin Rate** | Average of top 5 Binance P2P sellers |
| **Trader Rate** | Admin Rate - ₹1 (platform fee) |
| **Your Credit** | USDT Amount × Trader Rate |

**Example:**
- You deposit: 100 USDT
- Admin rate: ₹93
- Trader rate: ₹92 (93 - 1)
- You receive: ₹9,200 in balance

### Important Rules

- ⚠️ **TRC-20 Network Only** - Do not send on other networks (ERC-20, BEP-20)
- ⏱️ Confirmation takes 5-30 minutes depending on network
- 📊 Rate is locked at time of submission
- ❌ Wrong network = funds may be lost permanently
- ✅ Minimum deposit: 10 USDT

### Deposit Status

| Status | Meaning |
|--------|---------|
| **Pending** | Waiting for blockchain confirmation |
| **Confirming** | Transaction found, waiting for confirmations |
| **Completed** | Balance credited to your account |
| **Failed** | Transaction not found or invalid |

### Tips

- Always double-check the wallet address before sending
- Save your TXID as proof
- Don't close the page until you submit the TXID
- Contact admin if deposit not credited within 1 hour

---

## 6.2 Balance Types

| Type | Description |
|------|-------------|
| **Total Balance** | Your full balance in system |
| **Security Hold** | Amount held for security (set by admin) |
| **Working Balance** | Total - Security Hold (available for operations) |

## 6.3 Balance Flow

### Payin Completed:
- Your balance **decreases** by payin amount
- Your commission **adds** to balance
- Net effect: Balance decreases by (Amount - Commission)

### Payout Completed:
- Your balance **increases** by payout amount
- Your commission **adds** to balance
- Net effect: Balance increases by (Amount + Commission)

## 6.4 Commission Tracking

View your earnings in the Balance section:
- Today's commission
- This week's commission
- Total commission earned

---

# 7. Disputes

## 7.1 What are Disputes?

Disputes arise when:
- Customer claims payment was made but not credited
- Amount mismatch between customer claim and receipt
- Payment stuck or delayed

## 7.2 Dispute Flow

1. **Pending** → New dispute assigned to you
2. **Review** → Check your records, bank statement
3. **Accept/Reject** → Based on your findings
4. **Admin Review** → Final decision by admin
5. **Resolved** → Dispute closed

## 7.3 Responding to Disputes

1. Open the dispute card
2. Review customer's claim and UTR
3. Check your bank records
4. Click **Accept** if valid or **Reject** if invalid
5. Add notes explaining your decision
6. Upload supporting documents if needed

## 7.4 Chat with Admin

Each dispute has a conversation thread:
- Add messages to communicate with admin
- Upload additional proof
- Track dispute progress

---

# 8. Important Rules

## 8.1 Balance Requirements

| Rule | Requirement |
|------|-------------|
| Minimum balance to activate UPI | ₹30,000 |
| Auto-deactivation below | ₹30,000 |
| Maximum payout request | ₹1,00,000 |
| Minimum payout request | ₹5,000 |

## 8.2 Payin Rules

- ✅ Only accept after verifying payment in bank
- ✅ Match UTR number before accepting
- ❌ Never accept without actual payment
- ⏱️ Payins auto-reject after 15 min without UTR

## 8.3 Payout Rules

- ✅ Always upload valid payment proof
- ✅ Enter correct UTR
- ✅ Complete payouts within 30 minutes
- ❌ Never mark complete without actual payment

## 8.4 UPI Pool Rules

- 🔄 UPIs rotate automatically for fair distribution
- 📊 Your success rate affects UPI selection priority
- ⚡ Recently used UPIs get cooldown period
- 🌍 Geo-matching prefers UPIs in customer's location

---

# 9. FAQs

## Q: Why is my UPI not receiving payins?

**A:** Check if:
1. UPI is toggled ON (in pool)
2. Your balance is above ₹30,000
3. Daily limit not exhausted
4. No recent failures affecting score

## Q: Why can't I activate my UPI?

**A:** Your working balance must be ₹30,000 or more. Add funds to your account.

## Q: What happens if customer pays wrong amount?

**A:** Edit the amount on the payin card before accepting. This ensures correct commission calculation.

## Q: Can I cancel an accepted payin?

**A:** No. Once accepted, payins cannot be reversed. Contact admin for disputes.

## Q: How is my commission calculated?

**A:** Commission = Amount × Your Rate (%). Rate is set by admin in your trader profile.

## Q: Why was I auto-assigned fewer payouts than requested?

**A:** System limits assignment to 120% of your request. If no exact match, you get partial assignment and join waiting list.

## Q: How do I increase my success rate?

**A:** 
- Accept/reject promptly
- Avoid expired payins
- Complete payouts quickly
- Maintain good balance

## Q: What if I made a mistake on a payout?

**A:** Contact admin immediately through the dispute section with proof.

---

# Support

For technical issues or disputes, contact your Pay2X administrator.

---

*Pay2X Trader Manual v1.1*  
*Last Updated: 18 February 2026*
