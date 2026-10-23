// Run with node node_modules/vite-node/vite-node.mjs scripts/check-cloud-persistence.mjs
// Direct synthetic adapter tests only; no portal submission or CAPTCHA solving.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { SupabaseHouseholdRepository, cloudRequest, storeEvidence, signEvidence } from '../packages/db/dist/index.js';
import { hashPlan } from '../packages/core/dist/index.js';
import { SupabaseRepository } from '../apps/portals/src/lib/repository/supabase-repository.ts';
import { openSession } from '../apps/worker/src/browser/session.ts';

if (fs.existsSync('.env.local')) {
  for (const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([\w]+)\s*=\s*(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1,-1);
    else value = value.replace(/\s+#.*$/,'');
    process.env[m[1]] = value;
  }
}
assert.equal(new URL(process.env.SUPABASE_URL).hostname,'sdyvzfcfpmomuwdcqego.supabase.co','Unexpected project');
process.env.NODE_ENV = 'production';
const repo = new SupabaseHouseholdRepository();
if (process.argv.includes('--nonce')) {
  const nonceArg=process.argv[process.argv.indexOf('--nonce')+1];
  assert.equal(await new SupabaseRepository(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY).consumeNonce(nonceArg,Date.now()+60000),false);
  console.log('fresh-process nonce replay rejected');process.exit(0);
}
if (process.argv.includes('--read')) {
  const args = process.argv.slice(process.argv.indexOf('--read')+1);
  const read = await repo.getRequest(args[0],args[1]);
  assert.equal(read?.request.id,args[0]);
  assert.equal(read?.household.policySources[0].evidence.extractedAt,read?.household.policies[0].retrievedAt);
  console.log('fresh-process-read PASS');
  process.exit(0);
}

const out = '.data/cloud-persistence-20261023'; fs.mkdirSync(out,{recursive:true});
const run = `cloud-check-${randomUUID()}`;
const id = randomUUID(), owner = randomUUID(), nonce = randomUUID(), switchId = run;
const jobIds = [];
let evidence;
let screenshot;
const checks = [];
const pass = name => { checks.push({ name, pass: true }); console.log(`PASS ${name}`); };
const portal = new SupabaseRepository(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const portalRest = (path,init={}) => cloudRequest(`/rest/v1/${path}`,{...init,headers:{'Accept-Profile':'portal','Content-Profile':'portal',...init.headers}});
const cleanup = async () => {
  await portalRest(`bookings?client_request_id=eq.${run}&recycler_id=eq.deccan`,{method:'DELETE'});
  await portalRest(`failure_switches?recycler_id=eq.${switchId}`,{method:'DELETE'});
  await portalRest(`captcha_nonces?nonce=eq.${nonce}`,{method:'DELETE'});
  await cloudRequest(`/rest/v1/household_actions?request_id=eq.${id}`,{method:'DELETE'});
  for (const jobId of jobIds) await cloudRequest(`/rest/v1/household_jobs?id=eq.${jobId}`,{method:'DELETE'});
  await cloudRequest(`/rest/v1/household_records?id=eq.${id}&owner_id=eq.${owner}`,{method:'DELETE'});
  await cloudRequest(`/rest/v1/household_locks?id=eq.${id}`,{method:'DELETE'});
  if(evidence) await cloudRequest('/storage/v1/object/recircuit-evidence',{method:'DELETE',body:JSON.stringify({prefixes:[evidence.slice('storage://recircuit-evidence/'.length)]})});
  if(screenshot) await cloudRequest('/storage/v1/object/recircuit-evidence',{method:'DELETE',body:JSON.stringify({prefixes:[screenshot.slice('storage://recircuit-evidence/'.length)]})});
  assert.deepEqual(await cloudRequest(`/rest/v1/household_records?id=eq.${id}&select=id`),[]);
  assert.deepEqual(await portalRest(`bookings?client_request_id=eq.${run}&select=id`),[]);
};
try {
  const now = new Date().toISOString();
  evidence = await storeEvidence(`${run}.json`,Buffer.from(JSON.stringify({run,synthetic:true})),'application/json');
  const session=await openSession({mode:'local',headless:true});
  try {await session.page.setContent('<h1>Synthetic durable evidence check</h1>');screenshot=(await session.captureScreenshot(run)).path;assert.match(screenshot,/^storage:\/\/recircuit-evidence\//);}
  finally {await session.close();}
  pass('production worker screenshots use private durable storage');
  const plan = { id:randomUUID(),requestId:id,planHash:'',legs:[{id:randomUUID(),recyclerId:'deccan',recyclerName:'Synthetic',itemIds:[],items:[],estimatedFee:180,estimatedPayout:0,state:'APPROVED',createdAt:now,updatedAt:now}],totalEstimatedFee:180,totalEstimatedPayout:0,createdAt:now };
  plan.planHash=hashPlan(plan);
  const record = {request:{id,userId:owner,description:run,state:'AWAITING_APPROVAL',createdAt:now,updatedAt:now},items:[],plan,approval:null,auditEvents:[],updatedAt:now,household:{policyMode:'live',policies:[{recyclerId:'deccan',status:'SUCCESS',provenance:'live',freshness:'fresh',expired:false,retrievedAt:now,expiresAt:new Date(Date.now()+600000).toISOString()}],policySources:[{recyclerId:'deccan',evidence:{extractedAt:now,screenshotRef:evidence}}]}};
  await repo.saveRequest(record);
  await repo.appendAudit({id:randomUUID(),requestId:id,previousState:'DRAFT',newState:'AWAITING_APPROVAL',observedAt:now,evidenceType:'synthetic',evidenceReference:run});
  assert.equal((await new SupabaseHouseholdRepository().getAudits({requestId:id})).length,1);
  pass('audit append and fresh-repository readback');
  const fresh=spawnSync(process.execPath,['node_modules/vite-node/vite-node.mjs','scripts/check-cloud-persistence.mjs','--read',id,owner],{encoding:'utf8',env:process.env,timeout:60000});
  assert.equal(fresh.status,0,'fresh-process read failed');
  pass('fresh-process household readback and original evidence timestamps');
  assert.equal(await repo.getRequest(id,'stranger'),null);
  assert.deepEqual(await repo.listRequests('stranger'),[]);
  await assert.rejects(()=>repo.saveRequest({...record,request:{...record.request,userId:'stranger'}}));
  pass('owner-filtered reads and immutable owner on writes');
  const signed = await signEvidence(evidence);
  const download = await fetch(signed);
  assert.equal(download.status,200);
  assert.equal((await download.json()).run,run);
  const publicDownload = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/public/recircuit-evidence/${evidence.slice('storage://recircuit-evidence/'.length)}`);
  assert.notEqual(publicDownload.status,200);
  pass('private durable evidence, signed download, public download denied');
  const snapshots=await Promise.all([repo.getRequest(id),new SupabaseHouseholdRepository().getRequest(id)]);
  const raced=await Promise.allSettled(snapshots.map((r,i)=>repo.saveRequest({...r,household:{...r.household,race:i}})));
  assert.equal(raced.filter(r=>r.status==='fulfilled').length,1);
  pass('concurrent household revisions permit one winner');
  let release; const gate=new Promise(resolve=>{release=resolve;});
  let entered; const ready=new Promise(resolve=>{entered=resolve;});
  const held=repo.withRequestLock(id,async()=>{entered();await gate;});
  await ready;
  try { await assert.rejects(()=>new SupabaseHouseholdRepository().withRequestLock(id,async()=>{}),/BUSY/); }
  finally {release();await held;}
  pass('independent repository request locks reject competing actions');
  let saved=await repo.getRequest(id);
  const expired={...saved,request:{...saved.request,state:'APPROVED'},approval:{decision:'approved',planHash:plan.planHash},household:{...saved.household,policies:[{...saved.household.policies[0],expiresAt:'2000-01-01T00:00:00Z'}]}};
  await assert.rejects(()=>repo.saveRequest(expired),/STALE/);
  await assert.rejects(()=>repo.saveRequest({...expired,approval:{decision:'approved',planHash:'wrong'}}),/STALE/);
  pass('expired evidence and changed approval hash fail closed');
  saved=await repo.getRequest(id);
  saved.request.state='APPROVED';saved.approval={decision:'approved',planHash:plan.planHash};
  await repo.saveRequest(saved);
  saved.plan.legs[0].state='SUBMITTING';await repo.saveRequest(saved);
  const action={requestId:id,legId:plan.legs[0].id,planHash:plan.planHash,allowed:true,action:'synthetic-no-browser'};
  const actions=await Promise.allSettled([repo.appendAction(action,run),new SupabaseHouseholdRepository().appendAction(action,run)]);
  assert.equal(actions.filter(r=>r.status==='fulfilled').length,1);
  const expiredClaim=await repo.getRequest(id);expiredClaim.household.policies[0].expiresAt='2000-01-01T00:00:00Z';await repo.saveRequest(expiredClaim);
  await assert.rejects(()=>repo.appendAction(action,`${run}-expired`),/STALE/);
  pass('atomic action reservation and database expiry recheck before submission');
  const booking={recyclerId:'deccan',clientRequestId:run,fullName:'Synthetic cloud check',phone:'0000000000',addressLine:'Test only - no pickup',locality:'Test',pincode:'500072',preferredSlot:'TEST ONLY',items:[],chargedFeeInr:180,dataWipeAcknowledged:true};
  const bookings=await Promise.all(Array.from({length:8},()=>new SupabaseRepository(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY).createBooking(booking)));
  assert.equal(new Set(bookings.map(b=>b.booking.id)).size,1);
  assert.equal(bookings.filter(b=>!b.isDuplicate).length,1);
  const read=await portal.getBookingByClientRequestId('deccan',run);assert.equal(read.events.length,1);
  assert.equal(read.dataWipeAcknowledged,true);
  assert.equal(await portal.getBookingByClientRequestId('paperplus',run),null);
  pass('eight concurrent booking calls produce one booking and one initial event');
  const switches={failNextSubmit:true,omitNextReference:true,changedPolicyLayout:true,hideFeeInfo:true,raiseFee:true,hideReviewFee:true};
  assert.deepEqual(await portal.updateFailureSwitches(switchId,switches),switches);
  assert.deepEqual(await portal.getFailureSwitches(switchId),switches);
  const consumes=await Promise.all([portal.consumeFailureSwitch(switchId,'failNextSubmit'),portal.consumeFailureSwitch(switchId,'failNextSubmit')]);
  assert.equal(consumes.filter(Boolean).length,1);
  pass('all failure switches persist with atomic one-shot consumption on a synthetic row');
  const nonces=await Promise.all(Array.from({length:8},()=>new SupabaseRepository(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY).consumeNonce(nonce,Date.now()+60000)));
  assert.equal(nonces.filter(Boolean).length,1);
  const nonceProcess=spawnSync(process.execPath,['node_modules/vite-node/vite-node.mjs','scripts/check-cloud-persistence.mjs','--nonce',nonce],{encoding:'utf8',env:process.env,timeout:60000});assert.equal(nonceProcess.status,0);
  assert.equal(await portal.consumeNonce(`${nonce}-expired`,Date.now()-1),false);
  pass('cross-instance atomic CAPTCHA nonce consumption and replay/expiry rejection');
  const job=await repo.enqueueJob(run,{requestId:id});jobIds.push(job.id);
  const jobs=await Promise.all([repo.dequeueJob(run),new SupabaseHouseholdRepository().dequeueJob(run)]);
  assert.equal(jobs.filter(Boolean).length,1);await repo.completeJob(job.id,{synthetic:true});
  const failedJob=await repo.enqueueJob(`${run}-failure`,{requestId:id});jobIds.push(failedJob.id);
  assert.equal((await repo.dequeueJob(`${run}-failure`)).id,failedJob.id);await repo.failJob(failedJob.id,'synthetic failure');
  pass('concurrent job dequeue has one winner and durable completion');
  const bad=new SupabaseRepository(process.env.SUPABASE_URL,'invalid-synthetic-key');
  await assert.rejects(()=>bad.getBookingByClientRequestId('deccan',run),/PERSISTENCE_UNAVAILABLE/);
  await assert.rejects(()=>bad.createBooking(booking),/PERSISTENCE_UNAVAILABLE/);
  pass('database authentication errors are explicit on reads and duplicate-create path');
} catch(error) {
  checks.push({name:'integration',pass:false,error:error.message});process.exitCode=1;
  console.error(error.message);
} finally {
  try {await cleanup();pass('exact synthetic cleanup');}
  catch(error){checks.push({name:'cleanup',pass:false,error:error.message});process.exitCode=1;}
  fs.writeFileSync(`${out}/integration-results.json`,JSON.stringify({run,id,checks,exitCode:process.exitCode||0},null,2));
}
