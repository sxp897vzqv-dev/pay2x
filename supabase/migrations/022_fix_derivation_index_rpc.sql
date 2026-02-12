-- Fix the get_next_derivation_index function
-- The original function referenced 'current_index' but the column is 'last_index'

CREATE OR REPLACE FUNCTION get_next_derivation_index()
RETURNS INT AS $$
DECLARE
    next_index INT;
BEGIN
    UPDATE address_meta 
    SET last_index = last_index + 1, last_updated = NOW()
    WHERE id = 'main'
    RETURNING last_index INTO next_index;
    
    -- If no row exists, create one
    IF next_index IS NULL THEN
        INSERT INTO address_meta (id, last_index, last_updated)
        VALUES ('main', 1, NOW())
        ON CONFLICT (id) DO UPDATE SET last_index = 1
        RETURNING last_index INTO next_index;
    END IF;
    
    RETURN next_index;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_next_derivation_index() TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_derivation_index() TO service_role;
