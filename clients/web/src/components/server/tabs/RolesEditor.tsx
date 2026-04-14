"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { guildsApi } from "@/lib/api";
import { Plus, Trash2, ChevronRight, GripVertical, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

const ALL_PERMISSIONS = [
  { key: "ADMINISTRATOR",          label: "Administrator",          desc: "Members with this permission have every permission and bypass channel-specific permissions.",  warn: true },
  { key: "MANAGE_GUILD",           label: "Manage Server",          desc: "Allows members to change the server name, region, and icon." },
  { key: "MANAGE_ROLES",           label: "Manage Roles",           desc: "Allows members to create and manage roles below their own." },
  { key: "MANAGE_CHANNELS",        label: "Manage Channels",        desc: "Allows members to create, edit, and delete channels." },
  { key: "KICK_MEMBERS",           label: "Kick Members",           desc: "Allows members to kick other members from the server." },
  { key: "BAN_MEMBERS",            label: "Ban Members",            desc: "Allows members to ban and unban other members." },
  { key: "MANAGE_MESSAGES",        label: "Manage Messages",        desc: "Allows members to delete messages from any channel." },
  { key: "MENTION_EVERYONE",       label: "Mention @everyone",      desc: "Allows members to use @everyone and @here mentions." },
  { key: "VIEW_CHANNEL",           label: "View Channels",          desc: "Allows members to view channels by default." },
  { key: "SEND_MESSAGES",          label: "Send Messages",          desc: "Allows members to send messages in text channels." },
  { key: "EMBED_LINKS",            label: "Embed Links",            desc: "Allows members to share links with embedded previews." },
  { key: "ATTACH_FILES",           label: "Attach Files",           desc: "Allows members to upload files and images." },
  { key: "READ_MESSAGE_HISTORY",   label: "Read Message History",   desc: "Allows members to read previous messages in channels." },
  { key: "ADD_REACTIONS",          label: "Add Reactions",          desc: "Allows members to add reactions to messages." },
  { key: "USE_EXTERNAL_EMOJIS",    label: "Use External Emojis",    desc: "Allows members to use emojis from other servers." },
  { key: "CONNECT",                label: "Connect",                desc: "Allows members to join voice channels." },
  { key: "SPEAK",                  label: "Speak",                  desc: "Allows members to speak in voice channels." },
  { key: "MUTE_MEMBERS",           label: "Mute Members",           desc: "Allows members to mute other members in voice channels." },
  { key: "DEAFEN_MEMBERS",         label: "Deafen Members",         desc: "Allows members to deafen other members in voice channels." },
  { key: "MOVE_MEMBERS",           label: "Move Members",           desc: "Allows members to move others between voice channels." },
];

export default function RolesEditor({ guildId }: { guildId: string }) {
  const qc = useQueryClient();
  const [selectedRole, setSelectedRole] = useState<any>(null);
  const [rolePerms, setRolePerms] = useState<Record<string, boolean>>({});

  const { data: roles = [] } = useQuery({
    queryKey: ["roles", guildId],
    queryFn: () => guildsApi.getRoles(guildId).then(r => r.data),
  });

  const createRole = useMutation({
    mutationFn: () => guildsApi.createRole(guildId, { name: "new role", color: 0, permissions: 0 }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles", guildId] }),
  });

  const saveRole = useMutation({
    mutationFn: (data: any) => guildsApi.updateRole(guildId, selectedRole.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["roles", guildId] }); toast.success("Role saved!"); },
    onError: () => toast.error("Failed to save role"),
  });

  const deleteRole = useMutation({
    mutationFn: (roleId: string) => guildsApi.deleteRole(guildId, roleId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["roles", guildId] }); setSelectedRole(null); },
  });

  const selectRole = (role: any) => {
    setSelectedRole(role);
    // Convert bigint permissions to permission keys
    const perms: Record<string, boolean> = {};
    ALL_PERMISSIONS.forEach(p => {
      perms[p.key] = !!(role.permissions & PERM_BITS[p.key]);
    });
    setRolePerms(perms);
  };

  const COLORS = ["#ed4245","#e67e22","#fee75c","#57f287","#1abc9c","#3498db","#5865f2","#9b59b6","#e91e63","#ff6b6b","#95a5a6"];

  return (
    <div className="flex gap-4 min-h-[400px]">
      {/* Role list */}
      <div className="w-48 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold uppercase tracking-wider text-[#8b8fad]">Roles — {roles.length}</p>
          <button
            onClick={() => createRole.mutate()}
            className="text-[#8b8fad] hover:text-[#dcdbf0] transition-colors"
            title="Create Role"
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="space-y-1">
          {roles.map((role: any) => (
            <button
              key={role.id}
              onClick={() => selectRole(role)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                selectedRole?.id === role.id ? "bg-[#2e3150] text-[#dcdbf0]" : "text-[#8b8fad] hover:bg-[#1e2035] hover:text-[#dcdbf0]"
              )}
            >
              <span className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ background: role.color ? `#${role.color.toString(16).padStart(6,"0")}` : "#80848e" }} />
              <span className="truncate">{role.name}</span>
              <ChevronRight size={12} className="ml-auto flex-shrink-0 opacity-50" />
            </button>
          ))}
        </div>
      </div>

      {/* Role editor */}
      {selectedRole ? (
        <div className="flex-1 space-y-6">
          {/* Display */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#8b8fad] mb-3">Display</h3>
            <div className="bg-[#1e2035] rounded-xl p-4 space-y-4">
              <div>
                <label className="block text-xs text-[#8b8fad] mb-1">Role Name</label>
                <input defaultValue={selectedRole.name}
                  onBlur={e => setSelectedRole({...selectedRole, name: e.target.value})}
                  className="w-full bg-[#252840] text-[#dcdbf0] rounded-lg px-3 py-2 text-sm outline-none border border-[#2e3150] focus:border-[#5865f2]" />
              </div>
              <div>
                <label className="block text-xs text-[#8b8fad] mb-2">Role Color</label>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setSelectedRole({...selectedRole, color: parseInt(c.slice(1),16)})}
                      className={cn("w-6 h-6 rounded-full transition-transform hover:scale-110",
                        selectedRole.color === parseInt(c.slice(1),16) && "ring-2 ring-white ring-offset-1 ring-offset-[#1e2035]"
                      )}
                      style={{ background: c }} />
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Permissions */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#8b8fad] mb-3">Permissions</h3>
            <div className="bg-[#1e2035] rounded-xl divide-y divide-[#2e3150]">
              {ALL_PERMISSIONS.map(perm => (
                <div key={perm.key} className="flex items-start justify-between p-4">
                  <div className="flex-1 pr-4">
                    <p className={cn("text-sm font-semibold", perm.warn ? "text-[#fee75c]" : "text-[#dcdbf0]")}>
                      {perm.label}
                      {perm.warn && <ShieldCheck size={14} className="inline ml-1 text-[#fee75c]" />}
                    </p>
                    <p className="text-xs text-[#8b8fad] mt-0.5">{perm.desc}</p>
                  </div>
                  <Toggle
                    value={rolePerms[perm.key] ?? false}
                    onChange={v => setRolePerms(p => ({ ...p, [perm.key]: v }))}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button onClick={() => deleteRole.mutate(selectedRole.id)}
              className="flex items-center gap-2 text-sm text-[#ed4245] hover:bg-[#ed4245]/10 px-4 py-2 rounded-lg border border-[#ed4245]/30 transition-colors">
              <Trash2 size={14} /> Delete Role
            </button>
            <button
              onClick={() => saveRole.mutate({
                name: selectedRole.name,
                color: selectedRole.color,
                permissions: Object.entries(rolePerms)
                  .filter(([,v]) => v)
                  .reduce((acc, [k]) => acc | (PERM_BITS[k] ?? 0), 0),
              })}
              className="bg-[#5865f2] hover:bg-[#4752c4] text-white text-sm font-semibold rounded-lg px-5 py-2 transition-colors"
            >
              Save Changes
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-[#5c6080]">
          <div className="text-center">
            <ShieldCheck size={48} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Select a role to edit</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      className={cn("w-10 h-5 rounded-full relative transition-colors flex-shrink-0 mt-0.5",
        value ? "bg-[#57f287]" : "bg-[#2e3150]")}>
      <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
        value ? "translate-x-5" : "translate-x-0.5")} />
    </button>
  );
}

// Simplified permission bits (matching backend)
const PERM_BITS: Record<string, number> = {
  KICK_MEMBERS: 1<<1, BAN_MEMBERS: 1<<2, ADMINISTRATOR: 1<<3,
  MANAGE_CHANNELS: 1<<4, MANAGE_GUILD: 1<<5, ADD_REACTIONS: 1<<6,
  VIEW_CHANNEL: 1<<10, SEND_MESSAGES: 1<<11, MANAGE_MESSAGES: 1<<13,
  EMBED_LINKS: 1<<14, ATTACH_FILES: 1<<15, READ_MESSAGE_HISTORY: 1<<16,
  MENTION_EVERYONE: 1<<17, USE_EXTERNAL_EMOJIS: 1<<18, CONNECT: 1<<20,
  SPEAK: 1<<21, MUTE_MEMBERS: 1<<22, DEAFEN_MEMBERS: 1<<23,
  MOVE_MEMBERS: 1<<24, MANAGE_ROLES: 1<<28,
};
