// supabase-client.js
// Initialize Supabase Client globally across the app
const SUPABASE_URL = "https://vedokmvaajfcpnkvthqg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlZG9rbXZhYWpmY3Bua3Z0aHFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MzAxNDgsImV4cCI6MjA5MDIwNjE0OH0.H6fEjQJWtP7FgDUy-1wcET7U9fB54fbsjUzznMkQ57w";

window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Deletes a food analysis record by ID.
 * @param {string} id - The unique ID of the food analysis record.
 * @returns {Promise<object>} - Result of the deletion operation.
 */
window.deleteFoodAnalysis = async (id) => {
    const { data, error } = await window.supabaseClient
        .from('food_scans')
        .delete()
        .eq('id', id);
        
    if (error) throw error;
    return data;
};
