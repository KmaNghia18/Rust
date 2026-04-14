"use client";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { messagesApi } from "@/lib/api";
import { useUIStore, useGuildStore } from "@/lib/store";
import { Search, X, Calendar, User, Paperclip, Hash, ArrowRight, Filter } from "lucide-react";
import Image from "next/image";
import { format } from "date-fns";
import MessageContent from "@/components/chat/MessageContent";
import { cn } from "@/lib/utils";

interface SearchFilter {
  from?: string;
  in?: string;
  has?: "link" | "embed" | "file" | "video" | "image" | "sound" | "sticker";
  before?: string;
  after?: string;
}

interface Props { onClose: () => void }

export default function SearchOverlay({ onClose }: Props) {
  const { activeGuildId } = useGuildStore();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filters, setFilters] = useState<SearchFilter>({});
  const [showFilters, setShowFilters] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Keyboard close
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["search", activeGuildId, debouncedQuery, filters],
    queryFn: () => debouncedQuery.length >= 2
      ? messagesApi.search(activeGuildId!, debouncedQuery, filters).then(r => r.data)
      : Promise.resolve({ messages: [], total: 0 }),
    enabled: !!activeGuildId && debouncedQuery.length >= 2,
  });

  const results = data?.messages ?? [];
  const total   = data?.total ?? 0;

  const HAS_OPTIONS = [
    { value: "link",   label: "a link" },
    { value: "file",   label: "a file" },
    { value: "image",  label: "an image" },
    { value: "video",  label: "a video" },
    { value: "embed",  label: "an embed" },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-[#1e2035] rounded-2xl border border-[#2e3150] shadow-2xl overflow-hidden animate-fadeIn">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2e3150]">
          <Search size={18} className={cn("text-[#8b8fad] flex-shrink-0 transition-colors", debouncedQuery && "text-[#5865f2]")} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search messages… (min 2 chars)"
            className="flex-1 bg-transparent text-[#dcdbf0] text-sm outline-none placeholder-[#5c6080]"
          />
          {(isLoading || isFetching) && (
            <div className="w-4 h-4 border-2 border-[#5865f2] border-t-transparent rounded-full animate-spin flex-shrink-0" />
          )}
          <button
            onClick={() => setShowFilters(f => !f)}
            className={cn("p-1.5 rounded-lg transition-colors", showFilters ? "bg-[#5865f2] text-white" : "text-[#8b8fad] hover:text-[#dcdbf0]")}
            title="Filters"
          >
            <Filter size={15} />
          </button>
          <button onClick={onClose} className="text-[#8b8fad] hover:text-[#dcdbf0] transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Filters row */}
        {showFilters && (
          <div className="flex flex-wrap gap-2 px-4 py-2 bg-[#252840] border-b border-[#2e3150]">
            <FilterChip
              icon={<User size={12} />} label="From" value={filters.from}
              placeholder="username" onChange={v => setFilters(f => ({ ...f, from: v || undefined }))}
            />
            <FilterChip
              icon={<Hash size={12} />} label="In" value={filters.in}
              placeholder="#channel" onChange={v => setFilters(f => ({ ...f, in: v || undefined }))}
            />
            <div className="flex items-center gap-2 bg-[#1e2035] rounded-lg px-3 py-1.5 border border-[#2e3150]">
              <Paperclip size={12} className="text-[#8b8fad]" />
              <select
                value={filters.has ?? ""}
                onChange={e => setFilters(f => ({ ...f, has: (e.target.value as any) || undefined }))}
                className="bg-transparent text-xs text-[#dcdbf0] outline-none"
              >
                <option value="">Has: anything</option>
                {HAS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>Has: {o.label}</option>
                ))}
              </select>
            </div>
            <FilterChip
              icon={<Calendar size={12} />} label="Before" value={filters.before}
              placeholder="YYYY-MM-DD" onChange={v => setFilters(f => ({ ...f, before: v || undefined }))}
              inputType="date"
            />
            <FilterChip
              icon={<Calendar size={12} />} label="After" value={filters.after}
              placeholder="YYYY-MM-DD" onChange={v => setFilters(f => ({ ...f, after: v || undefined }))}
              inputType="date"
            />
            {Object.values(filters).some(Boolean) && (
              <button
                onClick={() => setFilters({})}
                className="text-xs text-[#ed4245] hover:underline px-2"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Results */}
        <div className="max-h-[480px] overflow-y-auto scroll-y">
          {debouncedQuery.length >= 2 && results.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search size={40} className="text-[#2e3150] mb-3" />
              <p className="text-sm font-semibold text-[#5c6080]">No results for "{debouncedQuery}"</p>
              <p className="text-xs text-[#5c6080] mt-1">Try fewer or different keywords, or adjust your filters</p>
            </div>
          )}

          {debouncedQuery.length < 2 && (
            <div className="py-12 text-center">
              <p className="text-sm text-[#5c6080]">Type at least 2 characters to search</p>
              <div className="flex flex-wrap gap-2 justify-center mt-4 text-xs text-[#8b8fad]">
                <kbd className="bg-[#252840] px-2 py-1 rounded border border-[#2e3150]">from: username</kbd>
                <kbd className="bg-[#252840] px-2 py-1 rounded border border-[#2e3150]">has: file</kbd>
                <kbd className="bg-[#252840] px-2 py-1 rounded border border-[#2e3150]">before: 2024-01-01</kbd>
              </div>
            </div>
          )}

          {results.length > 0 && (
            <>
              <div className="px-4 py-2 border-b border-[#2e3150]">
                <p className="text-xs text-[#8b8fad]">
                  {total.toLocaleString()} result{total !== 1 ? "s" : ""} for <strong className="text-[#dcdbf0]">"{debouncedQuery}"</strong>
                </p>
              </div>

              {results.map((msg: any) => (
                <button
                  key={msg.id}
                  onClick={() => {
                    const el = document.getElementById(`msg-${msg.id}`);
                    if (el) {
                      el.scrollIntoView({ behavior: "smooth", block: "center" });
                      el.classList.add("flash-highlight");
                      setTimeout(() => el.classList.remove("flash-highlight"), 1500);
                    }
                    onClose();
                  }}
                  className="w-full px-4 py-3 flex items-start gap-3 hover:bg-[#252840] transition-colors border-b border-[#2e3150]/50 group text-left"
                >
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                    {msg.author?.avatar_url ? (
                      <Image src={msg.author.avatar_url} alt="" width={32} height={32} className="object-cover" />
                    ) : (
                      <div className="w-8 h-8 bg-[#5865f2] flex items-center justify-center text-xs font-bold text-white">
                        {msg.author?.username?.[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-[#dcdbf0]">{msg.author?.username}</span>
                      <span className="text-[10px] text-[#5c6080]">
                        {format(new Date(msg.timestamp), "MMM d, yyyy")}
                      </span>
                      {msg.channel_name && (
                        <span className="text-[10px] text-[#5c6080]">in #{msg.channel_name}</span>
                      )}
                    </div>
                    <div className="text-sm text-[#8b8fad] line-clamp-2">
                      <MessageContent content={msg.content} compact />
                    </div>
                  </div>

                  <ArrowRight size={14} className="text-[#5c6080] group-hover:text-[#5865f2] flex-shrink-0 mt-1 transition-colors" />
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  icon, label, value, placeholder, onChange, inputType = "text",
}: {
  icon: React.ReactNode; label: string; value?: string;
  placeholder: string; onChange: (v: string) => void; inputType?: string;
}) {
  return (
    <div className={cn(
      "flex items-center gap-1.5 bg-[#1e2035] rounded-lg px-3 py-1.5 border transition-colors",
      value ? "border-[#5865f2]" : "border-[#2e3150]"
    )}>
      <span className={cn("flex-shrink-0", value ? "text-[#5865f2]" : "text-[#8b8fad]")}>{icon}</span>
      <span className="text-[10px] text-[#8b8fad] font-medium">{label}:</span>
      <input
        type={inputType}
        value={value ?? ""}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-transparent text-xs text-[#dcdbf0] outline-none w-24 placeholder-[#5c6080]"
      />
    </div>
  );
}
