import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { newModel, modelSchema } from '../lib/candidate-workflow.ts';
import { initialCalculatorSettings, calculatorSettingsSchema, modelWithDefaults, switchWbScheme } from '../lib/calculator-settings.ts';
import { encryptKey, decryptKey } from '../lib/connection-crypto.ts';
import { tariffSuggestion, tariffNumber } from '../lib/wb-tariffs.ts';

test('FBW and FBS presets and per-model overrides survive repeated switches and roundtrip',()=>{
 const settings=initialCalculatorSettings();settings.wb.commissionPct=20;
 settings.wbProfiles.FBS={...settings.wb,scheme:'FBS',commissionPct:25,forwardLogistics:100};
 const parsed=calculatorSettingsSchema.parse(settings);let m=modelWithDefaults(parsed);
 m.wb.commissionPct=17;m.wb.forwardLogistics=0;m.wb.price=2500;
 m=switchWbScheme(m,'FBS',parsed);assert.equal(m.wb.commissionPct,25);assert.equal(m.wb.price,2500);
 m.wb.forwardLogistics=150;m=modelSchema.parse(m);
 m=switchWbScheme(m,'FBW',parsed);assert.equal(m.wb.commissionPct,17);assert.equal(m.wb.forwardLogistics,0);
 m=switchWbScheme(m,'FBS',parsed);assert.equal(m.wb.forwardLogistics,150);
 assert.equal(settings.wbProfiles.FBS.forwardLogistics,100);
});
test('legacy model gains stage and production defaults without changing saved monetary inputs',()=>{
 const m=newModel();delete m.productionDays;delete m.stage;delete m.wbProfiles;
 m.wb.price=1234;m.import.cnyPurchase=12;m.import.cnyCustoms=13;
 const parsed=modelSchema.parse(m);assert.equal(parsed.productionDays,45);assert.equal(parsed.stage,'factory');assert.equal(parsed.wb.price,1234);assert.equal(parsed.import.cnyCustoms,13);
});
test('connection token encryption is randomized, authenticated, and never stored in plaintext',async()=>{
 const secret=randomBytes(32).toString('base64'),token='private.test.token';
 const a=await encryptKey(token,secret),b=await encryptKey(token,secret);
 assert.notEqual(a,b);assert.ok(!a.includes(token));assert.equal(await decryptKey(a,secret),token);
 await assert.rejects(()=>decryptKey(a,randomBytes(32).toString('base64')));
});
test('tariff mapping respects scheme and null data, requires exact subject and valid warehouse',()=>{
 const t={date:'2026-09-16',commissions:[{subjectID:1,subjectName:'Кофемашины',paidStorageKgvp:20,kgvpMarketplace:25}],warehouses:[{warehouseName:'Тест',boxDeliveryBase:'40',boxDeliveryLiter:'10,5',boxDeliveryMarketplaceBase:'50',boxDeliveryMarketplaceLiter:'12'}]};
 assert.deepEqual(tariffSuggestion(t,'кофемашины','Тест','FBW',2),{commission:20,logistics:50.5});
 assert.deepEqual(tariffSuggestion(t,'Кофемашины','Тест','FBS',2),{commission:25,logistics:62});
 assert.deepEqual(tariffSuggestion(t,'Кофе','Неизвестно','FBS',2),{commission:null,logistics:null});
 assert.equal(tariffSuggestion(t,'Кофемашины','Тест','FBW',0.5).logistics,null);
 assert.equal(tariffNumber('—'),null);assert.equal(tariffNumber(''),null);assert.equal(tariffNumber('0'),0);
});
