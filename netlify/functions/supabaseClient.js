
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://gcgzkjeqztwqhlafvoiu.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjZ3pramVxenR3cWhsYWZ2b2l1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEzNjA3MTYsImV4cCI6MjA2NjkzNjcxNn0.Lwm-y_fgElhb2juat1WS8PbakTdH5eCqK8I88gsX5M0';

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = { supabase };