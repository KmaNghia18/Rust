use bitflags::bitflags;

bitflags! {
    /// Discord-compatible permission bitflags (64-bit)
    #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
    pub struct Permissions: i64 {
        // General
        const CREATE_INSTANT_INVITE = 1 << 0;
        const KICK_MEMBERS          = 1 << 1;
        const BAN_MEMBERS           = 1 << 2;
        const ADMINISTRATOR         = 1 << 3;  // Bypasses all permission checks
        const MANAGE_CHANNELS       = 1 << 4;
        const MANAGE_GUILD          = 1 << 5;
        const ADD_REACTIONS         = 1 << 6;
        const VIEW_AUDIT_LOG        = 1 << 7;
        const PRIORITY_SPEAKER      = 1 << 8;
        const STREAM                = 1 << 9;  // Go Live
        const VIEW_CHANNEL          = 1 << 10;
        const SEND_MESSAGES         = 1 << 11;
        const SEND_TTS_MESSAGES     = 1 << 12;
        const MANAGE_MESSAGES       = 1 << 13;
        const EMBED_LINKS           = 1 << 14;
        const ATTACH_FILES          = 1 << 15;
        const READ_MESSAGE_HISTORY  = 1 << 16;
        const MENTION_EVERYONE      = 1 << 17;
        const USE_EXTERNAL_EMOJIS   = 1 << 18;
        const VIEW_GUILD_INSIGHTS   = 1 << 19;
        // Voice
        const CONNECT               = 1 << 20;
        const SPEAK                 = 1 << 21;
        const MUTE_MEMBERS          = 1 << 22;
        const DEAFEN_MEMBERS        = 1 << 23;
        const MOVE_MEMBERS          = 1 << 24;
        const USE_VAD               = 1 << 25;  // Voice Activity Detection
        // Advanced
        const CHANGE_NICKNAME       = 1 << 26;
        const MANAGE_NICKNAMES      = 1 << 27;
        const MANAGE_ROLES          = 1 << 28;
        const MANAGE_WEBHOOKS       = 1 << 29;
        const MANAGE_EMOJIS         = 1 << 30;
        const USE_SLASH_COMMANDS    = 1 << 31;
        const REQUEST_TO_SPEAK      = 1 << 32;  // Stage channels
        const MANAGE_EVENTS         = 1 << 33;
        const MANAGE_THREADS        = 1 << 34;
        const CREATE_PUBLIC_THREADS = 1 << 35;
        const CREATE_PRIVATE_THREADS = 1 << 36;
        const USE_EXTERNAL_STICKERS = 1 << 37;
        const SEND_MESSAGES_IN_THREADS = 1 << 38;
        const USE_EMBEDDED_ACTIVITIES = 1 << 39;
        const MODERATE_MEMBERS      = 1 << 40;  // Timeout
    }
}

impl Permissions {
    /// Default permissions for @everyone role
    pub fn default_permissions() -> Self {
        Self::VIEW_CHANNEL
            | Self::SEND_MESSAGES
            | Self::ADD_REACTIONS
            | Self::ATTACH_FILES
            | Self::EMBED_LINKS
            | Self::READ_MESSAGE_HISTORY
            | Self::CONNECT
            | Self::SPEAK
            | Self::USE_VAD
            | Self::CHANGE_NICKNAME
            | Self::USE_SLASH_COMMANDS
            | Self::USE_EXTERNAL_EMOJIS
            | Self::CREATE_PUBLIC_THREADS
    }

    /// Compute effective permissions for a member in a channel
    pub fn compute(
        is_owner: bool,
        base_role_perms: i64,      // @everyone role perms
        member_role_perms: i64,    // OR of all member roles
        channel_role_overwrites: Vec<(i64, i64)>,   // (allow, deny) per role
        channel_user_overwrite: Option<(i64, i64)>,  // (allow, deny) for user
    ) -> i64 {
        // Owner has all permissions
        if is_owner {
            return Self::all().bits();
        }

        // Start with @everyone + all member role permissions OR'd
        let mut perms = base_role_perms | member_role_perms;

        // ADMINISTRATOR bypasses everything
        if perms & Self::ADMINISTRATOR.bits() != 0 {
            return Self::all().bits();
        }

        // Apply channel role overwrites
        let mut allow_bits: i64 = 0;
        let mut deny_bits: i64 = 0;
        for (allow, deny) in channel_role_overwrites {
            deny_bits |= deny;
            allow_bits |= allow;
        }
        perms &= !deny_bits;
        perms |= allow_bits;

        // Apply channel user-specific overwrite (highest priority)
        if let Some((allow, deny)) = channel_user_overwrite {
            perms &= !deny;
            perms |= allow;
        }

        perms
    }
}
