"use client";
import { useState } from "react";
import { ImageOff, Package } from "lucide-react";
import { wbThumbnailUrls } from "@/lib/wb-thumbnail";
import { wbCardUrl } from "@/lib/niche-research";

export function CompetitorThumbnail({ sku, photo }: { sku: string; photo?: string }) {
  const [attempt, setAttempt] = useState(0), [loaded, setLoaded] = useState(false), urls = [...(photo && /^https:\/\//i.test(photo) ? [photo] : []), ...wbThumbnailUrls(sku)];
  if (!sku) return <span className="competitor-thumbnail empty" aria-hidden="true"><Package className="size-4" /></span>;
  return <a className="competitor-thumbnail" href={wbCardUrl(sku)} target="_blank" rel="noopener noreferrer" aria-label={"Открыть товар " + sku} title={attempt >= urls.length ? "Фото недоступно · открыть карточку WB" : "Открыть карточку WB"}>
    {!loaded && (attempt >= urls.length ? <ImageOff className="size-4" /> : <Package className="size-4" />)}
    {attempt < urls.length && <img src={urls[attempt]} alt={"Товар " + sku} width={36} height={44} loading="lazy" decoding="async" referrerPolicy="no-referrer" style={{ opacity: loaded ? 1 : 0 }} onLoad={() => setLoaded(true)} onError={() => { setLoaded(false); setAttempt(n => n + 1); }} />}
  </a>;
}
