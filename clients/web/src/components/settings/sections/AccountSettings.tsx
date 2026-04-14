"use client";
import { useState, useRef } from "react";
import { useAuthStore } from "@/lib/store";
import { authApi, mediaApi } from "@/lib/api";
import { Camera, Check, X, Loader2 } from "lucide-react";
import Image from "next/image";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

export default function AccountSettings() {
  const { user, updateUser } = useAuthStore();
  const [username, setUsername] = useState(user?.username ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [saving, setSaving] = useState(false);
  const [changed, setChanged] = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (file: File) => {
    try {
      const { data } = await mediaApi.uploadAvatar(file);
      updateUser({ avatar_url: data.url });
      toast.success("Avatar updated!");
    } catch { toast.error("Failed to upload avatar"); }
  };

  const handleBannerUpload = async (file: File) => {
    try {
      const { data } = await mediaApi.uploadBanner(file);
      updateUser({ banner_url: data.url });
      toast.success("Banner updated!");
    } catch { toast.error("Failed to upload banner"); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await authApi.updateProfile({ username, bio });
      updateUser({ username, bio });
      setChanged(false);
      toast.success("Profile saved!");
    } catch (e: any) {
      toast.error(e.response?.data?.error?.message ?? "Failed to save");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      {/* Profile card preview */}
      <div className="rounded-xl overflow-hidden border border-[#2e3150]">
        {/* Banner */}
        <div className="h-24 relative group bg-gradient-to-r from-[#5865f2] to-[#4752c4]">
          {user?.banner_url && (
            <Image src={user.banner_url} alt="banner" fill className="object-cover" />
          )}
          <button
            onClick={() => bannerRef.current?.click()}
            className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-sm gap-2"
          >
            <Camera size={16} /> Change Banner
          </button>
          <input ref={bannerRef} type="file" className="hidden" accept="image/*"
            onChange={(e) => e.target.files?.[0] && handleBannerUpload(e.target.files[0])} />
        </div>

        {/* Avatar */}
        <div className="bg-[#1e2035] px-4 pb-4">
          <div className="relative w-20 h-20 -mt-10 mb-3 group">
            {user?.avatar_url ? (
              <Image src={user.avatar_url} alt="" width={80} height={80}
                className="rounded-full border-4 border-[#1e2035] object-cover" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-[#5865f2] border-4 border-[#1e2035] flex items-center justify-center text-2xl font-bold text-white">
                {user?.username?.[0]?.toUpperCase()}
              </div>
            )}
            <button
              onClick={() => avatarRef.current?.click()}
              className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            >
              <Camera size={18} className="text-white" />
            </button>
            <input ref={avatarRef} type="file" className="hidden" accept="image/*"
              onChange={(e) => e.target.files?.[0] && handleAvatarUpload(e.target.files[0])} />
          </div>
          <p className="font-bold text-[#dcdbf0]">{user?.username}</p>
          <p className="text-[#8b8fad] text-sm">#{user?.discriminator}</p>
        </div>
      </div>

      {/* Editable fields */}
      <div className="space-y-4">
        <Field label="Username">
          <input
            value={username}
            onChange={(e) => { setUsername(e.target.value); setChanged(true); }}
            className="input-field"
          />
        </Field>
        <Field label="About Me">
          <textarea
            value={bio}
            onChange={(e) => { setBio(e.target.value); setChanged(true); }}
            rows={3}
            maxLength={190}
            placeholder="Tell us about yourself!"
            className="input-field resize-none"
          />
          <p className="text-right text-xs text-[#5c6080] mt-1">{bio.length}/190</p>
        </Field>
      </div>

      {/* Email (read-only) */}
      <Field label="Email">
        <div className="input-field text-[#8b8fad] select-all cursor-text">{user?.email}</div>
      </Field>

      {/* Save bar */}
      {changed && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1a1c2e] border border-[#2e3150] rounded-xl px-6 py-3 flex items-center gap-4 shadow-2xl animate-fadeIn">
          <span className="text-sm text-[#8b8fad]">You have unsaved changes!</span>
          <button onClick={() => { setUsername(user?.username ?? ""); setBio(user?.bio ?? ""); setChanged(false); }}
            className="text-sm text-[#dcdbf0] hover:underline flex items-center gap-1">
            <X size={14} /> Reset
          </button>
          <button onClick={handleSave} disabled={saving}
            className="bg-[#57f287] text-black text-sm font-semibold rounded-lg px-4 py-1.5 flex items-center gap-1 hover:bg-[#47d274] disabled:opacity-60 transition-colors">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Save Changes
          </button>
        </div>
      )}

      <style jsx>{`
        .input-field {
          width: 100%;
          background: #1e2035;
          color: #dcdbf0;
          border: 1px solid #2e3150;
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 14px;
          outline: none;
          transition: border-color 0.15s;
        }
        .input-field:focus { border-color: #5865f2; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wider text-[#8b8fad] mb-1.5">{label}</label>
      {children}
    </div>
  );
}
