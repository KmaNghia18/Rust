"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { friendsApi } from "@/lib/api";
import { useUIStore, useMessageStore } from "@/lib/store";
import { UserCheck, UserX, UserPlus, MessageSquare, UserMinus, Search } from "lucide-react";
import Image from "next/image";
import toast from "react-hot-toast";
import { useState } from "react";
import { cn } from "@/lib/utils";

type Tab = "all" | "online" | "pending" | "blocked" | "add";

export default function FriendsPage() {
  const [tab, setTab] = useState<Tab>("online");
  const [addInput, setAddInput] = useState("");
  const [search, setSearch] = useState("");
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["friends"],
    queryFn: () => friendsApi.list().then((r) => r.data),
  });

  const accept  = useMutation({ mutationFn: (id: string) => friendsApi.accept(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["friends"] }) });
  const decline = useMutation({ mutationFn: (id: string) => friendsApi.remove(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["friends"] }) });
  const remove  = useMutation({ mutationFn: (id: string) => friendsApi.remove(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["friends"] }) });
  const sendReq = useMutation({
    mutationFn: (username: string) => friendsApi.send({ username }),
    onSuccess: () => { toast.success("Friend request sent!"); setAddInput(""); qc.invalidateQueries({ queryKey: ["friends"] }); },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? "Failed to send request"),
  });

  const friends  = data?.friends ?? [];
  const pending  = data?.pending_incoming ?? [];
  const blocked  = data?.blocked ?? [];
  const online   = friends.filter((f: any) => f.online_status !== "offline");

  const filtered = (list: any[]) =>
    list.filter((f: any) => f.username.toLowerCase().includes(search.toLowerCase()));

  const TABS = [
    { id: "online",  label: "Online",  count: online.length },
    { id: "all",     label: "All",     count: friends.length },
    { id: "pending", label: "Pending", count: pending.length },
    { id: "blocked", label: "Blocked", count: blocked.length },
    { id: "add",     label: "Add Friend", highlight: true },
  ] as const;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="h-12 flex items-center px-4 gap-4 border-b border-[#111827] flex-shrink-0">
        <div className="flex items-center gap-2">
          <UserCheck size={20} className="text-[#8b8fad]" />
          <span className="font-semibold text-[#dcdbf0]">Friends</span>
        </div>
        <div className="w-[1px] h-5 bg-[#2e3150]" />
        <nav className="flex items-center gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as Tab)}
              className={cn(
                "px-3 py-1 rounded-md text-sm font-medium transition-colors",
                tab === t.id
                  ? t.highlight ? "bg-[#57f287] text-black" : "bg-[#2e3150] text-[#dcdbf0]"
                  : t.highlight ? "text-[#57f287] hover:bg-[#57f287]/10" : "text-[#8b8fad] hover:text-[#dcdbf0] hover:bg-[#2e3150]"
              )}
            >
              {t.label}
              {"count" in t && t.count > 0 && (
                <span className="ml-1 text-xs bg-[#ed4245] text-white rounded-full px-1.5">{t.count}</span>
              )}
            </button>
          ))}
        </nav>

        {/* Search */}
        {tab !== "add" && (
          <div className="ml-auto flex items-center gap-2 bg-[#1e2035] rounded-lg px-3 py-1.5 text-sm">
            <Search size={14} className="text-[#8b8fad]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="bg-transparent text-[#dcdbf0] outline-none w-32 placeholder-[#5c6080]"
            />
          </div>
        )}
      </header>

      {/* Content */}
      <div className="flex-1 scroll-y p-4">
        {tab === "add" && (
          <div className="max-w-lg">
            <h3 className="text-[#dcdbf0] font-semibold mb-1">Add Friend</h3>
            <p className="text-[#8b8fad] text-sm mb-4">You can add a friend with their username.</p>
            <div className="flex gap-2">
              <input
                value={addInput}
                onChange={(e) => setAddInput(e.target.value)}
                placeholder="Enter a username#0000"
                className="flex-1 bg-[#1e2035] text-[#dcdbf0] border border-[#2e3150] focus:border-[#5865f2] rounded-lg px-4 py-2.5 text-sm outline-none transition-colors placeholder-[#5c6080]"
                onKeyDown={(e) => e.key === "Enter" && addInput.trim() && sendReq.mutate(addInput.trim())}
              />
              <button
                onClick={() => addInput.trim() && sendReq.mutate(addInput.trim())}
                disabled={!addInput.trim() || sendReq.isPending}
                className="px-4 py-2 bg-[#5865f2] hover:bg-[#4752c4] text-white text-sm font-semibold rounded-lg disabled:opacity-60 transition-colors"
              >
                Send Request
              </button>
            </div>
          </div>
        )}

        {tab === "pending" && pending.length > 0 && (
          <FriendSection
            label={`INCOMING REQUESTS — ${filtered(pending).length}`}
            items={filtered(pending)}
            renderActions={(f: any) => (
              <>
                <ActionBtn icon={<UserCheck size={16} />} color="#57f287" onClick={() => accept.mutate(f.friendship_id)} title="Accept" />
                <ActionBtn icon={<UserX size={16} />}    color="#ed4245" onClick={() => decline.mutate(f.friendship_id)} title="Decline" />
              </>
            )}
          />
        )}

        {(tab === "all" || tab === "online") && (
          <FriendSection
            label={`${tab === "online" ? "ONLINE" : "ALL FRIENDS"} — ${filtered(tab === "online" ? online : friends).length}`}
            items={filtered(tab === "online" ? online : friends)}
            renderActions={(f: any) => (
              <>
                <ActionBtn icon={<MessageSquare size={16} />} color="#5865f2" onClick={() => {}} title="Message" />
                <ActionBtn icon={<UserMinus size={16} />}     color="#ed4245" onClick={() => remove.mutate(f.friendship_id)} title="Remove Friend" />
              </>
            )}
          />
        )}

        {(tab === "all" || tab === "online") && filtered(tab === "online" ? online : friends).length === 0 && (
          <EmptyState tab={tab} />
        )}
      </div>
    </div>
  );
}

function FriendSection({ label, items, renderActions }: { label: string; items: any[]; renderActions: (f: any) => React.ReactNode }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-[#5c6080] mb-2">{label}</p>
      <ul className="space-y-[1px]">
        {items.map((f: any) => (
          <li key={f.friendship_id}
            className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#1e2035] group transition-colors">
            <div className="relative w-8 h-8 flex-shrink-0">
              {f.avatar_url ? (
                <Image src={f.avatar_url} alt="" width={32} height={32} className="rounded-full" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center text-sm font-bold text-white">
                  {f.username[0].toUpperCase()}
                </div>
              )}
              <span className={`absolute bottom-0 right-0 w-[10px] h-[10px] rounded-full border-2 border-[#252840] status-${f.online_status ?? "offline"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#dcdbf0] truncate">{f.username}</p>
              <p className="text-xs text-[#8b8fad] capitalize">{f.online_status ?? "offline"}</p>
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {renderActions(f)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActionBtn({ icon, color, onClick, title }: any) {
  return (
    <button onClick={onClick} title={title}
      className="w-8 h-8 rounded-full bg-[#252840] hover:bg-[#2e3150] flex items-center justify-center transition-colors"
      style={{ color }}>
      {icon}
    </button>
  );
}

function EmptyState({ tab }: { tab: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <UserCheck size={64} className="text-[#2e3150] mb-4" />
      <p className="text-lg font-semibold text-[#5c6080]">
        {tab === "online" ? "No one is online right now" : "You have no friends yet"}
      </p>
      <p className="text-sm text-[#5c6080] mt-1">Widen your social circle!</p>
    </div>
  );
}
