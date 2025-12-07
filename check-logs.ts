import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_KEY || ''
);

async function checkLogs() {
    const { data, error } = await supabase
        .from('autopilot_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.log('Error:', error.message);
        return;
    }

    // Write to file for clean reading
    fs.writeFileSync('logs-output.json', JSON.stringify(data, null, 2));
    console.log('📋 Logs written to logs-output.json');
}

checkLogs();

