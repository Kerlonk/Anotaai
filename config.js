const SUPABASE_CONFIG = {
    url: 'https://dfkrebxvbxobnzhzdgxl.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRma3JlYnh2YnhvYm56aHpkZ3hsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1NjA3MzEsImV4cCI6MjA4NDEzNjczMX0.ZpTkRzcCNhqAQFqSdzwVKrP6LtoWSYsbmmaqqoz0e1k'
};

const supabase = window.supabase.createClient(
    SUPABASE_CONFIG.url, 
    SUPABASE_CONFIG.anonKey
);

console.log('✅ Supabase configurado - Anota Aí v5.0');
