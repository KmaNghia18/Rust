// Facade: re-export all handlers for routes.rs
pub use crate::message_handlers::{
    send_message, get_messages, edit_message, delete_message,
    bulk_delete, add_reaction, remove_reaction, trigger_typing,
    pin_message, get_pinned_messages, ack_message,
};
pub use crate::extra_handlers::{
    get_single_message, get_reactors,
    remove_all_reactions_for_emoji, remove_all_reactions, unpin_message,
};
