#[cfg(test)]
mod tests {
    use crate::Permissions;

    #[test]
    fn test_permission_has() {
        let perms = Permissions(Permissions::SEND_MESSAGES.0 | Permissions::VIEW_CHANNEL.0);
        assert!(perms.has(Permissions::SEND_MESSAGES));
        assert!(perms.has(Permissions::VIEW_CHANNEL));
        assert!(!perms.has(Permissions::BAN_MEMBERS));
    }

    #[test]
    fn test_administrator_overrides_all() {
        let admin = Permissions::ADMINISTRATOR;
        assert!(admin.is_admin());
    }

    #[test]
    fn test_add_remove_permission() {
        let perms = Permissions::NONE
            .add(Permissions::SEND_MESSAGES)
            .add(Permissions::VIEW_CHANNEL);
        assert!(perms.has(Permissions::SEND_MESSAGES));

        let removed = perms.remove(Permissions::SEND_MESSAGES);
        assert!(!removed.has(Permissions::SEND_MESSAGES));
        assert!(removed.has(Permissions::VIEW_CHANNEL));
    }

    #[test]
    fn test_no_permissions() {
        let perms = Permissions::NONE;
        assert!(!perms.has(Permissions::VIEW_CHANNEL));
        assert!(!perms.is_admin());
    }

    #[test]
    fn test_permission_bitfield_i64_roundtrip() {
        let original = Permissions::SEND_MESSAGES.0 | Permissions::MANAGE_MESSAGES.0;
        let perms = Permissions::from(original);
        let back: i64 = perms.into();
        assert_eq!(original, back);
    }

    #[test]
    fn test_multiple_permissions_combined() {
        let perms = Permissions::KICK_MEMBERS
            .add(Permissions::BAN_MEMBERS)
            .add(Permissions::MANAGE_GUILD);

        assert!(perms.has(Permissions::KICK_MEMBERS));
        assert!(perms.has(Permissions::BAN_MEMBERS));
        assert!(perms.has(Permissions::MANAGE_GUILD));
        assert!(!perms.has(Permissions::ADMINISTRATOR));
        assert!(!perms.has(Permissions::SEND_MESSAGES));
    }
}
