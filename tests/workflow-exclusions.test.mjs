import test from "node:test";
import assert from "node:assert/strict";
import {newContent} from "../lib/candidate-workflow.ts";
import {initialScreenerState,clearNumericFilters} from "../lib/screener.ts";
import {selectWorkflowRows} from "../lib/workflow-screener.ts";
test("excluded subjects stay hidden with or without source rows and return with their analyses",()=>{
 const candidate={id:"analysis",subject:"Ёлки",query:"ёлка 180",status:"analysis",content:newContent(),revision:4};
 const row={subject:"Ёлки",query:"ёлка 180",frequency:2000,yoyDemand:20,perArticle:10,yoyPressure:10,articles:200,mom:10};
 const state=initialScreenerState();state.filters=clearNumericFilters(state.filters);state.status="all";
 for(const rows of [[],[row]]){
  const hidden=selectWorkflowRows(rows,[candidate],state,undefined,new Set(["Ёлки"]));
  assert.equal(hidden.rows.length,0);assert.equal(hidden.records.size,0);
  const restored=selectWorkflowRows(rows,[candidate],state,undefined,new Set());
  assert.equal(restored.rows.length,1);assert.equal([...restored.records.values()][0].revision,4);
 }
});
