// src/supabase.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://jrzyndtowwwcydgcagcr.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyenluZHRvd3d3Y3lkZ2NhZ2NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyOTg1NDksImV4cCI6MjA4NTg3NDU0OX0.7RgnBk7Xr2p2lmd_l4lQxBV7wZaGY3o50ti27Ra38QY'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
