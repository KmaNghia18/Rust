"use client";
import { useQuery } from "@tanstack/react-query";
import { embedApi } from "@/lib/api";
import { ExternalLink, X } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

// Extract URLs from message content
export function extractUrls(content: string): string[] {
  const regex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  return [...new Set(content.match(regex) ?? [])].slice(0, 3);
}

interface EmbedData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  site_name?: string;
  favicon?: string;
  color?: string;
  video?: string;
  author?: string;
}

interface Props {
  url: string;
  onDismiss?: () => void;
}

export default function LinkEmbed({ url, onDismiss }: Props) {
  const [dismissed, setDismissed] = useState(false);

  const { data, isLoading, isError } = useQuery<EmbedData>({
    queryKey: ["embed", url],
    queryFn: () => embedApi.fetch(url).then(r => r.data),
    staleTime: 1000 * 60 * 10, // 10 minutes
    retry: false,
  });

  if (dismissed || isError || (!isLoading && !data?.title && !data?.image)) return null;

  if (isLoading) {
    return (
      <div className="mt-1.5 ml-14 flex gap-2 max-w-md">
        <div className="w-1 rounded-full bg-[#2e3150] flex-shrink-0" />
        <div className="flex-1 space-y-2 py-2">
          <div className="skeleton h-3 w-48 rounded" />
          <div className="skeleton h-2 w-full rounded" />
          <div className="skeleton h-2 w-3/4 rounded" />
        </div>
      </div>
    );
  }

  const accentColor = data?.color ?? "#2e3150";
  const isVideo = !!data?.video;

  return (
    <div className="mt-1.5 flex gap-0 max-w-[432px] group relative">
      {/* Left color bar */}
      <div
        className="w-1 rounded-l-full flex-shrink-0"
        style={{ background: accentColor }}
      />

      <div className="flex-1 bg-[#1e2035] rounded-r-xl px-3 py-2.5 border border-[#2e3150] border-l-0">
        {/* Site name */}
        {data?.site_name && (
          <p className="text-xs text-[#8b8fad] mb-1 flex items-center gap-1">
            {data.favicon && (
              <Image src={data.favicon} alt="" width={12} height={12}
                className="rounded-sm" unoptimized />
            )}
            {data.site_name}
          </p>
        )}

        {/* Author */}
        {data?.author && (
          <p className="text-xs text-[#dcdbf0] font-medium mb-0.5">{data.author}</p>
        )}

        {/* Title */}
        {data?.title && (
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="block text-sm font-semibold text-[#00aff4] hover:underline mb-1 leading-snug">
            {data.title}
          </a>
        )}

        {/* Description */}
        {data?.description && (
          <p className="text-xs text-[#8b8fad] line-clamp-3 mb-2 leading-relaxed">
            {data.description}
          </p>
        )}

        {/* Thumbnail image */}
        {data?.image && !isVideo && (
          <a href={url} target="_blank" rel="noopener noreferrer">
            <div className="relative w-full max-w-[400px] rounded-lg overflow-hidden mt-1">
              <Image
                src={data.image}
                alt={data.title ?? ""}
                width={400}
                height={225}
                className="w-full h-auto object-cover hover:brightness-90 transition-all"
                unoptimized
              />
            </div>
          </a>
        )}

        {/* Video embed */}
        {isVideo && (
          <div className="relative rounded-lg overflow-hidden mt-1 aspect-video max-w-[400px]">
            <iframe
              src={data!.video}
              className="w-full h-full"
              allowFullScreen
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
          </div>
        )}
      </div>

      {/* Dismiss button */}
      {onDismiss && (
        <button
          onClick={() => { setDismissed(true); onDismiss(); }}
          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded-full bg-[#111827] text-[#8b8fad] hover:text-[#dcdbf0]"
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
}

// ── Multi-embed renderer (renders all URLs in a message) ───────────────────

export function MessageEmbeds({ content }: { content: string }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const urls = extractUrls(content).filter(u => !dismissed.has(u));

  if (urls.length === 0) return null;

  return (
    <div className="space-y-1">
      {urls.map(url => (
        <LinkEmbed
          key={url}
          url={url}
          onDismiss={() => setDismissed(s => new Set(s).add(url))}
        />
      ))}
    </div>
  );
}
