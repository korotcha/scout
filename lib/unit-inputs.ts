import { selectedOffer, type Model, type Offer } from "./candidate-workflow";

export function quoteReceived(offer: Offer) {
  return (offer.quoteStatus ?? (offer.price != null && offer.price > 0 ? "received" : "waiting")) === "received" && offer.price != null && offer.price > 0;
}
export function unitLiters(model: Model) {
  const o=selectedOffer(model);
  // Older multi-unit cartons must not silently become a one-unit WB package.
  if(!o || o.unitsPerCarton!==1 || !o.lengthMm || !o.widthMm || !o.heightMm || [o.lengthMm,o.widthMm,o.heightMm].some(v=>!Number.isFinite(v)||v<=0))return null;
  return o.lengthMm*o.widthMm*o.heightMm/1e6;
}
