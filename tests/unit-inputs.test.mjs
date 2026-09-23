import test from 'node:test';
import assert from 'node:assert/strict';
import {workbookExample,calculateImport,calculateWb,newContent,readyIssues} from '../lib/candidate-workflow.ts';
import {unitLiters,quoteReceived} from '../lib/unit-inputs.ts';
test('one package supplies both China volume and WB liters; legacy cartons stay explicit',()=>{
 const m=workbookExample(),o=m.offers[0];
 o.unitsPerCarton=2;assert.equal(unitLiters(m),null);
 Object.assign(o,{unitsPerCarton:1,lengthMm:300,widthMm:200,heightMm:100});
 assert.equal(unitLiters(m),6);
 const cost=calculateImport(m);assert.equal(cost.ok,true);
 assert.ok(Math.abs(cost.volume-6/1000*m.import.quantity)<1e-9);
 o.lengthMm=-1;assert.equal(unitLiters(m),null);
});
test('additional commission is charged on revenue and reduces WB profit',()=>{
 const m=workbookExample();m.wb.extraCommissionPct=0;
 Object.assign(m.wb,{price:25000,commissionPct:38,acquiringPct:3,forwardLogistics:700,returnLogistics:50,buyoutPct:85,packaging:40,drrPct:5});
 const before=calculateWb(m);m.wb.extraCommissionPct=3;
 const after=calculateWb(m);assert.equal(before.ok,true);assert.equal(after.ok,true);
 assert.ok(Math.abs(after.commission-before.commission-m.wb.price*.03)<1e-8);
 assert.ok(after.profit<before.profit);
});
test('MOQ is informational and missing MOQ does not create an approval requirement',()=>{
 const m=workbookExample(),c=newContent();c.models=[m];
 m.offers[0].moq=m.import.quantity+1000;
 const cost=calculateImport(m);assert.equal(cost.ok,true);
 assert.ok(cost.warnings.includes('Партия меньше MOQ фабрики'));
 assert.ok(!readyIssues(c).some(x=>x.includes('MOQ')));
 m.offers[0].moq=null;assert.ok(!readyIssues(c).some(x=>x.includes('MOQ')));
});
test('received quote requires price; old quotes retain inferred status',()=>{
 const o=workbookExample().offers[0];delete o.quoteStatus;
 assert.equal(quoteReceived(o),true);
 o.quoteStatus='waiting';assert.equal(quoteReceived(o),false);
 o.quoteStatus='received';o.price=null;assert.equal(quoteReceived(o),false);
});
