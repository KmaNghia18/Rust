"use client";
import { useState, useEffect, useRef } from "react";
import { useVoiceStore } from "@/lib/store";
import { Mic, Volume2, Headphones, Activity, Video } from "lucide-react";
import { cn } from "@/lib/utils";

export default function VoiceSettings() {
  const { selfMute, selfDeaf, toggleMute, toggleDeaf } = useVoiceStore();
  const [inputDevice, setInputDevice] = useState("default");
  const [outputDevice, setOutputDevice] = useState("default");
  const [inputVol, setInputVol] = useState(100);
  const [outputVol, setOutputVol] = useState(100);
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [autoGain, setAutoGain] = useState(true);
  const [inputLevel, setInputLevel] = useState(0);
  const [mode, setMode] = useState<"vad" | "ptt">("vad");
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Mic level meter
  useEffect(() => {
    let raf: number;
    navigator.mediaDevices?.getUserMedia({ audio: true }).then((stream) => {
      streamRef.current = stream;
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const tick = () => {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setInputLevel(Math.min(100, (avg / 128) * 100));
        raf = requestAnimationFrame(tick);
      };
      tick();
    }).catch(() => {});

    return () => {
      cancelAnimationFrame(raf);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="space-y-8">
      {/* Mode selector */}
      <Section icon={<Mic size={16} />} title="Voice Activity Detection">
        <div className="flex gap-3">
          {(["vad", "ptt"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "flex-1 py-3 rounded-xl border text-sm font-medium transition-colors",
                mode === m
                  ? "border-[#5865f2] bg-[#5865f2]/20 text-[#dcdbf0]"
                  : "border-[#2e3150] text-[#8b8fad] hover:border-[#5865f2]"
              )}
            >
              {m === "vad" ? "🎤 Voice Activity" : "⌨️ Push to Talk"}
            </button>
          ))}
        </div>
        {mode === "ptt" && (
          <p className="text-xs text-[#8b8fad] mt-2">
            Desktop: <kbd className="bg-[#2e3150] px-2 py-0.5 rounded text-[#dcdbf0]">Ctrl + Space</kbd> — Web: click the mic button while speaking
          </p>
        )}
      </Section>

      {/* Input device */}
      <Section icon={<Mic size={16} />} title="Input Device">
        <select value={inputDevice} onChange={(e) => setInputDevice(e.target.value)}
          className="w-full bg-[#1e2035] text-[#dcdbf0] border border-[#2e3150] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#5865f2] transition-colors">
          <option value="default">Default Microphone</option>
        </select>

        {/* Mic level meter */}
        <div className="mt-3">
          <div className="flex items-center gap-2 mb-1">
            <Activity size={14} className="text-[#8b8fad]" />
            <span className="text-xs text-[#8b8fad]">Input Level</span>
          </div>
          <div className="h-2 bg-[#1e2035] rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-75",
                inputLevel > 70 ? "bg-[#ed4245]" : inputLevel > 40 ? "bg-[#fee75c]" : "bg-[#57f287]"
              )}
              style={{ width: `${inputLevel}%` }}
            />
          </div>
        </div>

        <div className="mt-3">
          <label className="text-xs text-[#8b8fad] flex justify-between mb-1">
            <span>Input Volume</span><span>{inputVol}%</span>
          </label>
          <input type="range" min={0} max={200} value={inputVol} onChange={(e) => setInputVol(+e.target.value)}
            className="w-full accent-[#5865f2]" />
        </div>
      </Section>

      {/* Output device */}
      <Section icon={<Volume2 size={16} />} title="Output Device">
        <select value={outputDevice} onChange={(e) => setOutputDevice(e.target.value)}
          className="w-full bg-[#1e2035] text-[#dcdbf0] border border-[#2e3150] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#5865f2] transition-colors">
          <option value="default">Default Speakers</option>
        </select>
        <div className="mt-3">
          <label className="text-xs text-[#8b8fad] flex justify-between mb-1">
            <span>Output Volume</span><span>{outputVol}%</span>
          </label>
          <input type="range" min={0} max={200} value={outputVol} onChange={(e) => setOutputVol(+e.target.value)}
            className="w-full accent-[#5865f2]" />
        </div>
      </Section>

      {/* Audio processing */}
      <Section icon={<Headphones size={16} />} title="Audio Processing">
        {[
          { id: "ns",  label: "Noise Suppression",  desc: "Reduce background noise",       val: noiseSuppression, set: setNoiseSuppression },
          { id: "ec",  label: "Echo Cancellation",   desc: "Prevent audio feedback loops", val: echoCancellation, set: setEchoCancellation },
          { id: "agc", label: "Automatic Gain Control", desc: "Auto-adjust mic sensitivity", val: autoGain, set: setAutoGain },
        ].map(({ id, label, desc, val, set }) => (
          <div key={id} className="flex items-center justify-between py-3 border-b border-[#2e3150] last:border-0">
            <div>
              <p className="text-sm text-[#dcdbf0]">{label}</p>
              <p className="text-xs text-[#8b8fad]">{desc}</p>
            </div>
            <Toggle value={val} onChange={set} />
          </div>
        ))}
      </Section>

      {/* Mute/Deaf quick toggles */}
      <Section icon={<Video size={16} />} title="Quick Controls">
        <div className="flex gap-3">
          <ControlBtn active={!selfMute} onClick={toggleMute} label={selfMute ? "Unmute" : "Muted"} color="#ed4245" />
          <ControlBtn active={!selfDeaf} onClick={toggleDeaf} label={selfDeaf ? "Undeafen" : "Deafened"} color="#ed4245" />
        </div>
      </Section>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[#5865f2]">{icon}</span>
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#8b8fad]">{title}</h3>
      </div>
      <div className="bg-[#1e2035] rounded-xl p-4 space-y-3">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={cn(
        "w-10 h-5 rounded-full relative transition-colors",
        value ? "bg-[#57f287]" : "bg-[#2e3150]"
      )}
    >
      <span className={cn(
        "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow",
        value ? "translate-x-5" : "translate-x-0.5"
      )} />
    </button>
  );
}

function ControlBtn({ active, onClick, label, color }: any) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 py-2 rounded-lg text-sm font-medium border transition-colors",
        active
          ? "border-[#2e3150] text-[#dcdbf0] hover:bg-[#2e3150]"
          : `border-[${color}] bg-[${color}]/20 text-[${color}]`
      )}
    >
      {label}
    </button>
  );
}
