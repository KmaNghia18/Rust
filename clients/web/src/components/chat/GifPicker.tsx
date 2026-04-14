"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { gifApi } from "@/lib/api";
import { Search, X, Loader2 } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface GifResult {
  id: string;
  title: string;
  media_formats: {
    gif?: { url: string; dims: [number, number] };
    tinygif?: { url: string; dims: [number, number] };
  };
}

interface Props {
  onSelect: (url: string) => void;
  onClose: () => void;
}

export default function GifPicker({ onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [categories, setCategories] = useState<{ searchterm: string; image: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 350);
    return () => clearTimeout(t);
  }, [query]);

  // Load featured/search
  useEffect(() => {
    setLoading(true);
    setOffset(0);
    setHasMore(true);
    const fn = debouncedQuery
      ? gifApi.search(debouncedQuery, 24, 0)
      : gifApi.featured(24, 0);
    fn.then(data => {
      setGifs(data.results ?? []);
      setHasMore((data.results?.length ?? 0) >= 24);
    }).catch(() => setGifs([]))
      .finally(() => setLoading(false));
  }, [debouncedQuery]);

  // Load categories on mount
  useEffect(() => {
    gifApi.categories().then(data => {
      setCategories((data.tags ?? []).slice(0, 16));
    }).catch(() => {});
  }, []);

  const loadMore = useCallback(() => {
    if (!hasMore || loading) return;
    const nextOffset = offset + 24;
    setLoading(true);
    const fn = debouncedQuery
      ? gifApi.search(debouncedQuery, 24, nextOffset)
      : gifApi.featured(24, nextOffset);
    fn.then(data => {
      setGifs(prev => [...prev, ...(data.results ?? [])]);
      setOffset(nextOffset);
      setHasMore((data.results?.length ?? 0) >= 24);
    }).finally(() => setLoading(false));
  }, [hasMore, loading, offset, debouncedQuery]);

  // Masonry-style: split into 3 columns
  const cols: GifResult[][] = [[], [], []];
  gifs.forEach((g, i) => cols[i % 3].push(g));

  return (
    <div
      ref={ref}
      className="absolute bottom-14 left-0 w-[360px] bg-[#1e2035] rounded-2xl border border-[#2e3150] shadow-2xl overflow-hidden animate-fadeIn z-50"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <div className="flex-1 flex items-center gap-2 bg-[#111827] rounded-lg px-3 py-2">
          <Search size={14} className="text-[#8b8fad] flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search Tenor GIFs…"
            className="flex-1 bg-transparent text-sm text-[#dcdbf0] outline-none placeholder-[#5c6080]"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-[#8b8fad] hover:text-[#dcdbf0]">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Category chips (when no query) */}
      {!debouncedQuery && categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2">
          {categories.slice(0, 8).map(cat => (
            <button
              key={cat.searchterm}
              onClick={() => setQuery(cat.searchterm)}
              className="text-xs bg-[#252840] hover:bg-[#2e3150] text-[#8b8fad] hover:text-[#dcdbf0] px-2.5 py-1 rounded-full border border-[#2e3150] transition-colors"
            >
              {cat.searchterm}
            </button>
          ))}
        </div>
      )}

      {/* GIF grid */}
      <div
        className="overflow-y-auto px-2 pb-2 scroll-y"
        style={{ maxHeight: "340px" }}
        onScroll={e => {
          const el = e.currentTarget;
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) loadMore();
        }}
      >
        {loading && gifs.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="text-[#5865f2] animate-spin" />
          </div>
        )}

        {!loading && gifs.length === 0 && debouncedQuery && (
          <div className="text-center py-10 text-[#5c6080] text-sm">
            No GIFs found for "{debouncedQuery}"
          </div>
        )}

        {gifs.length > 0 && (
          <div className="flex gap-1.5 mt-1">
            {cols.map((col, ci) => (
              <div key={ci} className="flex-1 flex flex-col gap-1.5">
                {col.map(gif => {
                  const fmt = gif.media_formats.tinygif ?? gif.media_formats.gif;
                  if (!fmt) return null;
                  const [w, h] = fmt.dims;
                  const aspectRatio = h / w;

                  return (
                    <button
                      key={gif.id}
                      onClick={() => {
                        const full = gif.media_formats.gif?.url ?? fmt.url;
                        onSelect(full);
                        onClose();
                      }}
                      className="relative w-full overflow-hidden rounded-lg hover:opacity-80 transition-opacity group"
                      style={{ paddingBottom: `${aspectRatio * 100}%` }}
                      title={gif.title}
                    >
                      <Image
                        src={fmt.url}
                        alt={gif.title}
                        fill
                        unoptimized
                        className="object-cover absolute inset-0"
                        sizes="110px"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg" />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {loading && gifs.length > 0 && (
          <div className="flex justify-center py-3">
            <Loader2 size={18} className="text-[#5865f2] animate-spin" />
          </div>
        )}
      </div>

      {/* Tenor branding */}
      <div className="px-3 py-1.5 border-t border-[#2e3150] text-center">
        <span className="text-[10px] text-[#5c6080]">Powered by GIPHY</span>
      </div>
    </div>
  );
}
