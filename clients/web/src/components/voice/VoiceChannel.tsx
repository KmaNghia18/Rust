"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useVoiceStore, useAuthStore } from "@/lib/store";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Monitor, Users } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface Participant {
  userId: string;
  username: string;
  avatarUrl?: string;
  stream?: MediaStream;
  speaking: boolean;
  muted: boolean;
  videoOn: boolean;
}

export default function VoiceChannel({ channelId }: { channelId: string }) {
  const { user } = useAuthStore();
  const { selfMute, selfDeaf, selfVideo, toggleMute, toggleDeaf, toggleVideo, leaveVoice } = useVoiceStore();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Initialize local media stream
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true, video: selfVideo }).then((stream) => {
      setLocalStream(stream);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      setupVadDetection(stream);
      joinVoiceChannel(stream);
    }).catch(console.error);

    return () => {
      localStream?.getTracks().forEach((t) => t.stop());
      wsRef.current?.close();
      peerConnections.current.forEach((pc) => pc.close());
    };
  }, []);

  // Update mute state on local tracks
  useEffect(() => {
    localStream?.getAudioTracks().forEach((t) => { t.enabled = !selfMute; });
  }, [selfMute, localStream]);

  useEffect(() => {
    localStream?.getVideoTracks().forEach((t) => { t.enabled = selfVideo; });
  }, [selfVideo, localStream]);

  // Voice Activity Detection — speaking indicator
  const setupVadDetection = (stream: MediaStream) => {
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const check = () => {
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      const vol = data.reduce((a, b) => a + b, 0) / data.length;
      setSpeaking(vol > 20 && !selfMute && !selfDeaf);
      requestAnimationFrame(check);
    };
    check();
  };

  const joinVoiceChannel = async (stream: MediaStream) => {
    // Connect to voice WebSocket signaling server
    const ws = new WebSocket(`${process.env.NEXT_PUBLIC_VOICE_WS_URL}/voice/${channelId}`);
    wsRef.current = ws;

    ws.onmessage = async ({ data }) => {
      const msg = JSON.parse(data);
      switch (msg.type) {
        case "user_joined":
          await createPeerConnection(msg.user_id, stream, true);
          break;
        case "user_left":
          removePeer(msg.user_id);
          break;
        case "offer":
          await handleOffer(msg.from, msg.sdp, stream);
          break;
        case "answer":
          await peerConnections.current.get(msg.from)?.setRemoteDescription({ type: "answer", sdp: msg.sdp });
          break;
        case "ice_candidate":
          await peerConnections.current.get(msg.from)?.addIceCandidate(msg.candidate);
          break;
        case "participants":
          setParticipants(msg.participants.map((p: any) => ({
            userId: p.user_id, username: p.username, avatarUrl: p.avatar_url,
            speaking: false, muted: p.muted, videoOn: p.video_on,
          })));
          break;
      }
    };
  };

  const createPeerConnection = async (peerId: string, stream: MediaStream, offer: boolean) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: process.env.NEXT_PUBLIC_TURN_URL ?? "", username: "discord", credential: "clone" },
      ],
    });

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.ontrack = ({ streams }) => {
      setParticipants((prev) => prev.map((p) =>
        p.userId === peerId ? { ...p, stream: streams[0] } : p
      ));
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        wsRef.current?.send(JSON.stringify({ type: "ice_candidate", to: peerId, candidate }));
      }
    };

    peerConnections.current.set(peerId, pc);

    if (offer) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      wsRef.current?.send(JSON.stringify({ type: "offer", to: peerId, sdp: offer.sdp }));
    }
  };

  const handleOffer = async (peerId: string, sdp: string, stream: MediaStream) => {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    peerConnections.current.set(peerId, pc);

    await pc.setRemoteDescription({ type: "offer", sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    wsRef.current?.send(JSON.stringify({ type: "answer", to: peerId, sdp: answer.sdp }));
  };

  const removePeer = (peerId: string) => {
    peerConnections.current.get(peerId)?.close();
    peerConnections.current.delete(peerId);
    setParticipants((prev) => prev.filter((p) => p.userId !== peerId));
  };

  const handleLeave = () => {
    wsRef.current?.send(JSON.stringify({ type: "leave" }));
    wsRef.current?.close();
    localStream?.getTracks().forEach((t) => t.stop());
    leaveVoice();
  };

  // Layout: grid of participants
  const allParticipants = [
    { userId: user!.id, username: user!.username, avatarUrl: user?.avatar_url,
      stream: localStream ?? undefined, speaking, muted: selfMute, videoOn: selfVideo },
    ...participants,
  ];

  const gridCols = allParticipants.length <= 1 ? "grid-cols-1"
    : allParticipants.length <= 4 ? "grid-cols-2"
    : "grid-cols-3";

  return (
    <div className="flex flex-col h-full bg-[#111827]">
      {/* Participant grid */}
      <div className={cn("flex-1 grid gap-2 p-4 overflow-auto", gridCols)}>
        {allParticipants.map((p) => (
          <ParticipantTile key={p.userId} participant={p} isLocal={p.userId === user!.id} />
        ))}
      </div>

      {/* Controls bar */}
      <div className="h-20 bg-[#1a1c2e] flex items-center justify-center gap-4 flex-shrink-0 border-t border-[#111827]">
        <ControlBtn
          active={!selfMute} onClick={toggleMute}
          icon={selfMute ? <MicOff size={20} /> : <Mic size={20} />}
          label={selfMute ? "Unmute" : "Mute"}
          danger={selfMute}
        />
        <ControlBtn
          active={selfVideo} onClick={toggleVideo}
          icon={selfVideo ? <Video size={20} /> : <VideoOff size={20} />}
          label={selfVideo ? "Stop Video" : "Start Video"}
        />
        <ControlBtn
          active={false} onClick={() => {}}
          icon={<Monitor size={20} />} label="Share Screen"
        />
        <button
          onClick={handleLeave}
          className="w-12 h-12 rounded-full bg-[#ed4245] hover:bg-[#c03537] text-white flex items-center justify-center transition-colors"
          title="Disconnect"
        >
          <PhoneOff size={20} />
        </button>
      </div>
    </div>
  );
}

function ParticipantTile({ participant: p, isLocal }: { participant: any; isLocal: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && p.stream) videoRef.current.srcObject = p.stream;
  }, [p.stream]);

  return (
    <div className={cn(
      "relative rounded-xl overflow-hidden bg-[#1e2035] aspect-video flex items-center justify-center",
      p.speaking && "ring-2 ring-[#57f287] ring-offset-2 ring-offset-[#111827]"
    )}>
      {p.videoOn && p.stream ? (
        <video
          ref={videoRef}
          autoPlay playsInline muted={isLocal}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="flex flex-col items-center gap-2">
          {p.avatarUrl ? (
            <Image src={p.avatarUrl} alt={p.username} width={64} height={64} className="rounded-full" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-[#5865f2] flex items-center justify-center text-2xl font-bold text-white">
              {p.username[0].toUpperCase()}
            </div>
          )}
        </div>
      )}

      {/* Name tag */}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-md px-2 py-1">
        {p.muted && <MicOff size={12} className="text-[#ed4245]" />}
        <span className="text-xs text-white font-medium">{p.username}{isLocal && " (You)"}</span>
      </div>

      {/* Speaking ring glow */}
      {p.speaking && (
        <div className="absolute inset-0 rounded-xl animate-pulse pointer-events-none border-2 border-[#57f287]/60" />
      )}
    </div>
  );
}

function ControlBtn({ active, onClick, icon, label, danger = false }: any) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
        danger ? "bg-[#ed4245]/20 text-[#ed4245] hover:bg-[#ed4245]/30"
          : active ? "bg-[#5865f2] text-white hover:bg-[#4752c4]"
          : "bg-[#2e3150] text-[#8b8fad] hover:text-[#dcdbf0] hover:bg-[#3e4160]"
      )}
    >
      {icon}
    </button>
  );
}
