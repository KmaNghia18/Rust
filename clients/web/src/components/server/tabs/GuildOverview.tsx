"use client";
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { guildsApi, mediaApi } from "@/lib/api";
import { useGuildStore } from "@/lib/store";
import { Camera, Check, X, Loader2, Trash2 } from "lucide-react";
import Image from "next/image";
import toast from "react-hot-toast";

export default function GuildOverview({ guildId }: { guildId: string }) {
  const qc = useQueryClient();
  const { guilds, updateGuild } = useGuildStore();
  const guild = guilds.find(g => g.id === guildId);

  const [name, setName] = useState(guild?.name ?? "");
  const [description, setDescription] = useState(guild?.description ?? "");
  const [changed, setChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const iconRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

  const handleIconUpload = async (file: File) => {
    try {
      const { data } = await mediaApi.uploadGuildIcon(guildId, file);
      updateGuild(guildId, { icon_url: data.url });
      toast.success("Icon updated!");
    } catch { toast.error("Failed to upload icon"); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await guildsApi.update(guildId, { name: name.trim(), description: description.trim() });
      updateGuild(guildId, { name: name.trim(), description: description.trim() });
      setChanged(false);
      toast.success("Server updated!");
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      {/* Server icon + banner preview */}
      <div className="rounded-xl overflow-hidden border border-[#2e3150]">
        <div className="h-28 relative group bg-gradient-to-r from-[#5865f2] to-[#4752c4]">
          {guild?.banner_url && <Image src={guild.banner_url} alt="" fill className="object-cover" />}
          <button
            onClick={() => bannerRef.current?.click()}
            className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-sm text-white gap-2 transition-opacity"
          >
            <Camera size={16} /> Change Banner
          </button>
          <input ref={bannerRef} type="file" className="hidden" accept="image/*"
            onChange={e => e.target.files?.[0] && handleIconUpload(e.target.files[0])} />
        </div>

        <div className="bg-[#1e2035] px-4 pb-4">
          <div className="relative w-20 h-20 -mt-10 mb-3 group">
            {guild?.icon_url ? (
              <Image src={guild.icon_url} alt="" width={80} height={80} className="rounded-2xl border-4 border-[#1e2035] object-cover" />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-[#5865f2] border-4 border-[#1e2035] flex items-center justify-center text-2xl font-bold text-white">
                {guild?.name?.split(" ").slice(0,2).map(w => w[0]).join("")}
              </div>
            )}
            <button onClick={() => iconRef.current?.click()}
              className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <Camera size={20} className="text-white" />
            </button>
            <input ref={iconRef} type="file" className="hidden" accept="image/*"
              onChange={e => e.target.files?.[0] && handleIconUpload(e.target.files[0])} />
          </div>
        </div>
      </div>

      {/* Fields */}
      <div className="space-y-4">
        <Field label="Server Name">
          <input value={name} maxLength={100}
            onChange={e => { setName(e.target.value); setChanged(true); }}
            className="input-field" />
        </Field>
        <Field label="Server Description">
          <textarea value={description} rows={3} maxLength={512}
            placeholder="Tell members what this server is about!"
            onChange={e => { setDescription(e.target.value); setChanged(true); }}
            className="input-field resize-none" />
        </Field>
      </div>

      {/* Danger zone */}
      <div className="border border-[#ed4245]/30 rounded-xl p-4">
        <p className="text-sm font-bold text-[#ed4245] mb-2">Danger Zone</p>
        <button className="text-sm text-[#ed4245] hover:bg-[#ed4245]/10 px-4 py-2 rounded-lg border border-[#ed4245]/30 transition-colors flex items-center gap-2">
          <Trash2 size={14} /> Delete This Server
        </button>
      </div>

      {/* Save bar */}
      {changed && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1a1c2e] border border-[#2e3150] rounded-xl px-6 py-3 flex items-center gap-4 shadow-2xl animate-fadeIn z-50">
          <span className="text-sm text-[#8b8fad]">Careful — you have unsaved changes!</span>
          <button onClick={() => { setName(guild?.name ?? ""); setDescription(guild?.description ?? ""); setChanged(false); }}
            className="text-sm text-[#dcdbf0] hover:underline flex items-center gap-1"><X size={14} />Reset</button>
          <button onClick={handleSave} disabled={saving}
            className="bg-[#57f287] text-black text-sm font-semibold rounded-lg px-4 py-1.5 flex items-center gap-1 hover:bg-[#47d274] disabled:opacity-60">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Save Changes
          </button>
        </div>
      )}

      <style jsx>{`.input-field { width:100%; background:#1e2035; color:#dcdbf0; border:1px solid #2e3150; border-radius:8px; padding:10px 12px; font-size:14px; outline:none; transition:border-color .15s; } .input-field:focus{border-color:#5865f2;}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-bold uppercase tracking-wider text-[#8b8fad] mb-1.5">{label}</label>{children}</div>;
}
