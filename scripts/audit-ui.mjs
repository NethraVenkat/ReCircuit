// Local browser inspection only. API fixtures are explicitly synthetic and isolated.
import {chromium} from 'playwright';import AxeBuilder from '@axe-core/playwright';import fs from 'node:fs';import path from 'node:path';import {household,booking,requestId} from './ui-audit-fixtures.mjs';
const phase=process.argv[2]||'after';const out=path.resolve(process.env.UI_AUDIT_OUTPUT||'../evidence',phase);fs.mkdirSync(out,{recursive:true});
const rows=[];const browser=await chromium.launch();const viewports=[{width:1366,height:768},{width:1440,height:900},{width:1920,height:1080},{width:390,height:844},{width:768,height:1024}];let serial=0;
const origins=['http://127.0.0.1:3400','http://127.0.0.1:3401','http://127.0.0.1:3402','http://127.0.0.1:3403'];
const seed=path.resolve(process.env.UI_AUDIT_DATA||'../evidence/local-data/portals');fs.mkdirSync(seed,{recursive:true});
for(const t of ['deccan','paperplus','quickscrap'])fs.writeFileSync(path.join(seed,t+'.json'),JSON.stringify({bookings:[booking(t)],switches:{failNextSubmit:false,omitNextReference:false,changedPolicyLayout:false,hideFeeInfo:false,raiseFee:false}}));
async function inspect(name,url,setup,action){
 if(process.env.UI_AUDIT_FILTER && !new RegExp(process.env.UI_AUDIT_FILTER).test(name))return;
 const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:process.env.UI_AUDIT_ZOOM_ONLY?2:1});const page=await context.newPage();page.setDefaultTimeout(20000);const errors=[];let fixtureState='comparison';let listState='empty';let portalState='RECEIVED';let mode='normal';
 const controls={setState:v=>fixtureState=v,setList:v=>listState=v,setPortal:v=>portalState=v,setMode:v=>mode=v};setup?.(controls);
 await page.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());if(!origins.includes(u.origin)&&u.protocol!=='data:')return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue();
  const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(u.pathname==='/api/runtime')return json({provider:'groq',model:'openai/gpt-oss-20b',selection:'explicit',available:true,fixture:true});
  if(u.pathname==='/api/requests'&&mode==='loading')return new Promise(()=>{});if(u.pathname==='/api/requests')return listState==='error'?json({error:'LOCAL FIXTURE: saved requests unavailable'},503):json({requests:listState==='empty'?[]:[household('verified'),household('declined')]});
  if(u.pathname.startsWith('/api/requests/')&&mode==='loading')return new Promise(()=>{});if(u.pathname.startsWith('/api/requests/'))return mode==='unavailable'?json({error:'Request not found'},404):json(household(fixtureState));
  if(u.pathname==='/api/evidence-access')return json({url:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100"><text x="10" y="50">LOCAL FIXTURE — no real challenge</text></svg>')});
  if(u.pathname==='/api/plan'){if(mode==='planning')return new Promise(()=>{});return json({error:'LOCAL FIXTURE: planning source unavailable'},503);}
  if(u.pathname==='/api/approve'){fixtureState=r.postDataJSON()?.decision==='rejected'?'declined':'approved';return json({success:true});}
  if(u.pathname==='/api/book'){fixtureState='submitting';await new Promise(r=>setTimeout(r,1200));return json({error:'LOCAL FIXTURE: booking outcome uncertain'},503);}
  if(u.pathname==='/api/verify'){fixtureState='verified';return json({success:true});}
  if(u.pathname==='/api/fee')return mode==='fee-error'?json({error:'LOCAL FIXTURE: fee unavailable'},503):json({fee:u.port==='3401'?180:u.port==='3402'?0:50});
  if(u.pathname==='/api/captcha')return r.resourceType()==='image'?route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100"><rect width="300" height="100" fill="#f1f5f9"/><text x="12" y="45" font-size="14">LOCAL UI FIXTURE</text><text x="12" y="70" font-size="13">No real challenge</text></svg>'}):json({sessionId:'local-ui-fixture-no-real-captcha'});
  if(u.pathname==='/api/bookings'){if(mode==='tracking-error')return json({error:'LOCAL FIXTURE: service temporarily unavailable'},503);if(mode==='not-found')return json({error:'No booking found'},404);if(r.method()==='POST')return json({error:'LOCAL FIXTURE: booking rejected',errors:[{field:'phone',message:'Enter a 10-digit mobile number.'}]},400);return json({booking:booking(['deccan','paperplus','quickscrap'][Number(u.port)-3401],portalState)});}
  if(u.pathname==='/api/admin'){if(mode==='operator-loading')return new Promise(()=>{});if(mode==='operator-error')return json({error:'LOCAL FIXTURE: service failed'},500);if(mode==='unauthorized')return json({error:'Unauthorized'},401);if(mode==='admin-disabled')return json({error:'Admin disabled'},503);return json({recyclerId:['deccan','paperplus','quickscrap'][Number(u.port)-3401],bookings:mode==='admin-empty'?[]:[booking(['deccan','paperplus','quickscrap'][Number(u.port)-3401])],switches:{failNextSubmit:false,omitNextReference:false,changedPolicyLayout:false,hideFeeInfo:false,raiseFee:false}});}
  if(u.pathname==='/api/test-cases/run')return json({passed:true,title:'LOCAL rule fixture',input:'LOCAL FIXTURE',expected:'Received is not collected',actual:'Received; no collection evidence',explanation:'UI fixture only; rule tests run separately.'});
  if(['GET','HEAD','OPTIONS'].includes(r.method()))return route.continue();return route.abort();
 });
 page.on('pageerror',e=>errors.push(e.message));
 const row={name,url,fixture:true,screens:[],errors,states:[],violations:[]};rows.push(row);
 try{const response=await page.goto(url,{timeout:90000});row.http=response?.status();await page.waitForTimeout(650);if(action)await action(page,controls);
  for(const {width,height} of (process.env.UI_AUDIT_ZOOM_ONLY ? [] : viewports)){await page.setViewportSize({width,height});await page.screenshot({path:path.join(out,`${String(serial).padStart(3,'0')}-${name}-${width}x${height}.png`),fullPage:true});const state=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,text:document.body.innerText,active:document.activeElement?.tagName}));row.screens.push({width,height,overflow:state.scrollWidth>state.width+1});if(width===1440)row.text=state.text;
   if(width===390||width===1366){const scan=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();row.violations.push(...scan.violations.map(v=>({width,id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));}
  }
  row.zoom=[];
  for(const viewport of viewports.filter(v=>v.width>=1366)){
   if(process.env.UI_AUDIT_ZOOM_ONLY){
    const effectiveWidth=Math.floor(viewport.width/2);
    await page.setViewportSize({width:effectiveWidth,height:Math.floor(viewport.height/2)});
    const measure=async()=>page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,scale:devicePixelRatio}));
    const before=await measure();if(before.width!==effectiveWidth||before.scale!==2)throw new Error('200% viewport setup failed: '+JSON.stringify(before));
    await page.screenshot({path:path.join(out,`${String(serial).padStart(3,'0')}-${name}-${viewport.width}-browser200-reflow.png`),fullPage:true});
    const after=await measure();if(after.width!==effectiveWidth)throw new Error('Screenshot changed the reflow viewport: '+JSON.stringify(after));
    row.zoom.push({width:viewport.width,cssWidth:after.width,deviceScaleFactor:after.scale,method:'200% effective CSS viewport with device scale 2',overflow:after.scroll>after.width+1});
   }else{
    await page.setViewportSize(viewport);await page.evaluate(()=>document.documentElement.style.zoom='2');await page.screenshot({path:path.join(out,`${String(serial).padStart(3,'0')}-${name}-${viewport.width}-zoom200.png`),fullPage:true});row.zoom.push({width:viewport.width,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)});await page.evaluate(()=>document.documentElement.style.zoom='');
   }
  }row.zoomOverflow=row.zoom.some(z=>z.overflow);
  await page.emulateMedia({reducedMotion:'reduce'});row.reducedMotion=await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);row.inspected=true;
 }catch(e){row.error=e.message;await page.screenshot({path:path.join(out,`${String(serial).padStart(3,'0')}-${name}-failed.png`),fullPage:true}).catch(()=>{});}
 finally{serial++;fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(rows,null,2));await context.close();console.log(JSON.stringify({name,inspected:row.inspected,error:row.error,overflow:row.screens.filter(s=>s.overflow).map(s=>s.width),axe:row.violations.map(v=>v.id)}));}
}
try{
 const h=origins[0];await inspect('household-empty',h);await inspect('household-loading',h,c=>c.setMode('loading'));await inspect('request-loading',h+'/r/'+requestId,c=>c.setMode('loading'));await inspect('household-populated',h,c=>c.setList('populated'));await inspect('household-list-error',h,c=>c.setList('error'));
 await inspect('intake',h+'/arrange?example=old-laptop');await inspect('intake-examples',h+'/arrange',null,async p=>p.getByRole('button',{name:'Try an example',exact:true}).click());
 await inspect('intake-invalid',h+'/arrange',null,async p=>p.getByTestId('generate-plan-button').click());
 await inspect('planning-progress',h+'/arrange?example=old-laptop',c=>c.setMode('planning'),async p=>{for(const [id,value]of Object.entries({fullName:'LOCAL UI FIXTURE',phone:'9000000000',addressLine:'Fictional fixture only'}))await p.locator('#'+id).fill(value);await p.getByTestId('generate-plan-button').click();await p.waitForTimeout(500);});
 await inspect('planning-error',h+'/arrange?example=old-laptop',null,async p=>{for(const [id,value]of Object.entries({fullName:'LOCAL UI FIXTURE',phone:'9000000000',addressLine:'Fictional fixture only'}))await p.locator('#'+id).fill(value);await p.getByTestId('generate-plan-button').click();await p.locator('#form-error').waitFor();});
 for(const state of ['comparison','declined','approved','requested','verified','failed','submitting','handoff','handoff-expired','no-plan','stale','collected'])await inspect('request-'+state,h+'/r/'+requestId,c=>c.setState(state));
 await inspect('request-review',h+'/r/'+requestId,null,async p=>p.getByRole('button',{name:'Review recommended plan',exact:true}).click());
 await inspect('request-approval',h+'/r/'+requestId,null,async p=>{await p.getByRole('button',{name:'Review recommended plan',exact:true}).click();await p.getByRole('checkbox',{name:/I have reviewed/}).check();await p.getByRole('checkbox',{name:/I confirm any required/}).check();});
 await inspect('evidence',h+'/r/'+requestId,null,async p=>p.getByRole('button',{name:'Sources & evidence',exact:true}).click());
 await inspect('request-unavailable',h+'/r/'+requestId,c=>c.setMode('unavailable'));await inspect('intake-edit-unavailable',h+'/arrange?edit='+requestId,c=>c.setMode('unavailable'));
 await inspect('reviewer-tools',h+'/test-cases',null,async p=>p.getByRole('button',{name:'Run check',exact:true}).first().click());
 const paths={deccan:['/','/accepted-items','/pickup-charges','/book-pickup','/book-pickup/confirmation','/track'],paperplus:['/','/what-we-take','/schedule','/schedule/done','/status'],quickscrap:['/','/rates','/pickup','/pickup/thanks','/track-order']};
 for(const [n,tenant]of ['deccan','paperplus','quickscrap'].entries()){
  const base=origins[n+1],routes=paths[tenant],track=routes.at(-1),ref=booking(tenant).bookingReference,confirm=routes.at(-2);
  for(const route of routes)await inspect(tenant+'-'+(route==='/'?'home':route.slice(1).replaceAll('/','-')),base+route);
  const form=tenant==='deccan'?'/book-pickup':tenant==='paperplus'?'/schedule':'/pickup';
  await inspect(tenant+'-fee-error',base+form,c=>c.setMode('fee-error'));
  await inspect(tenant+'-form-invalid',base+form,null,async p=>p.getByTestId('confirm-booking').click());
  await inspect(tenant+'-operator-error',base+'/admin',c=>c.setMode('operator-error'));
  await inspect(tenant+'-confirmation-existing',base+confirm+'?ref='+ref+'&dup=true');await inspect(tenant+'-confirmation-missing-record',base+confirm+'?ref=LOCAL-NOT-FOUND');
  for(const state of ['RECEIVED','SCHEDULED','PICKED_UP'])await inspect(tenant+'-tracking-'+state,base+track+'?ref='+ref,c=>c.setPortal(state));
  for(const mode of ['not-found','tracking-error'])await inspect(tenant+'-'+mode,base+track+'?ref='+ref,c=>c.setMode(mode));
  await inspect(tenant+'-operator-switches',base+'/admin',null,async p=>{await p.getByRole('heading',{name:tenant==='deccan'?'Deccan E-Cycle':tenant==='paperplus'?'PaperPlus Kabadi':'QuickScrap Hyd',exact:true}).waitFor();await p.getByText('Test failure switches',{exact:true}).click();});for(const mode of ['normal','admin-empty','unauthorized','admin-disabled','operator-loading'])await inspect(tenant+'-operator-'+mode,base+'/admin',c=>c.setMode(mode));
 }
}finally{await browser.close();fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({phase,inspected:rows.filter(r=>r.inspected).length,total:rows.length,blocked:rows.filter(r=>!r.inspected).map(r=>({name:r.name,error:r.error})),overflow:rows.filter(r=>r.screens.some(s=>s.overflow)||r.zoomOverflow).map(r=>r.name),axeViolations:rows.reduce((s,r)=>s+r.violations.length,0)},null,2));}

if(rows.some(r=>!r.inspected||r.errors.length||r.screens.some(s=>s.overflow)||r.zoomOverflow||r.violations.length))process.exitCode=1;
