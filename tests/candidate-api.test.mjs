import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { newContent, workbookExample } from "../lib/candidate-workflow.ts";

import { researchedContent } from "./research-fixture.mjs";
const db = new DatabaseSync(":memory:");
for (const f of readdirSync(new URL("../drizzle/", import.meta.url)).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(new URL(`../drizzle/${f}`, import.meta.url), "utf8"));
db.exec("INSERT INTO analysis_projects(name, current_period, comparison_period, launch_month) VALUES ('Октябрь 27', '2026-10', '2025-10', '2027-10')");
globalThis.__candidateTestDb = { prepare(sql) {
  let args = [];
  const q = { bind(...v) { args = v; return q; }, async first() { return db.prepare(sql).get(...args) ?? null; }, async all() { return { results: db.prepare(sql).all(...args) }; }, async run() { return db.prepare(sql).run(...args); } };
  return q;
} };
const dir = mkdtempSync(join(tmpdir(), "market-radar-api-"));
await build({ entryPoints: [new URL("../app/api/candidates/route.ts", import.meta.url).pathname], outfile: join(dir, "route.mjs"), bundle: true, platform: "node", format: "esm", logLevel: "silent",
  plugins: [{ name: "test-db-only", setup(b) {
    b.onResolve({ filter: /^@\/db$/ }, () => ({ path: "fake-db", namespace: "test-db" }));
    b.onLoad({ filter: /.*/, namespace: "test-db" }, () => ({ contents: "export const getRawDb = () => globalThis.__candidateTestDb;", loader: "js" }));
  } }] });
const api = await import(pathToFileURL(join(dir, "route.mjs")).href);
test("one-screen decisions retain analysis and keep the shortlist and exclusion list consistent",async()=>{
 const query="single-screen-decision",c=researchedContent();
 const getMark=()=>db.prepare("SELECT status FROM screener_marks WHERE context_key=? AND query_key=?").get("month:2027-10",query)?.status;
 const created=await result(query,c,"save");assert.equal(created.response.status,201);assert.equal(getMark(),"shortlisted");
 assert.equal((await result(query,c,"nominate",1)).response.status,403);
 const nominated=await result(query,c,"nominate",1,owner);assert.equal(nominated.response.status,200);assert.equal(nominated.body.candidate.status,"sourcing");assert.equal(nominated.body.candidate.analysisPassed,true);
 c.decisionComment="В этом сезоне уже не успеваем";
 const deferred=await result(query,c,"defer",2);assert.equal(deferred.response.status,200);assert.equal(getMark(),"shortlisted");
 assert.equal(deferred.body.candidate.status,"deferred");
 const excluded=await result(query,c,"reject",3);assert.equal(excluded.response.status,200);assert.equal(getMark(),"excluded");
 db.prepare("UPDATE screener_marks SET status='shortlisted',updated_by=?,updated_at=? WHERE context_key=? AND query_key=?").run(owner,"2026-09-16T12:00:00Z","month:2027-10",query);
 const restored=db.prepare("SELECT * FROM candidates WHERE id=?").get(excluded.body.candidate.id);
 assert.equal(restored.status,"sourcing");assert.equal(restored.revision,5);assert.deepEqual(JSON.parse(restored.content_json).analysis,excluded.body.candidate.content.analysis);
 assert.equal((await result(query,c,"reject",4)).response.status,409,"stale cards cannot overwrite a table decision");
 const reopened=await result(query,c,"reopen_analysis",5);assert.equal(reopened.response.status,200);assert.equal(reopened.body.candidate.status,"unreviewed");assert.equal(reopened.body.candidate.analysisPassed,false);assert.equal(getMark(),undefined);
 const shortlisted=await result(query,c,"shortlist",6);assert.equal(shortlisted.response.status,200);assert.equal(shortlisted.body.candidate.status,"analysis");assert.equal(getMark(),"shortlisted");
 const nominatedAgain=await result(query,c,"nominate",7,owner);assert.equal(nominatedAgain.response.status,200);assert.equal(nominatedAgain.body.candidate.id,nominated.body.candidate.id,"the same query uses one unit economics block");
 assert.deepEqual(nominatedAgain.body.candidate.content.analysis,nominated.body.candidate.content.analysis);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM candidates WHERE context_key=? AND query_key=?").get("month:2027-10",query).n,1);
 const incomplete=await result("single-screen-incomplete",newContent(),"nominate",0,owner);assert.equal(incomplete.response.status,400);
 db.prepare("DELETE FROM candidates WHERE id=?").run(reopened.body.candidate.id);
 db.prepare("DELETE FROM screener_marks WHERE context_key=? AND query_key=?").run("month:2027-10",query);
});
const actor = "manager@example.test", owner = "korotcha@yandex.ru";
const req = (payload, email = actor, extra = {}) => new Request("https://app.test/api/candidates", { method: "POST", headers: { "content-type": "application/json", ...(email ? { "oai-authenticated-user-email": email } : {}), ...extra }, body: JSON.stringify(payload) });
const payload = (query, content = newContent(), action = "save", revision = 0, contextKey = "month:2027-10", id) => ({ subject: "Кофемашины", query, content, action, revision, contextKey, id });
async function result(query, content, action, revision = 0, email = actor, id) { const response = await api.POST(req(payload(query, content, action, revision, "month:2027-10", id), email)); return { response, body: await response.json() }; }
test("independent blocks persist models without changing research approval gates",async()=>{
 const content=newContent();content.manualBlock=true;content.blockName="Мой блок";
 const created=await result("block:test",content,"create_block");assert.equal(created.response.status,201);
 const c=created.body.candidate;assert.equal(c.analysisPassed,false);assert.equal(c.content.blockName,"Мой блок");
 c.content.models=[workbookExample()];
 const saved=await result(c.query,c.content,"save",c.revision,actor,c.id);assert.equal(saved.response.status,200);
 assert.equal(saved.body.candidate.content.models.length,1);
 const forged=newContent();forged.manualBlock=true;
 assert.equal((await result("forged-block",forged,"save")).response.status,403);
 assert.equal((await result(c.query,c.content,"purchase",saved.body.candidate.revision,owner,c.id)).response.status,400);
 const regular=await result("cannot-convert",newContent(),"save");regular.body.candidate.content.manualBlock=true;
 assert.equal((await result("cannot-convert",regular.body.candidate.content,"save",1,actor,regular.body.candidate.id)).response.status,403);
 db.prepare("DELETE FROM candidates WHERE id IN (?, ?)").run(c.id,regular.body.candidate.id);
});
test("candidate grouping changes only block name and preserves workflow state", async()=>{
 const c=researchedContent();
 let r=await result("grouping-test",c,"submit_analysis");assert.equal(r.response.status,201);
 r=await result("grouping-test",r.body.candidate.content,"pass_analysis",r.body.candidate.revision,owner,r.body.candidate.id);assert.equal(r.response.status,200);
 const before=r.body.candidate;
 const moved={...before.content,blockName:"Запуск ноябрь"};
 const organized=await result("grouping-test",moved,"organize",before.revision,actor,before.id);assert.equal(organized.response.status,200);
 assert.equal(organized.body.candidate.status,before.status);assert.equal(organized.body.candidate.analysisPassed,before.analysisPassed);assert.equal(organized.body.candidate.content.blockName,"Запуск ноябрь");
 const forged={...organized.body.candidate.content,decisionComment:"changed too"};
 assert.equal((await result("grouping-test",forged,"organize",organized.body.candidate.revision,actor,before.id)).response.status,400);
 db.prepare("DELETE FROM candidates WHERE id=?").run(before.id);
});

test("identity, origin, month isolation and one query per analysis are enforced", async () => {
 assert.equal((await api.POST(req(payload("A"), ""))).status, 401);
 assert.equal((await api.POST(req(payload("A"), actor, { origin: "https://evil.test" }))).status, 403);
 const a = await result("A", newContent(), "save"); assert.equal(a.response.status, 201);
 const b = await result("B", newContent(), "save"); assert.equal(b.response.status, 201);
 assert.notEqual(a.body.candidate.id, b.body.candidate.id);
 assert.equal((await result("  a  ", newContent(), "save")).response.status, 409);
 assert.equal((await api.POST(req({ ...payload("A"), subject: "Другой предмет" }))).status, 409);
 assert.equal((await api.POST(req(payload("A", newContent(), "save", 0, "month:2026-10")))).status, 201);
 assert.equal((await result("A", newContent(), "save", 0)).response.status, 409);
 assert.equal((await api.POST(req(payload("A", newContent(), "save", 1, "month:2026-10", a.body.candidate.id)))).status, 404);
 const list = await api.GET(new Request("https://app.test/api/candidates?context=month:2027-10", { headers: { "oai-authenticated-user-email": actor } }));
 const body = await list.json(); assert.equal(body.candidates.length, 2); assert.equal(body.canDecide, false);
 const changed = newContent(); changed.analysis.comment = "Только разбор B";
 assert.equal((await result("B", changed, "save", 1, actor, b.body.candidate.id)).response.status, 200);
 const again = await api.GET(new Request("https://app.test/api/candidates?context=month:2027-10", { headers: { "oai-authenticated-user-email": actor } }));
 assert.equal((await again.json()).candidates.find(c => c.query === "A").content.analysis.comment, "");
});
test("manager submits completed analysis; only owner can approve the exact saved facts", async () => {
 const c = researchedContent();
 assert.equal((await result("C", c, "pass_analysis")).response.status, 403);
 assert.equal((await result("C", c, "pass_analysis", 0, owner)).response.status, 400);
 let r = await result("C", c, "submit_analysis"); assert.equal(r.response.status, 201); const id = r.body.candidate.id;
 assert.equal(r.body.candidate.status, "analysis_ready"); assert.equal(r.body.candidate.analysisPassed, false);
 assert.equal((await result("C", c, "pass_analysis", 1, actor, id)).response.status, 403);
 const edited = structuredClone(c); edited.analysis.comment += " Changed";
 assert.equal((await result("C", edited, "pass_analysis", 1, owner, id)).response.status, 400);
 r = await result("C", c, "pass_analysis", 1, owner, id); assert.equal(r.response.status, 200); assert.equal(r.body.candidate.analysisPassed, true);
 c.models = [workbookExample()]; r = await result("C", c, "save", 2, actor, id); assert.equal(r.response.status, 200);
 c.analysis.comment += " New facts"; r = await result("C", c, "save", 3, actor, id);
 assert.equal(r.response.status, 200); assert.equal(r.body.candidate.status, "analysis"); assert.equal(r.body.candidate.analysisPassed, false); assert.equal(r.body.candidate.content.models.length, 1);
 c.models[0].name = "Unapproved edit";
 assert.equal((await result("C", c, "save", 4, actor, id)).response.status, 400);
 assert.equal((await result("Different query", c, "save", 4, actor, id)).response.status, 400);
});
test("poor or late analyses can be saved and submitted but stop factors block sourcing", async () => {
 const c = researchedContent(); c.analysis.research.seasonFollowsHistory = false; c.analysis.launchDate = "2026-09-09"; c.analysis.research.seasonEnd = "2027-01-31";
 let r = await result("Late", c, "submit_analysis"); assert.equal(r.response.status, 201);
 r = await result("Late", c, "pass_analysis", 1, owner, r.body.candidate.id); assert.equal(r.response.status, 400); assert.match(r.body.error, /опаздываем/);
 const empty = newContent(); assert.equal((await result("Empty", empty, "submit_analysis")).response.status, 400);
 empty.models = [workbookExample()]; assert.equal((await result("Empty", empty, "save")).response.status, 400);
});
test("legacy subject records and their models survive migration and explicit query assignment", async () => {
 const old = newContent(); delete old.analysis.research; old.models = [workbookExample()];
 db.prepare("INSERT INTO candidates(id,context_key,subject,period,status,analysis_passed,revision,content_json,history_json,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run("legacy", "month:2027-10", "Кофемашины", "2027-10", "sourcing", 1, 1, JSON.stringify(old), "[]", actor, "2026-09-01T00:00:00Z");
 const list = await api.GET(new Request("https://app.test/api/candidates?context=month:2027-10", { headers: { "oai-authenticated-user-email": actor } }));
 const found = (await list.json()).candidates.find(c => c.id === "legacy"); assert.equal(found.query, ""); assert.equal(found.content.analysis.research.version, 1); assert.equal(found.content.models.length, 1);
 const bound = await result("Прежний запрос", found.content, "save", 1, actor, "legacy"); assert.equal(bound.response.status, 200); assert.equal(bound.body.candidate.content.models.length, 1); assert.equal(bound.body.candidate.query, "Прежний запрос");
});
test("rejection retains explanation, no client status or unsafe content bypasses checks", async () => {
 const c = newContent(); assert.equal((await result("Rejected", c, "reject")).response.status, 400);
 c.decisionComment = "Нет устойчивого спроса";
 const r = await result("Rejected", c, "reject"); assert.equal(r.response.status, 201); assert.equal(r.body.candidate.history[0].note, c.decisionComment);
 assert.equal((await result("Rejected", c, "purchase", 1)).response.status, 403);
 const bad = researchedContent(); bad.analysis.research.cohortUrl = "javascript:alert(1)"; assert.equal((await result("Unsafe", bad, "save")).response.status, 400);
 const duplicate = researchedContent(); duplicate.analysis.research.competitors.push(duplicate.analysis.research.competitors[0]); assert.equal((await result("Duplicate", duplicate, "save")).response.status, 400);
});
test("financial approval still requires owner and a saved unchanged calculation", async () => {
 const c = researchedContent(); let r = await result("Finance", c, "submit_analysis"); const id = r.body.candidate.id;
 assert.equal((await result("Finance", c, "pass_analysis", 1, owner, id)).response.status, 200);
 const m = workbookExample(); c.models = [m]; c.selectedModelId = m.id; c.decisionComment = "Готово";
 Object.assign(m.offers[0], { url: "https://example.test/factory", contact: "Contact", quotedAt: "2026-09-01", moq: 600, productionDays: 45 });
 Object.assign(m.wb, { price: 25000, commissionPct: 38, acquiringPct: 3, forwardLogistics: 700, returnLogistics: 50, buyoutPct: 85, tariffDate: "2026-09-01", tariffSource: "Fixture" });
 Object.assign(m.plan, { startDate: new Date().toISOString().slice(0,10), sellUnits: 600, rationale: "Fixture" });
 r = await result("Finance", c, "ready", 2, actor, id); assert.equal(r.response.status, 400); assert.match(r.body.error, /позже начала/);
 // A model can start in another month without moving its source analysis.
 m.plan.startDate = "2027-11-01"; r = await result("Finance", c, "ready", 2, actor, id); assert.equal(r.response.status, 200);
 assert.equal((await result("Finance", c, "purchase", 3, actor, id)).response.status, 403);
 c.models[0].wb.price = 26000; assert.equal((await result("Finance", c, "purchase", 3, owner, id)).response.status, 400);
 c.models[0].wb.price = 25000; r = await result("Finance", c, "purchase", 3, owner, id); assert.equal(r.response.status, 200); assert.equal(r.body.candidate.status, "purchased");
});
test("single season is normalized on save and cheap niches can be rejected before full research", async () => {
 const c = researchedContent(); c.analysis.launchDate = "2099-01-01"; c.analysis.research.seasonEnd = "2099-12-31";
 const saved = await result("Season normalization", c, "save");
 assert.equal(saved.response.status, 201);
 assert.equal(saved.body.candidate.content.analysis.launchDate, "2027-10-01");
 assert.equal(saved.body.candidate.content.analysis.research.seasonEnd, "2028-01-31");
 const cheap = newContent(); cheap.analysis.research.competitors = c.analysis.research.competitors.map(row => ({ ...row, revenue: null, price: 900, content: "unknown", checkedAt: "" }));
 cheap.decisionComment = "Средняя цена топ-10 ниже 1 000 ₽. Отклонено на первичной проверке цены.";
 const rejected = await result("Price stop", cheap, "reject");
 assert.equal(rejected.response.status, 201); assert.equal(rejected.body.candidate.status, "rejected");
 assert.equal(rejected.body.candidate.content.analysis.research.competitors.length, 10);
 assert.equal(rejected.body.candidate.history[0].note, cheap.decisionComment);
});
test("competitor range and row position survive save; duplicate row positions are rejected", async () => {
 const c = researchedContent(); c.analysis.research.competitors = c.analysis.research.competitors.slice(0, 2);
 Object.assign(c.analysis.research.competitors[0], { slot: 6, price: null, priceFrom: 1500, priceTo: 2300, endStockRisk: 'out' });
 Object.assign(c.analysis.research.competitors[1], { slot: 10 });
 const r = await result('Sparse slots', c, 'save'); assert.equal(r.response.status, 201);
 const row = r.body.candidate.content.analysis.research.competitors[0];
 assert.equal(row.slot, 6); assert.equal(row.priceFrom, 1500); assert.equal(row.priceTo, 2300); assert.equal(row.endStockRisk, 'out');
 assert.equal(r.body.candidate.content.analysis.research.competitors.length, 2);
 c.analysis.research.competitors[1].slot = 6;
 assert.equal((await result('Duplicate slots', c, 'save')).response.status, 400);
});
test("candidate pagination retains every independent analysis beyond the first page", async () => {
 const insert = db.prepare("INSERT INTO candidates(id,context_key,subject,query,query_key,period,status,analysis_passed,revision,content_json,history_json,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
 for (let i = 0; i < 205; i++) insert.run(`page-${i}`, "month:2027-11", "Кофемашины", `query ${i}`, `query ${i}`, "2027-11", "analysis", 0, 1, JSON.stringify(newContent()), "[]", actor, "2026-09-08T00:00:00Z");
 const ids = [], pageSizes = []; let offset = 0;
 while (offset != null) {
   const response = await api.GET(new Request(`https://app.test/api/candidates?context=month:2027-11&offset=${offset}`, { headers: { "oai-authenticated-user-email": actor } }));
   assert.equal(response.status, 200); const page = await response.json(); pageSizes.push(page.candidates.length); ids.push(...page.candidates.map(c => c.id)); offset = page.nextOffset;
 }
 assert.deepEqual(pageSizes, [100, 100, 5]); assert.equal(new Set(ids).size, 205);
});

test("visual low-price rejection needs a reason but no group or competitor rows", async () => {
 const c = newContent();
 assert.equal((await result("Visual early stop", c, "reject")).response.status, 400);
 c.decisionComment = "В релевантной выдаче товары стоят 500–700 ₽";
 const r = await result("Visual early stop", c, "reject");
 assert.equal(r.response.status, 201);
 assert.equal(r.body.candidate.status, "rejected");
 assert.equal(r.body.candidate.content.analysis.research.competitors.length, 0);
 assert.equal(r.body.candidate.content.decisionComment, c.decisionComment);
});
