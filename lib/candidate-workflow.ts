import { z } from "zod";
import { newResearch, preparation, researchFindings, researchSchema } from "./niche-research";

const amount = z.number().finite().min(0).max(1e12).nullable();
const percent = z.number().finite().min(0).max(100);
const text = z.string().max(6000);
const date = z.string().refine((v) => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v), "Некорректная дата");
export const safeLink = z.string().max(2000).refine((v) => {
  if (!v) return true;
  try { return ["https:", "http:"].includes(new URL(v).protocol); } catch { return false; }
}, "Ссылка должна начинаться с https:// или http://");

export const checks = [
  { id: "demand", label: "Спрос растёт год к году", risk: "Рост спроса год к году не подтверждён", detail: "Проверены топ-3 запроса и перетекание спроса внутри предмета.", positive: "yes" },
  { id: "supply", label: "Спрос опережает предложение", risk: "Спрос не опережает предложение", detail: "Частотность на артикул — первый сигнал; активных конкурентов проверяем отдельно.", positive: "yes" },
  { id: "revenue", label: "Продажи сопоставимых товаров подтверждают потенциал", risk: "Продажи сопоставимых товаров не подтверждают потенциал", detail: "Записаны период, выручка и продажи нескольких лидеров, а не одного исключения.", positive: "yes" },
  { id: "price", label: "Цена сопоставимой модели стабильна или растёт", risk: "Цена сопоставимой модели снижается", detail: "Сравниваем одинаковые характеристики и одинаковую фазу сезона.", positive: "yes" },
  { id: "monopoly", label: "У одного продавца 30% выручки или больше", risk: "У одного продавца 30% выручки или больше", detail: "Предварительный сигнал концентрации, не автоматический запрет.", positive: "no" },
  { id: "glue", label: "Есть массовые склейки и барьер отзывов", risk: "Массовые склейки и барьер отзывов", detail: "Проверены карточки прямых конкурентов; ссылки — в обосновании.", positive: "no" },
  { id: "dumping", label: "Есть выраженный демпинг", risk: "Выраженный демпинг", detail: "Не просто акция: устойчивое снижение цены сопоставимых товаров.", positive: "no" },
  { id: "opportunity", label: "Есть понятная возможность для входа", risk: "Нет понятной возможности для входа", detail: "Недостаток остатков, слабый контент, недоработанная модель или другое преимущество.", positive: "yes" },
] as const;

const answers = z.enum(["unknown", "yes", "no"]);
export const analysisSchema = z.object({
  research: researchSchema.default(() => newResearch(1)),
  answers: z.record(z.string(), answers),
  comment: text,
  evidence: text,
  scope: text,
  riskReason: text,
  marketRevenue: amount,
  comparablePrice: amount,
  leadersOver3m: z.number().int().min(0).max(100).nullable(),
  seasonMonths: z.number().finite().min(0).max(12).nullable(),
  launchDate: date,
  startDate: date,
  productionDays: z.number().int().min(1).max(365),
  deliveryDays: z.number().int().min(0).max(365),
  certificationDays: z.number().int().min(0).max(365),
  certification: z.enum(["unknown", "needed", "not_needed"]),
  bulky: z.boolean(),
});

export const offerSchema = z.object({
  quoteStatus: z.enum(["waiting", "received"]).optional(),
  id: z.string().min(1).max(80), name: z.string().max(200), url: safeLink,
  contact: text, price: amount, currency: z.enum(["CNY", "USD", "RUB"]),
  moq: z.number().int().min(1).max(1e7).nullable(),
  productionDays: z.number().int().min(1).max(365).nullable(),
  quotedAt: date, terms: text,
  lengthMm: amount, widthMm: amount, heightMm: amount, weightKg: amount,
  unitsPerCarton: z.number().int().min(1).max(10000).nullable(),
});

export const importSchema = z.object({
  quantity: z.number().int().min(1).max(1e7).nullable(),
  cnyPurchase: amount, cnyCustoms: amount, usdPurchase: amount, usdCustoms: amount,
  dutyPct: percent.nullable(), vatPct: percent,
  agentPct: percent, currencyControlPct: percent,
  mode: z.enum(["groupage", "container"]), borderPct: percent,
  rateUsdM3: amount, operationUsd: amount, densityKgM3: amount,
  containerUsd: amount, containerM3: amount, containers: z.number().int().min(1).max(1000),
  customsFeeOverride: amount,
  broker: amount, terminal: amount, inland: amount, unloading: amount,
  inspection: amount, certification: amount, other: amount,
  note: text,
  allocation: z.object({ share: amount, freightUsd: amount, expensesRub: amount, totalVolume: amount, capacity: amount, issue: text }).nullable().default(null),
});

export const wbSchema = z.object({
  extraCommissionPct: percent.default(0),
  tariffSubject: z.string().max(300).default(""),
  warehouse: z.string().max(300).default(""),
  liters: amount.default(null),
  scheme: z.enum(["FBW", "FBS"]), price: amount, sppPct: percent,
  commissionPct: percent.nullable(), acquiringPct: percent.nullable(),
  forwardLogistics: amount, returnLogistics: amount, buyoutPct: percent.nullable(),
  storage: amount, packaging: amount, other: amount, drrPct: percent,
  vatPct: percent, taxMode: z.enum(["income", "profit"]), taxPct: percent,
  minimumTaxReserve: z.boolean(),
  tariffDate: date, tariffSource: text,
  stressPricePct: z.number().finite().min(-90).max(100),
  stressDrrPoints: z.number().finite().min(0).max(100),
});

const phaseSchema = z.object({
  name: z.string().max(80), days: z.number().int().min(1).max(365),
  share: percent, pricePct: z.number().finite().min(1).max(1000),
  drrPct: percent.nullable(), commissionPct: percent.nullable(),
});
export const planSchema = z.object({
  startDate: date, sellUnits: z.number().int().min(1).max(1e7).nullable(),
  payoutLag: z.number().int().min(0).max(180),
  phases: z.array(phaseSchema).length(3), rationale: text,
});

export const modelSchema = z.object({
  stage: z.enum(["factory", "quote", "economics", "decision"]).default("factory"),
  productionDays: z.number().int().min(1).max(365).default(45),
  wbProfiles: z.object({ FBW: wbSchema.optional(), FBS: wbSchema.optional() }).default({}),
  id: z.string().min(1).max(80), name: z.string().max(200), kind: z.enum(["proven", "new"]),
  wbUrl: safeLink, note: text, offers: z.array(offerSchema).max(20),
  selectedOfferId: z.string().max(80), import: importSchema, wb: wbSchema, plan: planSchema,
  wbCard: z.object({ sku: z.string().regex(/^[1-9]\d{4,14}$/), name: z.string().max(300), subject: z.string().max(300), brand: z.string().max(300), source: safeLink, loadedAt: z.string().max(40), checked: z.boolean(), attributes: z.array(z.object({ name: z.string().max(200), value: z.string().max(1000) })).max(60) }).nullable().default(null),
});
export const sharedContainerSchema = z.object({ modelIds: z.array(z.string().max(80)).max(8), costUsd: amount, count: z.number().int().min(1).max(1000), capacityM3: amount, expensesRub: amount });
export const contentSchema = z.object({
  blockName: z.string().max(200).default(""),
  manualBlock: z.boolean().default(false),
  analysis: analysisSchema, models: z.array(modelSchema).max(100),
  selectedModelId: z.string().max(80), decisionComment: text,
  sharedContainer: sharedContainerSchema.nullable().default(null),
});

export type Analysis = z.infer<typeof analysisSchema>;
export type Offer = z.infer<typeof offerSchema>;
export type ImportInputs = z.infer<typeof importSchema>;
export type WbInputs = z.infer<typeof wbSchema>;
export type SalesPlan = z.infer<typeof planSchema>;
export type Model = z.infer<typeof modelSchema>;
export type CandidateContent = z.infer<typeof contentSchema>;
export type CandidateStatus = "unreviewed" | "analysis" | "analysis_ready" | "sourcing" | "ready" | "purchased" | "deferred" | "rejected";
export type CandidateAction = "save" | "organize" | "submit_analysis" | "pass_analysis" | "nominate" | "shortlist" | "reopen_analysis" | "ready" | "purchase" | "defer" | "reject" | "resume";
export type Candidate = {
  id: string; contextKey: string; subject: string; query: string; period: string; revision: number;
  status: CandidateStatus; analysisPassed: boolean; content: CandidateContent;
  updatedAt: string; updatedBy: string;
};
export const statusLabels: Record<CandidateStatus, string> = {
  unreviewed: "Не разобрано",
  analysis: "В работе", analysis_ready: "На решении", sourcing: "Кандидат в закуп", ready: "Юнитка на решении",
  purchased: "К закупке", deferred: "Отложено", rejected: "Отклонено",
};

export function newContent(comment = "", launchMonth = ""): CandidateContent {
  return {
    blockName: "",
    manualBlock: false,
    analysis: {
      research: newResearch(),
      answers: Object.fromEntries(checks.map((c) => [c.id, "unknown"])), comment,
      evidence: "", scope: "", riskReason: "", marketRevenue: null, comparablePrice: null,
      leadersOver3m: null, seasonMonths: null, launchDate: launchMonth ? `${launchMonth}-01` : "", startDate: new Date().toISOString().slice(0, 10),
      productionDays: 45, deliveryDays: 30, certificationDays: 45, certification: "unknown", bulky: false,
    }, models: [], selectedModelId: "", decisionComment: "", sharedContainer: null,
  };
}
export function newOffer(): Offer {
  return { id: crypto.randomUUID(), name: "", url: "", contact: "", price: null,
    currency: "CNY", moq: null, productionDays: null, quotedAt: "", terms: "",
    lengthMm: null, widthMm: null, heightMm: null, weightKg: null, unitsPerCarton: 1, quoteStatus: "waiting" };
}
export function newModel(): Model {
  return {
    stage: "factory", productionDays: 45, wbProfiles: {},
    id: crypto.randomUUID(), name: "", kind: "proven", wbUrl: "", wbCard: null, note: "", offers: [], selectedOfferId: "",
    import: {
      quantity: null, cnyPurchase: null, cnyCustoms: null, usdPurchase: null, usdCustoms: null,
      dutyPct: null, vatPct: 22, agentPct: 1.99, currencyControlPct: 0.21,
      mode: "groupage", borderPct: 30, rateUsdM3: null, operationUsd: 0, densityKgM3: 300,
      containerUsd: null, containerM3: 68, containers: 1, customsFeeOverride: null,
      broker: 0, terminal: 0, inland: 0, unloading: 0, inspection: 0, certification: 0, other: 0, note: "", allocation: null,
    },
    wb: {
      extraCommissionPct: 0,
      tariffSubject: "", warehouse: "", liters: null,
      scheme: "FBW", price: null, sppPct: 0, commissionPct: null, acquiringPct: null,
      forwardLogistics: null, returnLogistics: null, buyoutPct: null,
      storage: 0, packaging: 0, other: 0, drrPct: 0, vatPct: 5, taxMode: "profit", taxPct: 15,
      minimumTaxReserve: true, tariffDate: "", tariffSource: "",
      stressPricePct: -15, stressDrrPoints: 5,
    },
    plan: {
      startDate: "", sellUnits: null, payoutLag: 14, rationale: "",
      phases: [
        { name: "Разгон", days: 30, share: 20, pricePct: 100, drrPct: null, commissionPct: null },
        { name: "Активный сезон", days: 45, share: 60, pricePct: 100, drrPct: null, commissionPct: null },
        { name: "Выход", days: 15, share: 20, pricePct: 90, drrPct: null, commissionPct: null },
      ],
    },
  };
}

export function workbookExample(): Model {
  const m = newModel(); const o = newOffer();
  Object.assign(o, { name: "Пример из вашего калькулятора", price: 398, currency: "CNY",
    lengthMm: 656, widthMm: 348, heightMm: 370, weightKg: 11.4, unitsPerCarton: 2 });
  Object.assign(m, { name: "BC0612 · пример из файла", offers: [o], selectedOfferId: o.id,
    note: "Контрольный пример из Калькулятор_импорта.xlsx. Не является актуальным предложением фабрики." });
  Object.assign(m.import, { quantity: 600, cnyPurchase: 12.8, cnyCustoms: 12.8,
    usdPurchase: 89, usdCustoms: 87, dutyPct: 8.5, rateUsdM3: 185, operationUsd: 150,
    containerUsd: 8923, broker: 25000, terminal: 25000, inspection: 24500 });
  return m;
}

export function selectedOffer(m: Model) { return m.offers.find((o) => o.id === m.selectedOfferId); }
// A shared container belongs to these explicitly selected models in one query.
// Recompute on every edit and again on the server; never trust stored allocations.
export function withSharedContainer(content: CandidateContent): CandidateContent {
  const group = content.sharedContainer;
  let models = content.models.map(m => ({ ...m, import: { ...m.import, allocation: null as ImportInputs["allocation"] } }));
  if (!group) return { ...content, models };
  const selected = models.filter(m => group.modelIds.includes(m.id));
  const volumes = selected.map(m => { const o = selectedOffer(m); return o && m.import.quantity && o.unitsPerCarton && o.lengthMm && o.widthMm && o.heightMm ? Math.ceil(m.import.quantity / o.unitsPerCarton) * o.lengthMm * o.widthMm * o.heightMm / 1e9 : null; });
  const totalVolume = volumes.reduce<number>((sum, v) => sum + (v ?? 0), 0);
  const capacity = group.capacityM3 == null ? null : group.capacityM3 * group.count;
  const issue = selected.length !== group.modelIds.length || new Set(group.modelIds).size !== group.modelIds.length ? "Проверьте состав общего контейнера" : selected.length < 2 ? "Выберите минимум две модели общего контейнера" : volumes.some(v => v == null || v <= 0) ? "Заполните количество и габариты коробок всех моделей общего контейнера" : !group.costUsd || !capacity || group.expensesRub == null ? "Заполните стоимость, объём и общие расходы контейнера" : totalVolume > capacity ? "Общий объём товаров превышает вместимость контейнера" : "";
  models = models.map(m => { const index = selected.findIndex(x => x.id === m.id); if (index < 0) return m;
    const share = issue ? null : volumes[index]! / totalVolume;
    return { ...m, import: { ...m.import, mode: "container", allocation: { share, freightUsd: share == null ? null : group.costUsd! * group.count * share, expensesRub: share == null ? null : group.expensesRub! * share, totalVolume, capacity, issue } } };
  });
  return { ...content, models };
}
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`); if (Number.isNaN(d.valueOf())) return "";
  d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
}
export function arrivalDate(a: Analysis, actualProduction?: number | null) {
  if (a.research?.version === 2) return preparation(a, undefined, actualProduction).arrival;
  const beforeShipping = Math.max(actualProduction ?? a.productionDays, a.certification === "needed" ? a.certificationDays : 0);
  return addDays(a.startDate, beforeShipping + a.deliveryDays);
}
export function analysisFindings(a: Analysis) {
  if (a.research?.version === 2) return researchFindings(a);
  const risks: string[] = checks.filter((c) => a.answers[c.id] && a.answers[c.id] !== "unknown" && a.answers[c.id] !== c.positive).map((c) => c.risk);
  const missing: string[] = checks.filter((c) => !a.answers[c.id] || a.answers[c.id] === "unknown").map((c) => c.label);
  const stops: string[] = [];
  if (a.seasonMonths == null) missing.push("Длительность сезона");
  else if (a.seasonMonths < 3) stops.push("Сезон короче трёх месяцев");
  if (!a.launchDate) missing.push("Дата входа в сезон");
  if (!a.startDate) missing.push("Дата начала подготовки");
  if (a.certification === "unknown") missing.push("Необходимость сертификации");
  if (a.launchDate && arrivalDate(a) > a.launchDate) stops.push("По заданным срокам не успеваем к запуску");
  if (!a.comment.trim()) missing.push("Комментарий сотрудника");
  if (!a.evidence.trim()) missing.push("Источники и результаты проверки");
  if (risks.length && !a.riskReason.trim()) missing.push("Обоснование принятия выявленных рисков");
  return { risks, missing, stops, complete: missing.length === 0 && stops.length === 0 };
}

// Reproduces Калькулятор_импорта.xlsx, sheet «Калькулятор», including two FX rates,
// rounded carton count, weight-based freight and customs fee bands. Per the user's
// September 6 decision, import VAT is ALWAYS included in landed cost.
// The schedule is a source-file assumption, not a live customs tariff feed.
export const customsBands = [[0, 1231], [200000.01, 2462], [450000.01, 4924], [1200000.01, 13541],
  [2700000.01, 18465], [4200000.01, 21344], [5500000.01, 49240], [10000000.01, 73860]];
export function calculateImport(m: Model) {
  const i = m.import; const o = selectedOffer(m); const missing: string[] = [];
  if (!o) return { ok: false as const, issues: ["Выберите предложение фабрики"] };
  if (i.allocation?.issue) return { ok: false as const, issues: [i.allocation.issue] };
  if (!importSchema.safeParse(i).success || !offerSchema.safeParse(o).success) return { ok: false as const, issues: ["Проверьте вводные ввоза и предложения: числа, даты и ссылки должны быть корректны"] };
  const need = (value: number | null, label: string, allowZero = false) => {
    if (value == null || !Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) missing.push(label);
  };
  need(o.price, "Цена фабрики"); need(i.quantity, "Количество в партии");
  need(o.unitsPerCarton, "Штук в коробке"); need(o.lengthMm, "Длина коробки");
  need(o.widthMm, "Ширина коробки"); need(o.heightMm, "Высота коробки"); need(o.weightKg, "Вес коробки");
  if (o.currency === "CNY") {
    need(i.cnyPurchase, "Курс юаня");
    if (i.cnyCustoms !== i.cnyPurchase) need(i.cnyCustoms, "Примените единый курс юаня в блоке «Курсы и комиссии»");
  }
  need(i.usdPurchase, "Курс USD");
  if (i.usdCustoms !== i.usdPurchase) need(i.usdCustoms, "Примените единый курс USD в блоке «Курсы и комиссии»");
  need(i.dutyPct, "Ставка пошлины", true);
  if (i.mode === "groupage") { need(i.rateUsdM3, "Ставка перевозки", true); need(i.densityKgM3, "Тарифная плотность"); }
  else if (!i.allocation) { need(i.containerUsd, "Стоимость контейнера"); need(i.containerM3, "Полезный объём контейнера"); }
  if (i.allocation) { need(i.allocation.freightUsd, "Доля фрахта"); need(i.allocation.expensesRub, "Доля общих расходов", true); }
  for (const [key, label] of [["operationUsd", "Операционный сбор"], ["broker", "Оформление"], ["terminal", "Терминал"], ["inland", "Вывоз"], ["unloading", "Разгрузка"], ["inspection", "Инспекция"], ["certification", "Сертификация"], ["other", "Прочие расходы"]] as const) need(i[key], label, true);
  if (missing.length) return { ok: false as const, issues: missing };
  const qty = i.quantity!; const cartons = Math.ceil(qty / o.unitsPerCarton!);
  const cartonM3 = o.lengthMm! * o.widthMm! * o.heightMm! / 1e9;
  const volume = cartonM3 * cartons; const weight = o.weightKg! * cartons;
  const paidVolume = i.mode === "container" ? volume : Math.max(volume, weight / i.densityKgM3!);
  const freightUsd = i.allocation ? i.allocation.freightUsd! : i.mode === "container" ? i.containerUsd! * i.containers : paidVolume * i.rateUsdM3! + i.operationUsd!;
  const freight = freightUsd * i.usdPurchase!;
  const borderFreight = freightUsd * i.borderPct / 100 * i.usdCustoms!;
  const purchaseFx = o.currency === "RUB" ? 1 : o.currency === "CNY" ? i.cnyPurchase! : i.usdPurchase!;
  const customsFx = o.currency === "RUB" ? 1 : o.currency === "CNY" ? i.cnyCustoms! : i.usdCustoms!;
  const goods = o.price! * qty * purchaseFx;
  const customsValue = o.price! * qty * customsFx + borderFreight;
  const duty = customsValue * i.dutyPct! / 100;
  const scheduleFee = [...customsBands].reverse().find(([floor]) => customsValue >= floor)![1];
  const customsFee = i.customsFeeOverride ?? scheduleFee;
  const vat = (customsValue + duty) * i.vatPct / 100;
  const lines: Array<{ label: string; total: number }> = [
    { label: "Товар", total: goods }, { label: "Комиссия агента", total: goods * i.agentPct / 100 },
    { label: "Валютный контроль", total: goods * i.currencyControlPct / 100 },
    { label: "Фрахт", total: freight }, { label: "Пошлина", total: duty },
    { label: "Таможенный сбор", total: customsFee }, { label: "Импортный НДС в себестоимости", total: vat },
    { label: "Инспекция", total: i.inspection! }, { label: "Сертификация", total: i.certification! },
    { label: "Расходы после границы и прочее", total: i.broker! + i.terminal! + i.inland! + i.unloading! + i.other! },
  ];
  if (i.allocation) lines.push({ label: "Доля общих расходов контейнера", total: i.allocation.expensesRub! });
  const total = lines.reduce((sum, l) => sum + l.total, 0);
  const cash = total;
  const warnings: string[] = [];
  if (o.moq != null && qty < o.moq) warnings.push("Партия меньше MOQ фабрики");
  if (!i.allocation && i.mode === "container" && volume > i.containerM3! * i.containers) warnings.push("Партия превышает полезный объём контейнеров");
  return { ok: true as const, qty, cartons, cartonM3, volume, weight, paidVolume, freightUsd, customsValue,
    customsFee, duty, vat, total, cash, unit: total / qty, unitWithoutVat: (cash - vat) / qty, lines, warnings };
}

// Planning model, not a tax return. Sales price includes output VAT; seller-funded
// discounts are already in it. Marketplace-funded SPP affects displayed buyer price only.
// https://www.nalog.gov.ru/rn77/taxation/taxes/nds_usn/
// https://www.nalog.gov.ru/rn77/taxation/taxes/usn/
// https://dev.wildberries.ru/docs/openapi/rates
export function calculateWb(m: Model, overrides: Partial<WbInputs> = {}) {
  const landed = calculateImport(m); const w = { ...m.wb, ...overrides }; const missing: string[] = [];
  if (!wbSchema.safeParse(w).success) return { ok: false as const, issues: ["Проверьте вводные юнитки: ставки от 0 до 100%, расходы неотрицательны"] };
  if (!landed.ok) return { ok: false as const, issues: ["Завершите расчёт белого ввоза"] };
  if (!w.price || w.price <= 0) missing.push("Цена продавца");
  for (const [key, label] of [["commissionPct", "Комиссия WB"], ["acquiringPct", "Эквайринг"], ["forwardLogistics", "Прямая логистика"], ["returnLogistics", "Обратная логистика"], ["storage", "Хранение"], ["packaging", "Упаковка"], ["other", "Прочее"]] as const) {
    if (w[key] == null) missing.push(label);
  }
  if (!w.buyoutPct || w.buyoutPct <= 0) missing.push("Выкуп должен быть больше 0%");
  if (missing.length) return { ok: false as const, issues: missing };
  const price = w.price!; const buyout = w.buyoutPct! / 100;
  const commission = price * (w.commissionPct! + (w.extraCommissionPct ?? 0)) / 100;
  const acquiring = price * w.acquiringPct! / 100;
  const logistics = w.forwardLogistics! / buyout + w.returnLogistics! * (1 - buyout) / buyout;
  const ads = price * w.drrPct / 100;
  const outputVat = price * w.vatPct / (100 + w.vatPct);
  const netRevenue = price - outputVat;
  const sellingCosts = commission + acquiring + logistics + w.storage! + w.packaging! + w.other!;
  const beforeTax = netRevenue - landed.unit - sellingCosts - ads;
  const beforeTaxNoAds = beforeTax + ads;
  const incomeTax = (profit: number) => w.taxMode === "income" ? netRevenue * w.taxPct / 100
    : Math.max(Math.max(0, profit) * w.taxPct / 100, w.minimumTaxReserve ? netRevenue * 0.01 : 0);
  const tax = incomeTax(beforeTax); const profit = beforeTax - tax;
  const profitNoAds = beforeTaxNoAds - incomeTax(beforeTaxNoAds);
  const unitInvestment = landed.cash / landed.qty + w.packaging!;
  return { ok: true as const, price, buyerPrice: price * (1 - w.sppPct / 100), commission, acquiring, logistics,
    ads, outputVat, netRevenue, sellingCosts, tax, profit, profitNoAds, beforeTax,
    margin: profit / price * 100, roi: unitInvestment > 0 ? profit / unitInvestment * 100 : null,
    // Expected receipt after platform costs and a conservative tax reserve; not a WB payout report.
    cashReceipt: price - commission - acquiring - logistics - w.storage! - w.other! - ads - outputVat - tax,
    unitInvestment };
}

export function calculatePlan(m: Model) {
  const w = calculateWb(m); const i = calculateImport(m); const p = m.plan;
  if (!planSchema.safeParse(p).success) return { ok: false as const, issues: ["Проверьте даты, длительность и доли фаз. Количество и дни должны быть целыми положительными числами."] };
  if (!w.ok || !i.ok) return { ok: false as const, issues: ["Завершите белый ввоз и юнитку WB"] };
  const issues: string[] = [];
  if (!p.startDate) issues.push("Укажите дату начала продаж");
  if (!p.sellUnits) issues.push("Укажите план выкупленных единиц");
  if (p.sellUnits! > i.qty) issues.push("План выкупов превышает закупленную партию");
  if (Math.abs(p.phases.reduce((s, x) => s + x.share, 0) - 100) > 0.001) issues.push("Доли фаз должны составлять 100%");
  if (p.phases.reduce((s, x) => s + x.days, 0) > 365) issues.push("План ограничен одним годом");
  if (issues.length) return { ok: false as const, issues };
  const target = p.sellUnits!;
  const counts = p.phases.map((x) => Math.floor(target * x.share / 100));
  const priority = p.phases.map((x, k) => ({ k, rest: target * x.share / 100 - counts[k] })).sort((a, b) => b.rest - a.rest);
  const remainder = target - counts.reduce((s, v) => s + v, 0);
  for (let n = 0; n < remainder; n++) counts[priority[n % priority.length].k]++;
  const days: Array<{ date: string; phase: string; sold: number; orders: number; stock: number; price: number; drr: number; commission: number; revenue: number; profit: number; receipt: number; cash: number }> = [];
  const receipts = new Map<number, number>();
  let day = 0; let stock = i.qty; let revenue = 0; let profit = 0;
  const upfront = i.cash + i.qty * m.wb.packaging!;
  let cash = -upfront;
  for (let k = 0; k < p.phases.length; k++) {
    const phase = p.phases[k];
    const u = calculateWb(m, { price: w.price * phase.pricePct / 100, drrPct: phase.drrPct ?? m.wb.drrPct, commissionPct: phase.commissionPct ?? m.wb.commissionPct });
    if (!u.ok) return { ok: false as const, issues: u.issues };
    for (let d = 0; d < phase.days; d++, day++) {
      const sold = Math.floor((d + 1) * counts[k] / phase.days) - Math.floor(d * counts[k] / phase.days);
      stock -= sold;
      const dailyRevenue = sold * u.price; const dailyProfit = sold * u.profit;
      receipts.set(day + p.payoutLag, (receipts.get(day + p.payoutLag) ?? 0) + sold * u.cashReceipt);
      const receipt = receipts.get(day) ?? 0; cash += receipt;
      revenue += dailyRevenue; profit += dailyProfit;
      days.push({ date: addDays(p.startDate, day), phase: phase.name, sold, orders: sold / (m.wb.buyoutPct! / 100), stock,
        price: u.price, drr: phase.drrPct ?? m.wb.drrPct, commission: phase.commissionPct ?? m.wb.commissionPct!,
        revenue: dailyRevenue, profit: dailyProfit, receipt, cash });
    }
  }
  const seasonEnd = days.at(-1)!.date;
  for (let n = 0; n < p.payoutLag; n++, day++) {
    const receipt = receipts.get(day) ?? 0; cash += receipt;
    days.push({ date: addDays(p.startDate, day), phase: "Ожидание выплат", sold: 0, orders: 0, stock, price: 0,
      drr: 0, commission: 0, revenue: 0, profit: 0, receipt, cash });
  }
  return { ok: true as const, days, revenue, profit, upfront, stock, seasonEnd,
    roi: profit / upfront * 100, lastReceiptDate: days.at(-1)!.date, cash,
    breakEvenDate: days.find((d) => d.cash >= 0)?.date ?? null };
}

export function readyIssues(content: CandidateContent, launchMonth?: string) {
  content = withSharedContainer(content);
  const issues: string[] = [];
  const model = content.models.find((m) => m.id === content.selectedModelId);
  if (!model) return ["Выберите модель для решения владельца"];
  const offer = selectedOffer(model);
  if (!model.name.trim()) issues.push("Название модели");
  if (!model.note.trim()) issues.push("Обоснование выбора модели");
  if (model.wbCard && !model.wbCard.checked) issues.push("Перепроверьте подгруженные данные карточки WB");
  if (!offer?.url || !offer.contact.trim() || !offer.quotedAt || !offer.productionDays) issues.push("Фабрика: ссылка, контакт, дата цены и срок производства");
  const imported = calculateImport(model);
  if (!imported.ok) issues.push(...imported.issues); else issues.push(...imported.warnings.filter(w => w !== "Партия меньше MOQ фабрики"));
  const wb = calculateWb(model); if (!wb.ok) issues.push(...wb.issues);
  const plan = calculatePlan(model); if (!plan.ok) issues.push(...plan.issues);
  if (!model.wb.tariffSource.trim() || !model.wb.tariffDate) issues.push("Источник и дата тарифов WB");
  if (!model.plan.rationale.trim()) issues.push("Обоснование партии и плана продаж");
  if (model.plan.startDate && model.plan.startDate < arrivalDate({ ...content.analysis, startDate: new Date().toISOString().slice(0,10) }, offer?.productionDays ?? model.productionDays)) issues.push("Товар поступит позже начала плана продаж");
  if (!content.decisionComment.trim()) issues.push("Итоговый комментарий для владельца");
  return [...new Set(issues)];
}
