import { wbThumbnailUrls } from "./wb-thumbnail";
import type { Model } from "./candidate-workflow";
export function wbCardDataUrls(sku: string) {
  return wbThumbnailUrls(sku).map(url => url.replace("/images/tm/1.webp", "/info/ru/card.json"));
}
export function parseWbCard(data: unknown, sku: string, source: string): Model["wbCard"] {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (String(d.nm_id ?? d.nmId ?? "") !== sku) return null;
  const short = (v: unknown, length = 300) => typeof v === "string" ? v.slice(0, length) : "";
  const name = short(d.imt_name ?? d.name); if (!name) return null;
  const selling = d.selling && typeof d.selling === "object" ? d.selling as Record<string,unknown> : {};
  const attributes = (Array.isArray(d.options) ? d.options : []).flatMap(o => {
    if (!o || typeof o !== "object") return [];
    const name = short(o.name,200), value = short(o.value,1000); return name && value ? [{name,value}] : [];
  }).slice(0,60);
  return {sku, name, subject:short(d.subj_name ?? d.subjectName), brand:short(selling.brand_name ?? d.brand), source, loadedAt:new Date().toISOString(), checked:false, attributes};
}
