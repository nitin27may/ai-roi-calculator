import { loadCatalog } from "@studio/catalog";
import { buildLedger, computeRoi, evaluateLevers, meetingIntelligence as p } from "@studio/engine";
const cat = loadCatalog(); const L = buildLedger(p, cat); const f = (n:number)=>"$"+Math.round(n).toLocaleString("en-CA");
console.log("build", f(L.totals.build), "labour", f(L.totals.buildLabour), "devlab", f(L.totals.devLab));
console.log("run-rate", f(L.totals.runRate), "maint", f(L.totals.maintRate), "benefit", f(L.totals.benefitRate));
const devByComp: Record<string,number> = {}; for (const m of L.months.filter(m=>m.phase==="build")) for (const l of m.lines.filter(l=>l.stream==="devlab")) devByComp[l.componentId]=(devByComp[l.componentId]??0)+l.cost;
console.log(Object.fromEntries(Object.entries(devByComp).map(([k,v])=>[k,f(v)])));
console.log("devlab by month", L.months.slice(0,6).map(m=>f(m.byStream.devlab)).join(" "));
const run: Record<string,number> = {}; for (const l of L.months[35]!.lines) run[l.componentId]=(run[l.componentId]??0)+l.cost; console.log(Object.fromEntries(Object.entries(run).map(([k,v])=>[k,f(v)])));
for (const b of ["run","runMaint","full"] as const){const r=computeRoi(L,b);console.log(b,"payback",r.paybackMonth,"roi",(r.roi*100).toFixed(0)+"%")}
for (const o of evaluateLevers(p,cat)) console.log(o.lever.id, f(o.saving));
console.log(L.notes.map(n=>n.message));
