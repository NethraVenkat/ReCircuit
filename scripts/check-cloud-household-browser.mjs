// Production Next server + real Supabase, local Chromium. No booking submission.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { chromium, expect } from '@playwright/test';
import { SupabaseHouseholdRepository, cloudRequest, storeEvidence } from '../packages/db/dist/index.js';
for (const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) {
  const m=line.match(/^\s*(?:export\s+)?([\w]+)\s*=\s*(.*)$/);if(!m||process.env[m[1]])continue;
  let v=m[2].trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);else v=v.replace(/\s+#.*$/,'');process.env[m[1]]=v;
}
assert.equal(new URL(process.env.SUPABASE_URL).hostname,'sdyvzfcfpmomuwdcqego.supabase.co');
process.env.NODE_ENV='production';delete process.env.RECIRCUIT_PERSISTENCE;
const out='.data/cloud-persistence-20261023';const base='http://localhost:3300';
const run=`browser-cloud-${randomUUID()}`;const repo=new SupabaseHouseholdRepository();
const checks=[];let server,browser,id,evidence;
const originalKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
const pass=name=>{checks.push({name,pass:true});console.log(`PASS ${name}`);};
const log=fs.openSync(`${out}/production-server.log`,'a');
async function stop(){if(server){const done=new Promise(resolve=>server.once('exit',resolve));server.kill();await done;server=undefined;}}
async function start(expectedStatus=200){
 server=spawn(process.execPath,[path.resolve('node_modules/next/dist/bin/next'),'start','-p','3300','-H','localhost'],{cwd:path.resolve('apps/web'),windowsHide:true,env:{...process.env,NEXT_DIST_DIR:'.next-cloud-production'},stdio:['ignore',log,log]});
 for(let i=0;i<60;i++){if(server.exitCode!==null)throw new Error('Production server exited; inspect production-server.log');try{if((await fetch(`${base}/api/health`)).status===expectedStatus)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw new Error('Production server health timeout');
}
try{
 await start();browser=await chromium.launch({headless:true});const context=await browser.newContext();const page=await context.newPage();
 const created=await context.request.post(`${base}/api/plan`,{timeout:90000,data:{text:run,mode:'fixture',items:[{id:randomUUID(),rawText:'Synthetic laptop',category:'laptop',quantity:1,declaredWeightKg:2.5,weightSource:'user_declared',hazardClass:'none',confidence:1}]}});
 assert.equal(created.status(),200,await created.text());const data=await created.json();id=data.requestId;
 await page.goto(`${base}/r/${id}`);await expect(page.getByRole('button',{name:'Review recommended plan'})).toBeVisible();
 await page.getByRole('button',{name:'Review recommended plan'}).click();
 await page.getByLabel('I have reviewed',{exact:false}).check();await page.getByLabel('I confirm any required data wipe',{exact:false}).check();
 const approved=page.waitForResponse(r=>r.url().endsWith('/api/approve'));await page.getByRole('button',{name:'Approve this plan'}).click();const approval=await approved;assert.equal(approval.status(),200,await approval.text());
 await page.screenshot({path:`${out}/cloud-household-approved.png`,fullPage:true});
 pass('production browser plan and approval persist in Supabase');
 await stop();await start();await page.reload();await expect(page.getByRole('button',{name:'Start booking',exact:true})).toBeVisible();
 pass('production server restart retains owned plan and approval');
 const stranger=await browser.newContext();assert.equal((await stranger.request.get(`${base}/api/requests/${id}`)).status(),404);
 assert.deepEqual((await (await stranger.request.get(`${base}/api/requests`)).json()).requests,[]);
 const record=await repo.getRequest(id);evidence=await storeEvidence(`${run}.json`,Buffer.from(JSON.stringify({run})),'application/json');record.request.description=evidence;await repo.saveRequest(record);
 const evidenceUrl=`${base}/api/evidence-access?requestId=${id}&reference=${encodeURIComponent(evidence)}`;
 assert.equal((await stranger.request.get(evidenceUrl)).status(),404);
 assert.equal((await context.request.get(evidenceUrl)).status(),404,'user-authored description must not authorize evidence signing');
 record.household.policySources[0].evidence.screenshotRef=evidence;await repo.saveRequest(record);
 const signed=await context.request.get(evidenceUrl);assert.equal(signed.status(),200);const signedBody=await signed.json();assert.equal((await fetch(signedBody.url)).status,200);
 assert.equal((await context.request.get(`${base}/api/evidence-access?requestId=${id}&reference=storage%3A%2F%2Frecircuit-evidence%2Fother`)).status(),404);
 pass('household and evidence HTTP ownership isolation; owned short-lived signed access');
 const stored=await repo.getRequest(id);const booking=await context.request.post(`${base}/api/book`,{data:{requestId:id,planHash:stored.plan.planHash}});assert.equal(booking.status(),400);
 assert.match((await booking.json()).error,/fixture/);
 pass('fixture booking blocked without invoking a browser worker');
 const changed=await context.request.post(`${base}/api/approve`,{data:{requestId:id,planHash:'changed',decision:'approved'}});assert.notEqual(changed.status(),200);
 pass('HTTP stale approval rejected');
 await stop();process.env.SUPABASE_SERVICE_ROLE_KEY='invalid-synthetic-key';await start(503);
 const unavailable=await context.request.get(`${base}/api/requests/${id}`);assert.equal(unavailable.status(),503);assert.match((await unavailable.json()).error,/PERSISTENCE_UNAVAILABLE/);
 assert.equal((await context.request.get(`${base}/api/requests`)).status(),503);
 await stop();process.env.SUPABASE_SERVICE_ROLE_KEY=originalKey;
 pass('production database failure returns HTTP 503 with no local fallback');
 await stranger.close();await context.close();
}catch(error){checks.push({name:'production browser',pass:false,error:error.message});process.exitCode=1;console.error(error.message);}
finally{
 if(browser)await browser.close();await stop();fs.closeSync(log);process.env.SUPABASE_SERVICE_ROLE_KEY=originalKey;
 try{
  // A lost HTTP response may hide a committed save. Recover only this run's
  // exact marker before cleanup, rather than claiming that no ID means no row.
  if(!id){const recovered=await cloudRequest(`/rest/v1/household_records?select=id&record->request->>description=eq.${run}`);assert.ok(recovered.length<=1);id=recovered[0]?.id;}
  if(id){await cloudRequest(`/rest/v1/household_actions?request_id=eq.${id}`,{method:'DELETE'});await cloudRequest(`/rest/v1/household_records?id=eq.${id}`,{method:'DELETE'});await cloudRequest(`/rest/v1/household_locks?id=eq.${id}`,{method:'DELETE'});assert.deepEqual(await cloudRequest(`/rest/v1/household_records?id=eq.${id}&select=id`),[]);}
  if(evidence)await cloudRequest('/storage/v1/object/recircuit-evidence',{method:'DELETE',body:JSON.stringify({prefixes:[evidence.slice('storage://recircuit-evidence/'.length)]})});
  pass('production browser exact synthetic cleanup');
 }catch(error){checks.push({name:'cleanup',pass:false,error:error.message});process.exitCode=1;}
 fs.writeFileSync(`${out}/production-browser-results.json`,JSON.stringify({run,id,checks,exitCode:process.exitCode||0},null,2));
}
