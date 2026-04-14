"use client";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;          // show divider ABOVE this item
  shortcut?: string;
  onClick: () => void;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Smart position (clamp to screen)
  const menuW = 220, menuH = items.length * 38 + 16;
  const cx = Math.min(x, window.innerWidth - menuW - 4);
  const cy = Math.min(y, window.innerHeight - menuH - 4);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const keyClose = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", keyClose);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", keyClose);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ position: "fixed", left: cx, top: cy, zIndex: 9999, minWidth: menuW }}
      className="bg-[#111827] border border-[#2e3150] rounded-lg shadow-2xl py-1.5 animate-fadeIn"
    >
      {items.map((item, i) => {
        if (item.disabled) return null;
        return (
          <div key={item.id}>
            {item.divider && <div className="h-[1px] bg-[#2e3150] my-1" />}
            <button
              onClick={() => { item.onClick(); onClose(); }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-1.5 text-sm transition-colors",
                item.danger
                  ? "text-[#ed4245] hover:bg-[#ed4245] hover:text-white"
                  : "text-[#dcdbf0] hover:bg-[#5865f2] hover:text-white"
              )}
            >
              {item.icon && <span className="w-4 flex-shrink-0">{item.icon}</span>}
              <span className="flex-1 text-left">{item.label}</span>
              {item.shortcut && (
                <span className="text-[10px] opacity-60 ml-auto">{item.shortcut}</span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Context menu builder hooks ────────────────────────────────────────────────

import { useCallback, useState } from "react";

interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

export function useContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  const open = useCallback((e: React.MouseEvent, items: ContextMenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items });
  }, []);

  const close = useCallback(() => setMenu(null), []);

  const contextMenuProps = { onContextMenu: open };

  return { menu, open, close, contextMenuProps };
}
