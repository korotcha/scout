import { z } from "zod";
import { importSchema, wbSchema, newModel, type Model } from "./candidate-workflow";

// Older saved presets inherit only newly introduced fields. Existing model values
// are never merged with settings after creation.
const wbPresetSchema = wbSchema.omit({ price: true, stressPricePct: true, stressDrrPoints: true });
export const calculatorSettingsSchema = z.object({
  wbProfiles: z.object({ FBW: wbPresetSchema.optional(), FBS: wbPresetSchema.optional() }).default({}),
  import: z.preprocess(value => value && typeof value === "object" && !Array.isArray(value) ? { ...newModel().import, ...value } : value,
    importSchema.omit({ quantity: true, allocation: true, note: true }).transform(value => ({ ...value, cnyCustoms: value.cnyPurchase, usdCustoms: value.usdPurchase }))),
  wb: z.preprocess(value => value && typeof value === "object" && !Array.isArray(value) ? { ...newModel().wb, ...value } : value,
    wbSchema.omit({ price: true, stressPricePct: true, stressDrrPoints: true })),
}).transform(value => ({ ...value, wbProfiles: {
  ...value.wbProfiles, [value.wb.scheme]: value.wb,
} }));
export const minimumTaxHint = "В плановом расчёте берём большую сумму: УСН с прибыли или 1% дохода без НДС. Не прибавляем 1% сверху. Фактический минимум определяется за год по бизнесу в целом.";
export type CalculatorSettings = z.infer<typeof calculatorSettingsSchema>;
export type SettingsRecord = { settings: CalculatorSettings; revision: number; updatedAt: string | null };
export const settingsFromModel = (m: Model) => calculatorSettingsSchema.parse(m);
export const initialCalculatorSettings = () => settingsFromModel(newModel());
export function modelWithDefaults(settings?: CalculatorSettings | null) {
  const model = newModel();
  if (!settings) return model;
  const snapshot = calculatorSettingsSchema.parse(settings);
  return { ...model, import: { ...model.import, ...snapshot.import }, wb: { ...model.wb, ...snapshot.wb },
    wbProfiles: { FBW: { ...model.wb, ...snapshot.wbProfiles.FBW, scheme: "FBW" as const }, FBS: { ...model.wb, ...snapshot.wbProfiles.FBS, scheme: "FBS" as const } } };
}

export function switchWbScheme(model: Model, scheme: "FBW" | "FBS", settings?: CalculatorSettings): Model {
  if (model.wb.scheme === scheme) return model;
  const prior = model.wbProfiles?.[scheme];
  const preset = settings?.wbProfiles[scheme];
  const base = newModel().wb;
  return { ...model, wbProfiles: { ...model.wbProfiles, [model.wb.scheme]: { ...model.wb } },
    wb: prior ? { ...prior, price: model.wb.price } : { ...base, ...preset, scheme, price: model.wb.price } };
}
