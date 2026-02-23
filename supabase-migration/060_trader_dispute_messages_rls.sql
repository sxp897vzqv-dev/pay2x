-- Allow traders to INSERT dispute messages for their own disputes
-- (The SELECT policy already exists from 001_schema.sql)

-- First, drop the SELECT-only policy and recreate as ALL
DROP POLICY IF EXISTS trader_own_disp_msgs ON dispute_messages;

CREATE POLICY trader_own_disp_msgs ON dispute_messages FOR ALL USING (
  public.user_role() = 'trader' AND dispute_id IN (
    SELECT id FROM disputes WHERE trader_id IN (
      SELECT id FROM traders WHERE profile_id = auth.uid()
    )
  )
) WITH CHECK (
  public.user_role() = 'trader' AND dispute_id IN (
    SELECT id FROM disputes WHERE trader_id IN (
      SELECT id FROM traders WHERE profile_id = auth.uid()
    )
  )
);

-- Also ensure traders can UPDATE their own disputes (for response)
DROP POLICY IF EXISTS trader_own_disputes ON disputes;

CREATE POLICY trader_own_disputes ON disputes FOR ALL USING (
  public.user_role() = 'trader' AND trader_id IN (
    SELECT id FROM traders WHERE profile_id = auth.uid()
  )
) WITH CHECK (
  public.user_role() = 'trader' AND trader_id IN (
    SELECT id FROM traders WHERE profile_id = auth.uid()
  )
);
