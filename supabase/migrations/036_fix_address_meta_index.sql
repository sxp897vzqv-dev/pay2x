-- Fix address_meta to start from highest existing index
-- This ensures new addresses don't collide with existing ones

-- First, find the max derivation_index from traders table
DO $$
DECLARE
    max_index INT;
BEGIN
    -- Get the highest derivation_index from traders who already have addresses
    SELECT COALESCE(MAX(derivation_index), 0) INTO max_index
    FROM traders
    WHERE usdt_deposit_address IS NOT NULL;
    
    RAISE NOTICE 'Max existing derivation index: %', max_index;
    
    -- Upsert address_meta with the correct starting point
    INSERT INTO address_meta (id, last_index, last_updated)
    VALUES ('main', max_index, NOW())
    ON CONFLICT (id) DO UPDATE 
    SET last_index = GREATEST(address_meta.last_index, max_index),
        last_updated = NOW();
END $$;

-- Verify the fix
SELECT id, last_index, last_updated FROM address_meta WHERE id = 'main';
