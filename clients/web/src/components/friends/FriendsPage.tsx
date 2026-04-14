"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { friendsApi } from "@/lib/api";
import { useChannelStore } from "@/lib/store";
import Image from "next/image";
import {
  Users, UserPlus, Clock, UserCheck, X,
  MessageSquare, ShieldOff, ChevronRight, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import toast from "react-hot-toast";

type Tab = "online" | "all" | "pending" | "blocked" | "add";

export default function FriendsPage() {
  const [tab, setTab]     = useState<Tab>("online");
  const [search, setSearch] = useState("");
  const [addUsername, setAddUsername] = useState("");
  const [sending, setSending] = useState(false);
  const { setActiveChannel } = useChannelStore();
  const qc = useQueryClient();

  const { data: friends = []   } = useQuery({ queryKey: ["friends"],  queryFn: () => friendsApi.list().then(r => r.data)    });
  const { data: pending = []   } = useQuery({ queryKey: ["pending"],  queryFn: () => friendsApi.pending().then(r => r.data) });
  const { data: dms    = []   } = useQuery({ queryKey: ["user-dms"],  queryFn: () => friendsApi.listDMs().then(r => r.data)  });

  const accept  = useMutation({ mutationFn: (id: string) => friendsApi.accept(id),  onSuccess: () => qc.invalidateQueries() });
  const decline = useMutation({ mutationFn: (id: string) => friendsApi.decline(id), onSuccess: () => qc.invalidateQueries() });
  const remove  = useMutation({ mutationFn: (id: string) => friendsApi.remove(id),  onSuccess: () => qc.invalidateQueries() });

  const sendRequest = async () => {
    if (!addUsername.trim()) return;
    setSending(true);
    try {
      await friendsApi.send({ username: addUsername.trim() });
      toast.success(`Friend request sent to ${addUsername}!`);
      setAddUsername("");
    } catch (e: any) {
      toast.error(e.response?.data?.error?.message ?? "User not found");
    } finally { setSending(false); }
  };

  const openDM = async (friend: any) => {
    try {
      const { data } = await friendsApi.openDM(friend.friend?.id ?? friend.user_id);
      setActiveChannel(data.id);
    } catch { toast.error("Could not open DM"); }
  };

  const online  = friends.filter((f: any) => f.friend?.online_status === "online");
  const allFrds = friends;
  const blocked: any[] = [];

  function filterList(list: any[]) {
    if (!search) return list;
    return list.filter((f: any) =>
      (f.friend?.username ?? f.username ?? "").toLowerCase().includes(search.toLowerCase())
    );
  }

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: "online",  label: "Online",   count: online.length },
    { id: "all",     label: "All",      count: allFrds.length },
    { id: "pending", label: "Pending",  count: pending.length },
    { id: "blocked", label: "Blocked" },
    { id: "add",     label: "Add Friend" },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-12 flex items-center px-4 gap-4 border-b border-[#111827] flex-shrink-0 bg-[#252840]">
        <Users size={20} className="text-[#8b8fad]" />
        <span className="font-bold text-[#dcdbf0]">Friends</span>
        <div className="w-[1px] h-5 bg-[#2e3150]" />
        <div className="flex items-center gap-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "px-3 py-1 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                tab === t.id
                  ? t.id === "add"
                    ? "bg-[#57f287] text-black"
                    : "bg-[#5865f2] text-white"
                  : "text-[#8b8fad] hover:text-[#dcdbf0] hover:bg-[#2e3150]"
              )}
            >
              {t.id === "add" && <UserPlus size={14} />}
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className={cn(
                  "text-[10px] rounded-full px-1.5 py-0.5 font-bold leading-none",
                  tab === t.id ? "bg-white/20" : "bg-[#ed4245] text-white"
                )}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto scroll-y p-4">
        {/* Add Friend tab */}
        {tab === "add" && (
          <div className="max-w-xl">
            <h2 className="text-xl font-bold text-[#dcdbf0] mb-2">Add Friend</h2>
            <p className="text-sm text-[#8b8fad] mb-6">
              You can add a friend with their username. Watch out for people who have capital letters in their name — it matters!
            </p>
            <div className="flex items-center gap-3 bg-[#252840] border border-[#2e3150] focus-within:border-[#5865f2] rounded-xl px-4 py-3 transition-colors">
              <input
                value={addUsername}
                onChange={e => setAddUsername(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendRequest()}
                placeholder="Enter a username"
                className="flex-1 bg-transparent text-[#dcdbf0] text-sm outline-none placeholder-[#5c6080]"
              />
              <button
                onClick={sendRequest}
                disabled={!addUsername.trim() || sending}
                className="bg-[#5865f2] hover:bg-[#4752c4] text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-60 transition-colors flex items-center gap-2"
              >
                <UserPlus size={14} />
                Send Friend Request
              </button>
            </div>
          </div>
        )}

        {/* Friends list tabs */}
        {tab !== "add" && (
          <>
            {/* Search */}
            <div className="flex items-center gap-2 bg-[#252840] border border-[#2e3150] rounded-lg px-3 py-2 mb-4">
              <Search size={14} className="text-[#8b8fad]" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search"
                className="flex-1 bg-transparent text-sm text-[#dcdbf0] outline-none placeholder-[#5c6080]"
              />
            </div>

            {/* Pending tab */}
            {tab === "pending" && (
              <div>
                {pending.filter((r: any) => r.status === "pending" && !r.is_sender).length > 0 && (
                  <SectionLabel label="Incoming" count={pending.filter((r: any) => !r.is_sender).length} />
                )}
                {filterList(pending.filter((r: any) => !r.is_sender)).map((req: any) => (
                  <FriendRow
                    key={req.id}
                    name={req.sender?.username ?? req.from_username}
                    avatarUrl={req.sender?.avatar_url}
                    status="Incoming Friend Request"
                    actions={[
                      { icon: <UserCheck size={16} />, color: "#57f287", label: "Accept",  onClick: () => accept.mutate(req.id) },
                      { icon: <X size={16} />,         color: "#ed4245", label: "Decline", onClick: () => decline.mutate(req.id) },
                    ]}
                  />
                ))}

                {pending.filter((r: any) => r.is_sender).length > 0 && (
                  <SectionLabel label="Outgoing" count={pending.filter((r: any) => r.is_sender).length} />
                )}
                {filterList(pending.filter((r: any) => r.is_sender)).map((req: any) => (
                  <FriendRow
                    key={req.id}
                    name={req.recipient?.username ?? req.to_username}
                    avatarUrl={req.recipient?.avatar_url}
                    status="Outgoing Friend Request"
                    actions={[
                      { icon: <X size={16} />, color: "#ed4245", label: "Cancel", onClick: () => decline.mutate(req.id) },
                    ]}
                  />
                ))}

                {pending.length === 0 && <EmptyState icon="🕊️" label="No pending requests" />}
              </div>
            )}

            {/* Online / All */}
            {(tab === "online" || tab === "all") && (
              <div>
                <SectionLabel
                  label={tab === "online" ? "Online" : "All Friends"}
                  count={tab === "online" ? filterList(online).length : filterList(allFrds).length}
                />
                {filterList(tab === "online" ? online : allFrds).map((f: any) => (
                  <FriendRow
                    key={f.id}
                    name={f.friend?.username ?? f.username}
                    avatarUrl={f.friend?.avatar_url}
                    status={f.friend?.custom_status ?? f.friend?.online_status ?? "offline"}
                    statusColor={STATUS_COLOR[f.friend?.online_status ?? "offline"]}
                    actions={[
                      { icon: <MessageSquare size={16} />, color: "#8b8fad", label: "Message", onClick: () => openDM(f) },
                      { icon: <X size={16} />,             color: "#ed4245", label: "Remove",  onClick: () => remove.mutate(f.id) },
                    ]}
                  />
                ))}
                {(tab === "online" ? online : allFrds).length === 0 && (
                  <EmptyState icon="👥" label={tab === "online" ? "No friends online" : "No friends yet — add some!"} />
                )}
              </div>
            )}

            {/* Blocked */}
            {tab === "blocked" && <EmptyState icon="🚫" label="No blocked users" />}
          </>
        )}
      </div>
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  online: "#57f287", idle: "#fee75c", dnd: "#ed4245", offline: "#80848e",
};

function SectionLabel({ label, count }: { label: string; count: number }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-wider text-[#8b8fad] mb-2 mt-4 first:mt-0">
      {label} — {count}
    </p>
  );
}

function EmptyState({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="text-5xl mb-4">{icon}</span>
      <p className="text-sm text-[#5c6080] font-medium">{label}</p>
    </div>
  );
}

function FriendRow({
  name, avatarUrl, status, statusColor, actions,
}: {
  name: string; avatarUrl?: string | null; status: string;
  statusColor?: string; actions: { icon: React.ReactNode; color: string; label: string; onClick: () => void }[];
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#252840] group transition-colors border-t border-[#2e3150]/30">
      <div className="w-10 h-10 flex-shrink-0 relative">
        {avatarUrl ? (
          <Image src={avatarUrl} alt={name} width={40} height={40} className="rounded-full object-cover" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-[#5865f2] flex items-center justify-center text-white font-bold">
            {name[0]?.toUpperCase()}
          </div>
        )}
        {statusColor && (
          <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#252840]"
            style={{ background: statusColor }} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#dcdbf0] truncate">{name}</p>
        <p className="text-xs text-[#8b8fad] truncate">{status}</p>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {actions.map(action => (
          <button
            key={action.label}
            onClick={action.onClick}
            title={action.label}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-[#1e2035] hover:bg-[#2e3150] transition-colors"
            style={{ color: action.color }}
          >
            {action.icon}
          </button>
        ))}
      </div>
    </div>
  );
}
