-- ============================================
-- Immediate Webhook Delivery
-- Send webhooks instantly when payin status changes
-- Uses pg_net for HTTP requests
-- ============================================

-- Enable pg_net if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Enhanced webhook trigger that sends immediately
CREATE OR REPLACE FUNCTION send_payin_webhook_immediately()
RETURNS TRIGGER AS $$
DECLARE
  v_merchant RECORD;
  v_event_type TEXT;
  v_payload JSONB;
  v_signature TEXT;
  v_request_id BIGINT;
BEGIN
  -- Only trigger on status change to final states
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  
  IF NEW.status NOT IN ('completed', 'failed', 'rejected', 'expired') THEN
    RETURN NEW;
  END IF;
  
  -- Get merchant webhook config
  SELECT id, webhook_url, webhook_secret, business_name
  INTO v_merchant
  FROM merchants
  WHERE id = NEW.merchant_id;
  
  -- Skip if no webhook URL configured
  IF v_merchant.webhook_url IS NULL OR v_merchant.webhook_url = '' THEN
    RAISE NOTICE 'No webhook URL for merchant %', NEW.merchant_id;
    RETURN NEW;
  END IF;
  
  -- Determine event type
  v_event_type := CASE NEW.status
    WHEN 'completed' THEN 'payin.completed'
    WHEN 'failed' THEN 'payin.failed'
    WHEN 'rejected' THEN 'payin.failed'
    WHEN 'expired' THEN 'payin.expired'
    ELSE 'payin.updated'
  END;
  
  -- Build payload
  v_payload := jsonb_build_object(
    'event', v_event_type,
    'timestamp', extract(epoch from now()) * 1000,
    'data', jsonb_build_object(
      'payinId', NEW.id,
      'txnId', NEW.txn_id,
      'orderId', NEW.order_id,
      'amount', NEW.amount,
      'status', NEW.status,
      'utrId', NEW.utr,
      'userId', NEW.user_id,
      'completedAt', NEW.completed_at,
      'metadata', NEW.metadata
    )
  );
  
  -- Generate HMAC signature
  v_signature := encode(
    hmac(v_payload::TEXT, COALESCE(v_merchant.webhook_secret, ''), 'sha256'),
    'hex'
  );
  
  -- Send webhook immediately via pg_net
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
  
  -- Log the webhook (for debugging)
  INSERT INTO payin_webhook_queue (
    payin_id, merchant_id, webhook_url, webhook_secret, 
    event_type, payload, status, attempts
  ) VALUES (
    NEW.id, 
    NEW.merchant_id, 
    v_merchant.webhook_url, 
    v_merchant.webhook_secret,
    v_event_type,
    v_payload,
    'sent',  -- Mark as sent since we're sending immediately
    1
  );
  
  RAISE NOTICE 'Webhook sent for payin % to % (request_id: %)', 
    NEW.id, v_merchant.webhook_url, v_request_id;
  
  -- Update UPI stats
  IF NEW.upi_pool_id IS NOT NULL THEN
    IF NEW.status = 'completed' THEN
      PERFORM increment_upi_success(NEW.upi_pool_id, NEW.amount);
    ELSIF NEW.status IN ('failed', 'rejected') THEN
      PERFORM increment_upi_failure(NEW.upi_pool_id);
    END IF;
  END IF;
  
  RETURN NEW;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the transaction
    RAISE WARNING 'Webhook error for payin %: %', NEW.id, SQLERRM;
    
    -- Still queue it for retry
    INSERT INTO payin_webhook_queue (
      payin_id, merchant_id, webhook_url, webhook_secret, 
      event_type, payload, status, last_error
    ) VALUES (
      NEW.id, 
      NEW.merchant_id, 
      v_merchant.webhook_url, 
      v_merchant.webhook_secret,
      v_event_type,
      v_payload,
      'pending',
      SQLERRM
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Replace the old trigger with the new immediate one
DROP TRIGGER IF EXISTS payin_status_webhook_trigger ON payins;
CREATE TRIGGER payin_status_webhook_trigger
  AFTER UPDATE ON payins
  FOR EACH ROW
  EXECUTE FUNCTION send_payin_webhook_immediately();

-- Verify
SELECT 'Immediate webhook trigger installed!' as status;
