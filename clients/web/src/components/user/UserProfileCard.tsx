"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usersApi, friendsApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { MessageSquare, UserPlus, UserMinus, UserX, MoreHorizontal } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import toast from "react-hot-toast";

interface Props {
  userId: string;
  position?: { x: number; y: number };
  onClose: () => void;
  guildRoles?: { name: string; color: number }[];
}

export default function UserProfileCard({ userId, position, onClose, guildRoles = [] }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { user: me } = useAuthStore();
  const isMe = userId === me?.id;

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile", userId],
    queryFn: () => usersApi.getProfile(userId).then((r: any) => r.data),
  });

  // Outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Smart position (clamp to screen)
  const style: React.CSSProperties = {};
  if (position) {
    const pw = 300, ph = 400;
    const x = Math.min(position.x, window.innerWidth - pw - 12);
    const y = Math.min(position.y, window.innerHeight - ph - 12);
    style.position = "fixed";
    style.left = x;
    style.top = Math.max(8, y);
    style.zIndex = 100;
  }

  const statusColor: Record<string, string> = {
    online: "#57f287", idle: "#fee75c", dnd: "#ed4245", offline: "#80848e",
  };
  const statusLabel: Record<string, string> = {
    online: "Online", idle: "Idle", dnd: "Do Not Disturb", offline: "Offline",
  };

  const handleFriendAction = async () => {
    try {
      await friendsApi.send({ username: profile?.username });
      toast.success("Friend request sent!");
    } catch (e: any) {
      toast.error(e.response?.data?.error?.message ?? "Failed");
    }
  };

  if (isLoading || !profile) {
    return (
      <div
        ref={ref}
        style={style}
        className="w-72 bg-[#111827] rounded-xl border border-[#2e3150] shadow-2xl overflow-hidden animate-fadeIn"
      >
        <div className="h-16 bg-gradient-to-r from-[#5865f2] to-[#4752c4]" />
        <div className="px-4 pb-4">
          <div className="skeleton w-16 h-16 rounded-full -mt-8 mb-3" />
          <div className="skeleton h-4 w-32 mb-2 rounded" />
          <div className="skeleton h-3 w-24 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      style={style}
      className="w-72 bg-[#111827] rounded-xl border border-[#2e3150] shadow-2xl overflow-hidden animate-fadeIn"
    >
      {/* Banner */}
      <div className="h-16 relative bg-gradient-to-r from-[#5865f2] to-[#4752c4]">
        {profile.banner_url && (
          <Image src={profile.banner_url} alt="" fill className="object-cover" />
        )}
      </div>

      {/* Avatar section */}
      <div className="relative px-4 pb-4">
        <div className="relative w-16 h-16 -mt-8 mb-3">
          {profile.avatar_url ? (
            <Image src={profile.avatar_url} alt="" width={64} height={64}
              className="rounded-full border-4 border-[#111827] object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-[#5865f2] border-4 border-[#111827] flex items-center justify-center text-xl font-bold text-white">
              {profile.username[0]?.toUpperCase()}
            </div>
          )}
          {/* Status dot */}
          <span
            className="absolute bottom-1 right-1 w-4 h-4 rounded-full border-[3px] border-[#111827]"
            style={{ background: statusColor[profile.status] ?? "#80848e" }}
          />
        </div>

        {/* Name */}
        <div className="mb-1">
          <p className="font-bold text-[#dcdbf0] text-base leading-tight">{profile.username}</p>
          <p className="text-xs text-[#8b8fad]">
            {profile.is_bot ? "🤖 Bot" : statusLabel[profile.status] ?? "Offline"}
            {profile.custom_status ? ` — ${profile.custom_status}` : ""}
          </p>
        </div>

        <div className="h-[1px] bg-[#2e3150] my-3" />

        {/* About me */}
        {profile.bio && (
          <div className="mb-3">
            <p className="text-xs font-bold uppercase tracking-wider text-[#8b8fad] mb-1">About Me</p>
            <p className="text-sm text-[#dcdbf0] line-clamp-4 whitespace-pre-wrap">{profile.bio}</p>
          </div>
        )}

        {/* Member since */}
        <div className="mb-3">
          <p className="text-xs font-bold uppercase tracking-wider text-[#8b8fad] mb-1">Member Since</p>
          <p className="text-sm text-[#dcdbf0]">
            {format(new Date(profile.created_at), "MMM d, yyyy")}
          </p>
        </div>

        {/* Roles */}
        {guildRoles.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-bold uppercase tracking-wider text-[#8b8fad] mb-1">Roles</p>
            <div className="flex flex-wrap gap-1">
              {guildRoles.slice(0, 6).map((role) => (
                <span
                  key={role.name}
                  className="flex items-center gap-1 text-xs bg-[#1e2035] border border-[#2e3150] rounded px-2 py-0.5"
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: role.color ? `#${role.color.toString(16).padStart(6, "0")}` : "#80848e" }}
                  />
                  {role.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        {!isMe && (
          <div className="flex gap-2 mt-2">
            <button
              className="flex-1 flex items-center justify-center gap-2 bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs font-semibold py-2 rounded-lg transition-colors"
              onClick={() => {/* open DM */}}
            >
              <MessageSquare size={14} /> Message
            </button>
            <button
              onClick={handleFriendAction}
              className="flex items-center justify-center gap-1 bg-[#1e2035] hover:bg-[#2e3150] text-[#8b8fad] hover:text-[#dcdbf0] text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
              title="Add Friend"
            >
              <UserPlus size={14} />
            </button>
            <button
              className="flex items-center justify-center bg-[#1e2035] hover:bg-[#2e3150] text-[#8b8fad] hover:text-[#dcdbf0] px-2 py-2 rounded-lg transition-colors"
              title="More Options"
            >
              <MoreHorizontal size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
