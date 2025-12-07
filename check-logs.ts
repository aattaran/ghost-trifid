import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

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

    console.log('📋 Recent AutoPilot Logs:\n');

    for (const log of data || []) {
        console.log('---');
        console.log('Action:', log.action_type);
        console.log('Status:', log.status);
        console.log('Repo:', log.repo_name);
        console.log('Time:', log.created_at);
        if (log.content?.reason) console.log('Reason:', log.content.reason);
        if (log.content?.error) console.log('Error:', log.content.error);
        console.log('');
    }
}

checkLogs();
