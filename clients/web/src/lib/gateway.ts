"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAuthStore, useMessageStore, useGuildStore, useChannelStore, useVoiceStore } from "./store";
import toast from "react-hot-toast";

type WsStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

let ws: WebSocket | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT = 8;

function clearTimers() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
}

export function useGateway() {
  const { accessToken, user } = useAuthStore();
  const { addMessage, updateMessage, deleteMessage, setTyping, clearTyping } = useMessageStore();
  const { addGuild, updateGuild, removeGuild } = useGuildStore();
  const { addChannel, removeChannel } = useChannelStore();
  const { setVoiceState } = useVoiceStore();
  const statusRef = useRef<WsStatus>("disconnected");

  const connect = useCallback(() => {
    if (!accessToken) return;
    if (ws?.readyState === WebSocket.OPEN) return;

    const url = process.env.NEXT_PUBLIC_GATEWAY_URL!;
    ws = new WebSocket(url);
    statusRef.current = "connecting";

    ws.onopen = () => {
      // Wait for HELLO, then send IDENTIFY
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
      } catch {}
    };

    ws.onclose = () => {
      clearTimers();
      statusRef.current = "reconnecting";
      if (reconnectAttempts < MAX_RECONNECT) {
        const delay = Math.min(1000 * 2 ** reconnectAttempts, 30000);
        reconnectAttempts++;
        reconnectTimer = setTimeout(connect, delay);
      } else {
        statusRef.current = "disconnected";
        toast.error("Connection lost. Please refresh.");
      }
    };

    ws.onerror = () => {
      ws?.close();
    };
  }, [accessToken]);

  function handleMessage(msg: any) {
    const { op, t, d } = msg;

    // HELLO — start heartbeat, send IDENTIFY
    if (op === 10) {
      const interval = d?.heartbeat_interval ?? 41250;
      heartbeatTimer = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ op: 1, d: null }));
        }
      }, interval);

      // Send IDENTIFY
      ws?.send(JSON.stringify({
        op: 2,
        d: { token: accessToken, properties: { os: "browser", browser: "discord-clone-web", device: "web" } },
      }));
    }

    // HEARTBEAT_ACK
    if (op === 11) { /* connection healthy */ }

    // INVALID_SESSION
    if (op === 9) {
      toast.error("Session expired. Please log in again.");
      useAuthStore.getState().logout();
      window.location.href = "/login";
    }

    // DISPATCH events
    if (op === 0 && t) {
      reconnectAttempts = 0; // reset on successful event
      statusRef.current = "connected";

      switch (t) {
        case "READY":
          break;

        case "MESSAGE_CREATE":
          addMessage(d.channel_id, d);
          break;

        case "MESSAGE_UPDATE":
          updateMessage(d.channel_id, d.id, d);
          break;

        case "MESSAGE_DELETE":
          deleteMessage(d.channel_id, d.id);
          break;

        case "TYPING_START":
          setTyping(d.channel_id, d.user_id);
          setTimeout(() => clearTyping(d.channel_id, d.user_id), 8000);
          break;

        case "GUILD_CREATE":
          addGuild(d);
          break;

        case "GUILD_UPDATE":
          updateGuild(d.id, d);
          break;

        case "GUILD_DELETE":
          removeGuild(d.id);
          break;

        case "CHANNEL_CREATE":
          addChannel(d.guild_id, d);
          break;

        case "CHANNEL_DELETE":
          removeChannel(d.guild_id, d.id);
          break;

        case "VOICE_STATE_UPDATE":
          setVoiceState(d.user_id, d);
          break;

        case "PRESENCE_UPDATE":
          // update in-memory user presence
          break;
      }
    }
  }

  useEffect(() => {
    if (accessToken) {
      connect();
    }
    return () => {
      clearTimers();
      ws?.close();
      ws = null;
    };
  }, [accessToken, connect]);

  // Return send helper for voice/status updates
  const send = useCallback((op: number, data: any) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ op, d: data }));
    }
  }, []);

  return { send, status: statusRef.current };
}
