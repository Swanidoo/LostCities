export interface AdminUser {
    id: number;
    username: string;
    email: string;
    role: string;
    is_banned: boolean;
    is_muted: boolean;
    created_at: string;
    last_login: string;
    games_played: number;
    messages_sent: number;
    reports_received: number;
}

export interface AdminDashboardStats {
    total_users: number;
    new_users_24h: number;
    active_users_24h: number;
    active_games: number;
    banned_users: number;
    muted_users: number;
    pending_reports: number;
    messages_24h: number;
}

export interface UserReport {
    id: number;
    reporter_id: number;
    reporter_username: string;
    reported_user_id: number;
    reported_username: string;
    report_type: 'chat_abuse' | 'cheating' | 'inappropriate_name' | 'harassment' | 'spam' | 'other';
    description: string;
    status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
    created_at: string;
}

export interface AdminAction {
    id: number;
    admin_id: number;
    admin_username: string;
    action_type: 'ban' | 'unban' | 'mute' | 'unmute' | 'delete_message' | 'warn' | 'change_role';
    target_user_id?: number;
    target_username?: string;
    reason?: string;
    created_at: string;
}