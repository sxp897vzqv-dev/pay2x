-- ================================================
-- Pay2X Enterprise Reliability Features
-- 1. Rate Limiting
-- 2. Idempotency Keys
-- 3. Webhook Queue with Retries
-- 4. Request Logging
-- ================================================

-- ================================================
-- 1. RATE LIMITING
-- ================================================

CREATE TABLE IF NOT EXISTS rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    endpoint VARCHAR(100) NOT NULL,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    request_count INT DEFAULT 1,
    
    -- Composite key for upsert
    UNIQUE(merchant_id, endpoint, window_start)
);

CREATE INDEX idx_rate_limits_merchant ON rate_limits(merchant_id, endpoint, window_start DESC);

-- Rate limit config per plan
CREATE TABLE IF NOT EXISTS rate_limit_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan VARCHAR(50) NOT NULL UNIQUE, -- free, starter, business, enterprise
    requests_per_minute INT NOT NULL,
    requests_per_hour INT NOT NULL,
    requests_per_day INT NOT NULL,
    burst_limit INT NOT NULL, -- Max requests in 1 second
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default rate limits
INSERT INTO rate_limit_config (plan, requests_per_minute, requests_per_hour, requests_per_day, burst_limit) VALUES
    ('free', 60, 1000, 10000, 10),
    ('starter', 300, 5000, 50000, 30),
    ('business', 1000, 20000, 200000, 100),
    ('enterprise', 5000, 100000, 1000000, 500)
ON CONFLICT (plan) DO UPDATE SET
    requests_per_minute = EXCLUDED.requests_per_minute,
    requests_per_hour = EXCLUDED.requests_per_hour,
    requests_per_day = EXCLUDED.requests_per_day,
    burst_limit = EXCLUDED.burst_limit;

-- ================================================
-- 2. IDEMPOTENCY KEYS
-- ================================================

CREATE TABLE IF NOT EXISTS idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(255) NOT NULL,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    endpoint VARCHAR(100) NOT NULL,
    request_hash VARCHAR(64) NOT NULL, -- SHA256 of request body
    response_status INT,
    response_body JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
    
    UNIQUE(idempotency_key, merchant_id)
);

CREATE INDEX idx_idempotency_merchant ON idempotency_keys(merchant_id, idempotency_key);
CREATE INDEX idx_idempotency_expires ON idempotency_keys(expires_at);

-- Auto-cleanup expired idempotency keys
CREATE OR REPLACE FUNCTION cleanup_expired_idempotency_keys()
RETURNS void AS $$
BEGIN
    DELETE FROM idempotency_keys WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ================================================
-- 3. WEBHOOK QUEUE WITH RETRIES
-- ================================================

DO $$ BEGIN
    CREATE TYPE webhook_status AS ENUM ('pending', 'processing', 'delivered', 'failed', 'exhausted');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Target
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    webhook_url TEXT NOT NULL,
    webhook_secret VARCHAR(255),
    
    -- Event
    event_type VARCHAR(50) NOT NULL, -- payment.completed, payment.failed, refund.created, etc.
    event_id UUID NOT NULL, -- Reference to the source event (payin_id, payout_id, etc.)
    payload JSONB NOT NULL,
    
    -- Delivery tracking
    status webhook_status DEFAULT 'pending',
    attempt_count INT DEFAULT 0,
    max_attempts INT DEFAULT 6,
    next_attempt_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Response tracking
    last_response_code INT,
    last_response_body TEXT,
    last_response_time_ms INT,
    last_error TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_at TIMESTAMPTZ,
    
    -- Signature
    signature VARCHAR(255)
);

CREATE INDEX idx_webhook_pending ON webhook_deliveries(status, next_attempt_at) 
    WHERE status IN ('pending', 'processing');
CREATE INDEX idx_webhook_merchant ON webhook_deliveries(merchant_id, created_at DESC);
CREATE INDEX idx_webhook_event ON webhook_deliveries(event_id);

-- Webhook delivery attempts log
CREATE TABLE IF NOT EXISTS webhook_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_delivery_id UUID NOT NULL REFERENCES webhook_deliveries(id) ON DELETE CASCADE,
    attempt_number INT NOT NULL,
    request_timestamp TIMESTAMPTZ DEFAULT NOW(),
    response_code INT,
    response_body TEXT,
    response_time_ms INT,
    error TEXT,
    ip_address INET
);

CREATE INDEX idx_webhook_attempts_delivery ON webhook_attempts(webhook_delivery_id, attempt_number);

-- ================================================
-- 4. REQUEST LOGGING
-- ================================================

CREATE TABLE IF NOT EXISTS api_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Request identification
    trace_id VARCHAR(64) NOT NULL,
    span_id VARCHAR(32),
    parent_span_id VARCHAR(32),
    
    -- Source
    merchant_id UUID REFERENCES merchants(id),
    api_key_id UUID,
    ip_address INET,
    user_agent TEXT,
    
    -- Request details
    method VARCHAR(10) NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    path_params JSONB,
    query_params JSONB,
    request_body JSONB, -- Sanitized, no sensitive data
    request_headers JSONB, -- Sanitized
    
    -- Response details
    response_status INT,
    response_body JSONB, -- Summary only
    response_time_ms INT,
    
    -- Metadata
    idempotency_key VARCHAR(255),
    error_code VARCHAR(50),
    error_message TEXT,
    
    -- Rate limiting
    rate_limit_remaining INT,
    rate_limit_reset_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Partitioning support (for future)
    request_date DATE DEFAULT CURRENT_DATE
);

-- Indexes for common queries
CREATE INDEX idx_api_requests_trace ON api_requests(trace_id);
CREATE INDEX idx_api_requests_merchant ON api_requests(merchant_id, created_at DESC);
CREATE INDEX idx_api_requests_endpoint ON api_requests(endpoint, created_at DESC);
CREATE INDEX idx_api_requests_errors ON api_requests(error_code) WHERE error_code IS NOT NULL;
CREATE INDEX idx_api_requests_date ON api_requests(request_date, created_at DESC);

-- ================================================
-- 5. ERROR CODES REFERENCE
-- ================================================

CREATE TABLE IF NOT EXISTS error_codes (
    code VARCHAR(50) PRIMARY KEY,
    http_status INT NOT NULL,
    message TEXT NOT NULL,
    description TEXT,
    category VARCHAR(50), -- auth, validation, payment, rate_limit, internal
    is_retryable BOOLEAN DEFAULT FALSE,
    retry_after_seconds INT,
    documentation_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert standard error codes
INSERT INTO error_codes (code, http_status, message, category, is_retryable, retry_after_seconds) VALUES
    -- Authentication errors (401)
    ('AUTH_MISSING_KEY', 401, 'API key is required', 'auth', FALSE, NULL),
    ('AUTH_INVALID_KEY', 401, 'Invalid API key', 'auth', FALSE, NULL),
    ('AUTH_EXPIRED_KEY', 401, 'API key has expired', 'auth', FALSE, NULL),
    ('AUTH_REVOKED_KEY', 401, 'API key has been revoked', 'auth', FALSE, NULL),
    
    -- Authorization errors (403)
    ('FORBIDDEN_IP', 403, 'Request from unauthorized IP address', 'auth', FALSE, NULL),
    ('FORBIDDEN_RESOURCE', 403, 'Access to this resource is denied', 'auth', FALSE, NULL),
    ('MERCHANT_INACTIVE', 403, 'Merchant account is inactive', 'auth', FALSE, NULL),
    ('MERCHANT_SUSPENDED', 403, 'Merchant account is suspended', 'auth', FALSE, NULL),
    
    -- Rate limiting (429)
    ('RATE_LIMIT_MINUTE', 429, 'Rate limit exceeded (per minute)', 'rate_limit', TRUE, 60),
    ('RATE_LIMIT_HOUR', 429, 'Rate limit exceeded (per hour)', 'rate_limit', TRUE, 3600),
    ('RATE_LIMIT_DAY', 429, 'Rate limit exceeded (per day)', 'rate_limit', TRUE, 86400),
    ('RATE_LIMIT_BURST', 429, 'Too many requests in short time', 'rate_limit', TRUE, 1),
    
    -- Validation errors (400)
    ('INVALID_REQUEST', 400, 'Invalid request format', 'validation', FALSE, NULL),
    ('MISSING_FIELD', 400, 'Required field is missing', 'validation', FALSE, NULL),
    ('INVALID_FIELD', 400, 'Field value is invalid', 'validation', FALSE, NULL),
    ('INVALID_AMOUNT', 400, 'Amount must be positive integer', 'validation', FALSE, NULL),
    ('AMOUNT_TOO_LOW', 400, 'Amount is below minimum limit', 'validation', FALSE, NULL),
    ('AMOUNT_TOO_HIGH', 400, 'Amount exceeds maximum limit', 'validation', FALSE, NULL),
    ('INVALID_CURRENCY', 400, 'Unsupported currency', 'validation', FALSE, NULL),
    ('INVALID_UPI', 400, 'Invalid UPI ID format', 'validation', FALSE, NULL),
    ('INVALID_IFSC', 400, 'Invalid IFSC code', 'validation', FALSE, NULL),
    ('INVALID_ACCOUNT', 400, 'Invalid account number', 'validation', FALSE, NULL),
    
    -- Idempotency (409)
    ('IDEMPOTENCY_CONFLICT', 409, 'Request with same idempotency key had different parameters', 'validation', FALSE, NULL),
    ('DUPLICATE_REQUEST', 409, 'Duplicate transaction detected', 'validation', FALSE, NULL),
    
    -- Payment errors (402)
    ('INSUFFICIENT_BALANCE', 402, 'Insufficient merchant balance', 'payment', FALSE, NULL),
    ('UPI_UNAVAILABLE', 402, 'No UPI available for this amount', 'payment', TRUE, 60),
    ('BANK_UNAVAILABLE', 402, 'Bank is temporarily unavailable', 'payment', TRUE, 300),
    ('PAYMENT_FAILED', 402, 'Payment processing failed', 'payment', TRUE, 60),
    ('PAYMENT_TIMEOUT', 402, 'Payment request timed out', 'payment', TRUE, 30),
    ('PAYMENT_DECLINED', 402, 'Payment was declined', 'payment', FALSE, NULL),
    
    -- Not found (404)
    ('NOT_FOUND', 404, 'Resource not found', 'validation', FALSE, NULL),
    ('PAYMENT_NOT_FOUND', 404, 'Payment not found', 'validation', FALSE, NULL),
    ('MERCHANT_NOT_FOUND', 404, 'Merchant not found', 'validation', FALSE, NULL),
    
    -- Server errors (500)
    ('INTERNAL_ERROR', 500, 'Internal server error', 'internal', TRUE, 30),
    ('DATABASE_ERROR', 500, 'Database error', 'internal', TRUE, 30),
    ('SERVICE_UNAVAILABLE', 503, 'Service temporarily unavailable', 'internal', TRUE, 60)
ON CONFLICT (code) DO UPDATE SET
    http_status = EXCLUDED.http_status,
    message = EXCLUDED.message,
    category = EXCLUDED.category,
    is_retryable = EXCLUDED.is_retryable,
    retry_after_seconds = EXCLUDED.retry_after_seconds;

-- ================================================
-- 6. HELPER FUNCTIONS
-- ================================================

-- Check rate limit function
CREATE OR REPLACE FUNCTION check_rate_limit(
    p_merchant_id UUID,
    p_endpoint VARCHAR,
    p_plan VARCHAR DEFAULT 'free'
)
RETURNS TABLE (
    allowed BOOLEAN,
    remaining INT,
    reset_at TIMESTAMPTZ,
    error_code VARCHAR
) AS $$
DECLARE
    v_config rate_limit_config%ROWTYPE;
    v_minute_count INT;
    v_hour_count INT;
    v_day_count INT;
    v_minute_start TIMESTAMPTZ;
    v_hour_start TIMESTAMPTZ;
    v_day_start TIMESTAMPTZ;
BEGIN
    -- Get rate limit config
    SELECT * INTO v_config FROM rate_limit_config WHERE plan = p_plan;
    IF NOT FOUND THEN
        SELECT * INTO v_config FROM rate_limit_config WHERE plan = 'free';
    END IF;
    
    v_minute_start := date_trunc('minute', NOW());
    v_hour_start := date_trunc('hour', NOW());
    v_day_start := date_trunc('day', NOW());
    
    -- Count requests in each window
    SELECT COALESCE(SUM(request_count), 0) INTO v_minute_count
    FROM rate_limits
    WHERE merchant_id = p_merchant_id 
      AND endpoint = p_endpoint 
      AND window_start >= v_minute_start;
    
    SELECT COALESCE(SUM(request_count), 0) INTO v_hour_count
    FROM rate_limits
    WHERE merchant_id = p_merchant_id 
      AND endpoint = p_endpoint 
      AND window_start >= v_hour_start;
    
    SELECT COALESCE(SUM(request_count), 0) INTO v_day_count
    FROM rate_limits
    WHERE merchant_id = p_merchant_id 
      AND endpoint = p_endpoint 
      AND window_start >= v_day_start;
    
    -- Check limits
    IF v_minute_count >= v_config.requests_per_minute THEN
        RETURN QUERY SELECT FALSE, 0, v_minute_start + INTERVAL '1 minute', 'RATE_LIMIT_MINUTE'::VARCHAR;
        RETURN;
    END IF;
    
    IF v_hour_count >= v_config.requests_per_hour THEN
        RETURN QUERY SELECT FALSE, 0, v_hour_start + INTERVAL '1 hour', 'RATE_LIMIT_HOUR'::VARCHAR;
        RETURN;
    END IF;
    
    IF v_day_count >= v_config.requests_per_day THEN
        RETURN QUERY SELECT FALSE, 0, v_day_start + INTERVAL '1 day', 'RATE_LIMIT_DAY'::VARCHAR;
        RETURN;
    END IF;
    
    -- Record this request
    INSERT INTO rate_limits (merchant_id, endpoint, window_start, request_count)
    VALUES (p_merchant_id, p_endpoint, v_minute_start, 1)
    ON CONFLICT (merchant_id, endpoint, window_start)
    DO UPDATE SET request_count = rate_limits.request_count + 1;
    
    -- Return success
    RETURN QUERY SELECT 
        TRUE, 
        v_config.requests_per_minute - v_minute_count - 1,
        v_minute_start + INTERVAL '1 minute',
        NULL::VARCHAR;
END;
$$ LANGUAGE plpgsql;

-- Generate trace ID
CREATE OR REPLACE FUNCTION generate_trace_id()
RETURNS VARCHAR AS $$
BEGIN
    RETURN encode(gen_random_bytes(16), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Generate span ID
CREATE OR REPLACE FUNCTION generate_span_id()
RETURNS VARCHAR AS $$
BEGIN
    RETURN encode(gen_random_bytes(8), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Calculate next webhook retry time (exponential backoff)
CREATE OR REPLACE FUNCTION calculate_next_webhook_retry(attempt_count INT)
RETURNS TIMESTAMPTZ AS $$
DECLARE
    delays INT[] := ARRAY[0, 300, 1800, 7200, 28800, 86400]; -- 0, 5min, 30min, 2h, 8h, 24h
    delay_seconds INT;
BEGIN
    IF attempt_count >= array_length(delays, 1) THEN
        RETURN NULL; -- No more retries
    END IF;
    
    delay_seconds := delays[attempt_count + 1];
    RETURN NOW() + (delay_seconds || ' seconds')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- Queue a webhook delivery
CREATE OR REPLACE FUNCTION queue_webhook(
    p_merchant_id UUID,
    p_event_type VARCHAR,
    p_event_id UUID,
    p_payload JSONB
)
RETURNS UUID AS $$
DECLARE
    v_webhook_url TEXT;
    v_webhook_secret VARCHAR;
    v_delivery_id UUID;
    v_signature VARCHAR;
BEGIN
    -- Get merchant webhook config
    SELECT webhook_url, webhook_secret 
    INTO v_webhook_url, v_webhook_secret
    FROM merchants 
    WHERE id = p_merchant_id;
    
    IF v_webhook_url IS NULL THEN
        RETURN NULL; -- No webhook configured
    END IF;
    
    -- Generate signature
    v_signature := encode(
        hmac(p_payload::TEXT, COALESCE(v_webhook_secret, ''), 'sha256'),
        'hex'
    );
    
    -- Insert delivery
    INSERT INTO webhook_deliveries (
        merchant_id, webhook_url, webhook_secret,
        event_type, event_id, payload, signature
    ) VALUES (
        p_merchant_id, v_webhook_url, v_webhook_secret,
        p_event_type, p_event_id, p_payload, v_signature
    )
    RETURNING id INTO v_delivery_id;
    
    RETURN v_delivery_id;
END;
$$ LANGUAGE plpgsql;

-- ================================================
-- 7. CLEANUP JOBS (call periodically)
-- ================================================

-- Cleanup old rate limit records
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS void AS $$
BEGIN
    DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '2 days';
END;
$$ LANGUAGE plpgsql;

-- Cleanup old request logs (keep 30 days)
CREATE OR REPLACE FUNCTION cleanup_api_requests()
RETURNS void AS $$
BEGIN
    DELETE FROM api_requests WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- RLS Policies
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_requests ENABLE ROW LEVEL SECURITY;

-- Service role can access all
CREATE POLICY service_rate_limits ON rate_limits FOR ALL USING (true);
CREATE POLICY service_idempotency ON idempotency_keys FOR ALL USING (true);
CREATE POLICY service_webhooks ON webhook_deliveries FOR ALL USING (true);
CREATE POLICY service_webhook_attempts ON webhook_attempts FOR ALL USING (true);
CREATE POLICY service_api_requests ON api_requests FOR ALL USING (true);
