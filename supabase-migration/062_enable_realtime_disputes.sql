-- Enable Realtime for trader tables
-- Run this in Supabase Dashboard > SQL Editor

-- Enable realtime on disputes table
ALTER PUBLICATION supabase_realtime ADD TABLE disputes;

-- Enable realtime on dispute_messages table  
ALTER PUBLICATION supabase_realtime ADD TABLE dispute_messages;

-- Enable realtime on payins table
ALTER PUBLICATION supabase_realtime ADD TABLE payins;

-- Enable realtime on payouts table
ALTER PUBLICATION supabase_realtime ADD TABLE payouts;

-- Verify realtime is enabled
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';
