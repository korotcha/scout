// Public image-path ranges observed in https://github.com/vkorotenko/wgen/blob/master/wbnmid.js.
// These are CDN routing data, not a product-information API; the UI handles missing photos.
const volumeEnds = [143,287,431,719,1007,1061,1115,1169,1313,1601,1655,1919,2045,2189,2405,2621,2837,3053,3269,3484,3701,3917,4133,4349,4565,4877,5143,5500,5813,6125,6435,6749,7061,7373,7685,7997,8309,8740,9173,9603,10373,11141,11336];
export function wbThumbnailUrls(sku: string): string[] {
  if (!/^[1-9]\d{4,14}$/.test(sku)) return [];
  const number = Number(sku), volume = Math.floor(number / 100000), part = Math.floor(number / 1000);
  const index = volumeEnds.findIndex(end => volume <= end), basket = String(index < 0 ? 44 : index + 1).padStart(2, "0");
  const path = `/vol${volume}/part${part}/${sku}/images/tm/1.webp`;
  return [`https://basket-${basket}.wbbasket.ru${path}`, `https://basket-${basket}.wb.ru${path}`];
}
