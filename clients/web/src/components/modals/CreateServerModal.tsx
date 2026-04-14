"use client";
import { useState } from "react";
import { guildsApi } from "@/lib/api";
import { useGuildStore, useUIStore } from "@/lib/store";
import { useRouter } from "next/navigation";
import { X, Plus, Compass, ArrowLeft, Loader2, Upload } from "lucide-react";
import Image from "next/image";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

type Step = "choose" | "create" | "join";

interface Props { onClose: () => void }

export default function CreateServerModal({ onClose }: Props) {
  const [step, setStep] = useState<Step>("choose");
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [icon, setIcon] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { addGuild, setActiveGuild } = useGuildStore();
  const { setActiveGuild: setActive } = useUIStore();

  const handleIconChange = (file: File) => {
    setIcon(file);
    setIconPreview(URL.createObjectURL(file));
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const { data: guild } = await guildsApi.create({ name: name.trim() });
      addGuild(guild);
      setActive(guild.id);
      toast.success(`Server "${guild.name}" created!`);
      onClose();
    } catch (e: any) {
      toast.error(e.response?.data?.error?.message ?? "Failed to create server");
    } finally { setLoading(false); }
  };

  const handleJoin = async () => {
    const code = inviteCode.trim().split("/").pop() ?? "";
    if (!code) return;
    setLoading(true);
    try {
      const { data: guild } = await guildsApi.joinByInvite(code);
      addGuild(guild);
      setActive(guild.id);
      toast.success(`Joined "${guild.name}"!`);
      onClose();
    } catch (e: any) {
      toast.error(e.response?.data?.error?.message ?? "Invalid invite link");
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#252840] rounded-2xl w-full max-w-md shadow-2xl border border-[#2e3150] animate-fadeIn">
        {/* Header */}
        <div className="p-6 border-b border-[#2e3150] flex items-center gap-3">
          {step !== "choose" && (
            <button onClick={() => setStep("choose")} className="text-[#8b8fad] hover:text-[#dcdbf0] transition-colors">
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="flex-1">
            <h2 className="text-xl font-bold text-[#dcdbf0]">
              {step === "choose" ? "Create your server" : step === "create" ? "Customize your server" : "Join a server"}
            </h2>
            <p className="text-sm text-[#8b8fad]">
              {step === "choose" ? "Your server is where you and your friends hang out." : ""}
            </p>
          </div>
          <button onClick={onClose} className="text-[#8b8fad] hover:text-[#dcdbf0]">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {step === "choose" && (
            <div className="space-y-3">
              <button
                onClick={() => setStep("create")}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-[#2e3150] hover:border-[#5865f2] hover:bg-[#5865f2]/10 transition-colors group"
              >
                <div className="w-12 h-12 rounded-full bg-[#5865f2]/20 flex items-center justify-center group-hover:bg-[#5865f2]/30 transition-colors">
                  <Plus className="text-[#5865f2]" size={24} />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-[#dcdbf0]">Create My Own</p>
                  <p className="text-sm text-[#8b8fad]">Start fresh with a new server</p>
                </div>
              </button>

              <button
                onClick={() => setStep("join")}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-[#2e3150] hover:border-[#57f287] hover:bg-[#57f287]/10 transition-colors group"
              >
                <div className="w-12 h-12 rounded-full bg-[#57f287]/20 flex items-center justify-center group-hover:bg-[#57f287]/30 transition-colors">
                  <Compass className="text-[#57f287]" size={24} />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-[#dcdbf0]">Join with Invite</p>
                  <p className="text-sm text-[#8b8fad]">Have an invite link? Enter it below</p>
                </div>
              </button>
            </div>
          )}

          {step === "create" && (
            <div className="space-y-5">
              {/* Icon picker */}
              <div className="flex flex-col items-center gap-2">
                <label className="w-20 h-20 rounded-full border-2 border-dashed border-[#2e3150] flex flex-col items-center justify-center cursor-pointer hover:border-[#5865f2] transition-colors overflow-hidden group relative">
                  {iconPreview ? (
                    <Image src={iconPreview} alt="" fill className="object-cover" />
                  ) : (
                    <>
                      <Upload size={20} className="text-[#8b8fad]" />
                      <span className="text-[10px] text-[#8b8fad] mt-1">Upload</span>
                    </>
                  )}
                  <input type="file" className="hidden" accept="image/*"
                    onChange={(e) => e.target.files?.[0] && handleIconChange(e.target.files[0])} />
                </label>
                <p className="text-xs text-[#8b8fad]">Minimum 128x128 pixels</p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#8b8fad] mb-1.5">
                  Server Name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Cool Server"
                  maxLength={100}
                  className="w-full bg-[#1e2035] text-[#dcdbf0] border border-[#2e3150] focus:border-[#5865f2] rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
              </div>

              <button
                onClick={handleCreate}
                disabled={!name.trim() || loading}
                className="w-full py-3 rounded-xl bg-[#5865f2] hover:bg-[#4752c4] text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60 transition-colors"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : null}
                Create Server
              </button>
            </div>
          )}

          {step === "join" && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#8b8fad] mb-1.5">
                  Invite Link
                </label>
                <input
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="https://discord-clone.dev/abc123"
                  className="w-full bg-[#1e2035] text-[#dcdbf0] border border-[#2e3150] focus:border-[#5865f2] rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                  onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                />
                <p className="text-xs text-[#8b8fad] mt-1">Invites should look like: abc123 or example.com/abc123</p>
              </div>

              <button
                onClick={handleJoin}
                disabled={!inviteCode.trim() || loading}
                className="w-full py-3 rounded-xl bg-[#57f287] hover:bg-[#47d274] text-black font-semibold flex items-center justify-center gap-2 disabled:opacity-60 transition-colors"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : null}
                Join Server
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
