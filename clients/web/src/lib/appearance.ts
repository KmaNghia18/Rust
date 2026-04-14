"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

type MessageDisplay = "cozy" | "compact";
type Theme = "dark" | "darker" | "midnight";

interface AppearanceState {
  theme: Theme;
  messageDisplay: MessageDisplay;
  fontSize: number;       // 12–20px
  reducedMotion: boolean;
  showAvatarInCompact: boolean;
  enterSends: boolean;    // false = Ctrl+Enter

  setTheme: (t: Theme) => void;
  setMessageDisplay: (d: MessageDisplay) => void;
  setFontSize: (s: number) => void;
  setReducedMotion: (v: boolean) => void;
  setShowAvatarInCompact: (v: boolean) => void;
  setEnterSends: (v: boolean) => void;
}

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      theme: "dark",
      messageDisplay: "cozy",
      fontSize: 16,
      reducedMotion: false,
      showAvatarInCompact: false,
      enterSends: true,

      setTheme: (theme) => set({ theme }),
      setMessageDisplay: (messageDisplay) => set({ messageDisplay }),
      setFontSize: (fontSize) => set({ fontSize }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
      setShowAvatarInCompact: (showAvatarInCompact) => set({ showAvatarInCompact }),
      setEnterSends: (enterSends) => set({ enterSends }),
    }),
    {
      name: "discord-clone-appearance",
    }
  )
);
