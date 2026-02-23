-- ============================================
-- RUN THIS IN PAY2X SUPABASE SQL EDITOR
-- Configures webhooks for RealShaadi
-- ============================================

-- STEP 1: Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- STEP 2: Configure RealShaadi merchant webhook URL
UPDATE merchants 
SET 
  webhook_url = 'https://realshaadi.com/api/webhooks/pay2x',
  webhook_secret = 'whsec_69c1b802a6254a72b5b741245076d1b4',
  updated_at = now()
WHERE live_api_key = 'live_1771152712640_w502o';

-- STEP 3: Create immediate webhook trigger
CREATE OR REPLACE FUNCTION send_payin_webhook_immediately()
RETURNS TRIGGER AS $$
DECLARE
  v_merchant RECORD;
  v_event_type TEXT;
  v_payload JSONB;
  v_signature TEXT;
  v_request_id BIGINT;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('completed', 'failed', 'rejected', 'expired') THEN RETURN NEW; END IF;
  
  SELECT id, webhook_url, webhook_secret INTO v_merchant
  FROM merchants WHERE id = NEW.merchant_id;
  
  IF v_merchant.webhook_url IS NULL OR v_merchant.webhook_url = '' THEN RETURN NEW; END IF;
  
  v_event_type := CASE NEW.status
    WHEN 'completed' THEN 'payin.completed'
    WHEN 'failed' THEN 'payin.failed'
    WHEN 'rejected' THEN 'payin.failed'
    WHEN 'expired' THEN 'payin.expired'
    ELSE 'payin.updated'
  END;
  
  v_payload := jsonb_build_object(
    'event', v_event_type,
    'timestamp', extract(epoch from now()) * 1000,
    'data', jsonb_build_object(
      'payinId', NEW.id, 'txnId', NEW.txn_id, 'orderId', NEW.order_id,
      'amount', NEW.amount, 'status', NEW.status, 'utrId', NEW.utr,
      'userId', NEW.user_id, 'completedAt', NEW.completed_at, 'metadata', NEW.metadata
    )
  );
  
  v_signature := encode(hmac(v_payload::TEXT, COALESCE(v_merchant.webhook_secret, ''), 'sha256'), 'hex');
  
  -- Send webhook immediately
  SELECT net.http_post(
    url := v_merchant.webhook_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Webhook-Signature', v_signature,
      'X-Webhook-Event', v_event_type,
      'User-Agent', 'Pay2X-Webhooks/2.0'
    ),
    body := v_payload,
    timeout_milliseconds := 10000
  ) INTO v_request_id;
  
  -- Log it
  INSERT INTO payin_webhook_queue (payin_id, merchant_id, webhook_url, webhook_secret, event_type, payload, status, attempts)
  VALUES (NEW.id, NEW.merchant_id, v_merchant.webhook_url, v_merchant.webhook_secret, v_event_type, v_payload, 'sent', 1);
  
  -- Update UPI stats
  IF NEW.upi_pool_id IS NOT NULL THEN
    IF NEW.status = 'completed' THEN
      PERFORM increment_upi_success(NEW.upi_pool_id, NEW.amount);
    ELSIF NEW.status IN ('failed', 'rejected') THEN
      PERFORM increment_upi_failure(NEW.upi_pool_id);
    END IF;
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO payin_webhook_queue (payin_id, merchant_id, webhook_url, webhook_secret, event_type, payload, status, last_error)
  VALUES (NEW.id, NEW.merchant_id, v_merchant.webhook_url, v_merchant.webhook_secret, v_event_type, v_payload, 'pending', SQLERRM);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- STEP 4: Install the trigger
DROP TRIGGER IF EXISTS payin_status_webhook_trigger ON payins;
CREATE TRIGGER payin_status_webhook_trigger
  AFTER UPDATE ON payins FOR EACH ROW
  EXECUTE FUNCTION send_payin_webhook_immediately();

-- STEP 5: Verify setup
SELECT 
  business_name,
  webhook_url,
  CASE WHEN webhook_secret IS NOT NULL THEN '✅ Set' ELSE '❌ Missing' END as secret,
  is_active
FROM merchants 
WHERE live_api_key = 'live_1771152712640_w502o';
