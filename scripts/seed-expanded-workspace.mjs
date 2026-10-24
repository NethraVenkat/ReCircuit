// New destinations only. Existing datasets are never upgraded in place.
import fs from 'node:fs/promises';import path from 'node:path';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {household,requestId} from './ui-audit-fixtures.mjs';
import {FileRepository} from '../packages/db/dist/file-store.js';
import {sampleNames,sampleScenarios,sampleItem} from '../apps/portals/src/lib/geospatial/rich-sample.ts';
import {RECYCLER_CONFIGS} from '../apps/portals/src/lib/config.ts';
import {pickupFee} from '../apps/portals/src/lib/fees.ts';
const root=process.env.RECIRCUIT_DEMO_ROOT,basePort=Number(process.env.RECIRCUIT_WORKSPACE_BASE_PORT||3260);
if(!root||!path.isAbsolute(root)||process.env.NODE_ENV==='production')throw Error('Absolute isolated local RECIRCUIT_DEMO_ROOT required');
const result=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run','apps/portals/src/lib/geospatial/rich-seed.test.ts'],{env:{...process.env,RECIRCUIT_RICH_SEED_ROOT:root},stdio:'inherit',windowsHide:true});
if(result.status!==0)process.exit(result.status||1);
const manifest=JSON.parse(await fs.readFile(path.join(root,'demo-manifest.json'),'utf8')),repo=new FileRepository(path.join(root,'household-app'));
const uuid=key=>{const s=createHash('sha256').update('rich-v2-'+key).digest('hex');return `${s.slice(0,8)}-${s.slice(8,12)}-4${s.slice(13,16)}-8${s.slice(17,20)}-${s.slice(20,32)}`;};
for(const tenant of manifest.tenants){const bookings=JSON.parse(await fs.readFile(path.join(root,'portal',tenant+'.json'),'utf8')).bookings;
 for(let i=0;i<sampleNames.length;i++){
  const id=uuid(tenant+'-'+i);if(await repo.getRequest(id))continue;
  const b=bookings.find(b=>b.clientRequestId===`rich-v2-${tenant}-${i}`),item=sampleItem(tenant,i),scenario=sampleScenarios[i];
  const record=JSON.parse(JSON.stringify(household(i===0?'comparison':i===1?'declined':i===7?'collected':i<=3?'requested':'verified')).replaceAll(requestId,id));
  const fee=b?.chargedFeeInr??pickupFee(tenant,item.weightKg),stamp=manifest.createdAt,leg=record.plan.legs[0],category=['paper','newspaper','cardboard','books','magazines'].includes(item.category)?'PAPER':item.category==='metal'?'METAL':item.category==='plastic'?'PLASTIC':item.category==='battery'?'BATTERIES':'ELECTRONICS';
  const coreItem={...record.items[0],id:uuid(id+'-item'),requestId:id,category,description:item.name,quantity:item.quantity,estimatedWeightKg:item.weightKg,createdAt:stamp,hazardClass:category==='BATTERIES'?'BATTERY':'NON_HAZARDOUS'};
  record.request={...record.request,id,userId:createHash('sha256').update('recircuit-fictional-household-demo-v1').digest('hex'),state:i===0?'AWAITING_APPROVAL':i===1?'REJECTED':'APPROVED',items:[coreItem],description:`${sampleNames[i]} · ${item.name}`,createdAt:stamp,updatedAt:stamp};
  record.items=[coreItem];record.updatedAt=stamp;
  record.plan={...record.plan,id:uuid(id+'-plan'),requestId:id,legs:[{...leg,id:uuid(id+'-leg'),planId:uuid(id+'-plan'),recyclerId:tenant,recyclerName:RECYCLER_CONFIGS[tenant].name,itemIds:[coreItem.id],items:[{...coreItem,name:item.name}],estimatedFee:fee,estimatedPayout:0,state:i===1?'REJECTED':i===0?'APPROVED':i===7?'WEIGHED':i<=3?'REQUEST_SUBMITTED':b?.status==='CANCELLED'?'FAILED':b?.status==='SCHEDULED'?'PICKUP_SCHEDULED':'REQUEST_CONFIRMED',...(b?{bookingReference:b.bookingReference}:{}),createdAt:stamp,updatedAt:stamp}],totalEstimatedFee:fee,totalEstimatedPayout:0,createdAt:stamp};
  if(!b)delete record.plan.legs[0].bookingReference;
  record.household.customer={fullName:sampleNames[i],phone:'0000000000',addressLine:b?.addressLine??'KBR Park public entrance',locality:'Hyderabad public collection point',pincode:'500081'};
  record.household.intakeResult={requestId:id,items:[{id:coreItem.id,rawText:item.name,category:item.category,quantity:item.quantity,declaredWeightKg:item.weightKg,weightSource:'user_declared',hazardClass:category==='BATTERIES'?'battery_li_ion':'none',confidence:1}],location:{locality:'Hyderabad public collection point',pincode:'500081',city:'Hyderabad'},clarifications:[]};
  const config=RECYCLER_CONFIGS[tenant];
  record.household.policies=[{name:config.name,recyclerId:tenant,url:`http://127.0.0.1:${basePort+{deccan:0,paperplus:1,quickscrap:2}[tenant]}${config.routes.items}`,quotes:[config.rates.acceptedSummary,config.rates.payoutDescription,config.rates.rulesSummary],status:'SUCCESS',retrievedAt:stamp,extractionPath:'dom-fallback',provenance:'fixture',freshness:'fixture',llmAttempted:false,explanation:'Stored application policy configuration; no live extraction or provider call'}];
  record.household.matrix={items:record.household.intakeResult.items,cells:[{recyclerId:tenant,recyclerName:config.name,itemId:coreItem.id,itemDescription:item.name,status:'ACCEPTED',reason:'Accepted by the configured material rules',quote:config.rates.acceptedSummary}]};
  record.household.approvalCard={warnings:[],unroutedItems:[]};record.household.bookingStatus=b?.status;record.household.choices=[];record.household.verifications={};
  if(b&&i>=4){const evidence=JSON.parse(await fs.readFile(path.join(root,'household',`${tenant}-${i}.json`),'utf8'));record.household.verifications[record.plan.legs[0].id]={...evidence.household.verifications.leg};}
  record.household.provenance={kind:'sample',isSimulated:true,scenario,datasetVersion:'rich-v2',explanation:'Invented household/business and operational scenario at a public test location; not a real booking, verification or collection'};
  await repo.saveRequest(record);
 }
}
console.log(`Expanded workspace seeded without overwriting existing records. Open http://127.0.0.1:${basePort+3}/api/demo-session`);
