

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || 'https://rjyqounmulyjutgdvkoq.supabase.co'
const supabaseKey = process.env.SUPABASE_KEY || ''

if (!supabaseKey) {
    console.warn('⚠️ SUPABASE_KEY not set. Database logging will be disabled.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

// Types for AutoPilot Logs
export interface AutoPilotLog {
    id?: string
    created_at?: string
    repo_name: string
    commit_hash: string
    action_type: 'check' | 'generate' | 'post_success' | 'post_fail' | 'skip'
    content: {
        commits?: string[]
        commit?: string
        viral_refs?: string[]
        generated_hook?: string
        generated_value?: string
        generated_thread?: string[]
        tweet_id?: string
        error?: string
        reason?: string
        backfilled?: boolean
    }
    status: string
}

// Helper to log an action
export async function logAutoPilotAction(log: AutoPilotLog) {
    if (!supabaseKey) {
        console.log('[DB Disabled] Would log:', log.action_type, log.status)
        return { success: true, disabled: true }
    }

    try {
        const { data, error } = await supabase
            .from('autopilot_logs')
            .insert([log])
            .select()

        if (error) {
            console.error('❌ Supabase log error:', error.message)
            return { success: false, error: error.message }
        }

        console.log('📝 Logged to Supabase:', log.action_type)
        return { success: true, data }
    } catch (e: any) {
        console.error('❌ Supabase connection error:', e.message)
        return { success: false, error: e.message }
    }
}

// Get the last successful post for a repo
export async function getLastPostedCommit(repoName: string): Promise<string | null> {
    if (!supabaseKey) return null

    try {
        const { data, error } = await supabase
            .from('autopilot_logs')
            .select('commit_hash')
            .eq('repo_name', repoName)
            .eq('action_type', 'post_success')
            .order('created_at', { ascending: false })
            .limit(1)
            .single()

        if (error || !data) return null
        return data.commit_hash
    } catch {
        return null
    }
}

// Get recent logs for a repo (for UI/debugging)
export async function getRecentLogs(repoName?: string, limit = 20) {
    if (!supabaseKey) return []

    try {
        let query = supabase
            .from('autopilot_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit)

        if (repoName) {
            query = query.eq('repo_name', repoName)
        }

        const { data, error } = await query
        if (error) return []
        return data || []
    } catch {
        return []
    }
}

/**
 * Get recent successful posts for narrative continuity
 * Returns the actual tweet content from the last N posts
 */
export async function getRecentPostsContent(repoName: string, limit = 5): Promise<string[]> {
    if (!supabaseKey) return []

    try {
        const { data, error } = await supabase
            .from('autopilot_logs')
            .select('content, created_at')
            .eq('repo_name', repoName)
            .eq('action_type', 'post_success')
            .order('created_at', { ascending: false })
            .limit(limit)

        if (error || !data) return []

        // Extract the posted content from each log
        const posts: string[] = []
        for (const log of data) {
            const content = log.content
            if (content?.generated_thread) {
                posts.push(Array.isArray(content.generated_thread)
                    ? content.generated_thread.join(' | ')
                    : content.generated_thread)
            } else if (content?.generated_value) {
                posts.push(content.generated_value)
            } else if (content?.generated_hook) {
                posts.push(content.generated_hook)
            }
        }

        return posts.reverse() // Return in chronological order
    } catch {
        return []
    }
}
