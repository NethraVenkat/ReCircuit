import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const local=process.env.VERIFY_LOCAL==='true',out=path.resolve(process.env.VERIFY_EVIDENCE_DIR);fs.mkdirSync(out,{recursive:true});
const extension=path.join(out,'zoom-extension');fs.mkdirSync(extension,{recursive:true});
fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify({manifest_version:3,name:'ReCircuit verification zoom',version:'1.0',permissions:['tabs'],background:{service_worker:'background.js'}}));fs.writeFileSync(path.join(extension,'background.js'),'chrome.runtime.onInstalled.addListener(()=>{});');
const context=await chromium.launchPersistentContext(path.join(out,'browser-profile'),{channel:'chromium',headless:true,viewport:{width:1440,height:900},args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:15000});
const origins=local?['http://127.0.0.1:3460','http://127.0.0.1:3461','http://127.0.0.1:3462']:['https://recircuit.automconsultancy.in','https://deccan.automconsultancy.in','https://paperplus.automconsultancy.in','https://quickscrap.automconsultancy.in'];
await context.route('**/*',route=>['GET','HEAD','OPTIONS'].includes(route.request().method())&&origins.includes(new URL(route.request().url()).origin)?route.continue():route.abort());
const results=[];async function check(name,fn){try{const detail=await fn();results.push({name,status:'PASS',...detail});}catch(e){results.push({name,status:'FAIL',error:e.message});}fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({local,at:new Date().toISOString(),results},null,2));}
try {for(const origin of origins){
 const household=origin.includes('recircuit.')&&!local,idx=local?origins.indexOf(origin):origins.indexOf(origin)-1,app=household?'household':['deccan','paperplus','quickscrap'][idx];
 const routes=household?['/','/arrange']:['/admin/routing','/admin/routing?date=2026-10-26',['/book-pickup','/schedule','/pickup'][idx],['/pickup-charges','/what-we-take','/rates'][idx]];
 for(const route of routes)await check(app+' '+route+' actual 200% zoom',async()=>{
  const page=await context.newPage();const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
  try{await page.goto(origin+route,{waitUntil:'networkidle',timeout:60000});
   await worker.evaluate(async url=>{const tab=(await chrome.tabs.query({})).find(t=>t.url===url);await chrome.tabs.setZoom(tab.id,1);},page.url());
   await page.waitForFunction(()=>devicePixelRatio===1);
   const before=await page.evaluate(()=>({width:innerWidth,dpr:devicePixelRatio}));
   const zoom=await worker.evaluate(async url=>{const tabs=await chrome.tabs.query({});const tab=tabs.find(t=>t.url===url);if(!tab)throw Error('Exact tab unavailable');await chrome.tabs.setZoom(tab.id,2);return chrome.tabs.getZoom(tab.id);},page.url());assert.equal(zoom,2);
   await page.waitForFunction(dpr=>devicePixelRatio>dpr,before.dpr);const after=await page.evaluate(()=>({width:innerWidth,dpr:devicePixelRatio,overflow:document.documentElement.scrollWidth>innerWidth+1}));assert.ok(Math.abs(after.width-before.width/2)<=1);assert.equal(after.overflow,false);
   // Native viewport capture avoids Playwright fullPage clipping at browser zoom.
   const cdp=await context.newCDPSession(page);const capture=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
   fs.writeFileSync(path.join(out,app+'-'+route.replace(/\W/g,'_')+'-200percent.png'),Buffer.from(capture.data,'base64'));await cdp.detach();assert.deepEqual(pageErrors,[]);
   return {before,after,chromeZoomFactor:zoom};
  }finally{await page.close();}
 });
 if(!local||household)continue;
 await check(app+' actual items / recalculated fees / removal / unsupported pincode',async()=>{
  const page=await context.newPage();try{await page.goto(origin+['/book-pickup','/schedule','/pickup'][idx],{waitUntil:'networkidle',timeout:60000});
   assert.equal(await page.getByTestId('item-row').count(),0);assert.equal(await page.getByTestId('confirm-booking').isDisabled(),true);assert.equal(await page.getByTestId('input-item-weight').inputValue(),'');
   await page.getByTestId('input-item-name').fill(idx===0?'Laptop':idx===1?'Newspaper':'Books');await page.getByTestId('input-item-weight').fill(idx===0?'2.2':'8');await page.getByTestId('add-item').click();
   await page.getByTestId('portal-computed-fee').waitFor();let fee=await page.getByTestId('portal-computed-fee').innerText();assert.ok(fee.includes(String([180,0,50][idx])));
   if(idx===0){await page.getByTestId('input-item-name').fill('Charger');await page.getByTestId('input-item-weight').fill('3');await page.getByTestId('add-item').click();await page.waitForFunction(()=>document.querySelector('[data-testid=portal-computed-fee]')?.textContent?.includes('₹0'));}
   await page.getByTestId('input-pincode').fill('500001');await page.getByRole('status').filter({hasText:'outside our current service area'}).waitFor();
   while(await page.getByTestId('remove-item').count())await page.getByTestId('remove-item').first().click();await page.getByTestId('empty-items').waitFor();assert.equal(await page.getByTestId('confirm-booking').isDisabled(),true);assert.equal(await page.getByTestId('portal-computed-fee').count(),0);
   await page.screenshot({path:path.join(out,app+'-empty-and-unsupported.png'),fullPage:true});return {firstFee:fee,emptyAfterRemoval:true,bookingSubmitted:false};
  }finally{await page.close();}
 });
 await check(app+' IST midnight and explicit navigation/reload',async()=>{
  const clockBrowser=await chromium.launch({headless:true});const clockContext=await clockBrowser.newContext();
  await clockContext.route('**/*',route=>route.request().method()==='GET'&&new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await clockContext.newPage();try{
   const hydrationErrors=[];page.on('pageerror',error=>hydrationErrors.push(error.message));
   await page.clock.install({time:new Date('2026-10-25T18:29:00Z')});await page.clock.pauseAt(new Date('2026-10-25T18:29:59Z'));
   await page.goto(origin+'/admin/routing',{waitUntil:'networkidle',timeout:60000});assert.equal(await page.getByLabel('Service date',{exact:true}).inputValue(),'2026-10-25');
   await page.clock.runFor(2000);assert.equal(await page.getByLabel('Service date',{exact:true}).inputValue(),'2026-10-26');
   await page.clock.resume();
   await page.getByLabel('Service date',{exact:true}).fill('2026-10-24');await page.clock.runFor(50);
   await page.waitForURL(url=>url.searchParams.get('date')==='2026-10-24');
   assert.ok((await page.getByRole('link',{name:'Preparation',exact:false}).getAttribute('href')).includes('date=2026-10-24'));
   await page.getByRole('link',{name:'Preparation',exact:false}).click();await page.clock.runFor(50);
   await page.waitForURL(url=>url.pathname==='/admin/routing/preparation'&&url.searchParams.get('date')==='2026-10-24');
   await page.reload({waitUntil:'networkidle'});assert.equal(await page.getByLabel('Service date',{exact:true}).inputValue(),'2026-10-24');
   await page.clock.setSystemTime(new Date('2026-10-26T18:29:59Z'));await page.clock.runFor(2000);assert.equal(await page.getByLabel('Service date',{exact:true}).inputValue(),'2026-10-24');
   await page.goto(origin+['/book-pickup','/schedule','/pickup'][idx],{waitUntil:'networkidle'});assert.equal(await page.getByTestId('item-row').count(),0);assert.deepEqual(hydrationErrors,[]);
   return {defaultAdvancedAtIstMidnight:true,explicitPreserved:true,hydrationErrors};
  }finally{fs.writeFileSync(path.join(out,app+'-clock-final-state.json'),JSON.stringify({url:page.url(),date:await page.locator('input[type=date]').first().inputValue().catch(()=>null)},null,2));await clockBrowser.close();}
 });
}console.log(JSON.stringify({out,results}));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;}finally{await context.close();}
