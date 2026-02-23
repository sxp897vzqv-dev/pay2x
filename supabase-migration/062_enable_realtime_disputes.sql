-- Enable Realtime for disputes tables
-- Run this in Supabase Dashboard > SQL Editor

-- Enable realtime on disputes table
ALTER PUBLICATION supabase_realtime ADD TABLE disputes;

-- Enable realtime on dispute_messages table  
ALTER PUBLICATION supabase_realtime ADD TABLE dispute_messages;

-- Verify realtime is enabled
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';
