import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const out=path.resolve(process.env.VERIFY_EVIDENCE_DIR || '../../hosted-fixes-20261025/public-browser');fs.mkdirSync(out,{recursive:true});
const apps=[
 ['household','https://recircuit.automconsultancy.in',['/','/arrange','/test-cases']],
 ['deccan','https://deccan.automconsultancy.in',['/','/accepted-items','/pickup-charges','/book-pickup','/book-pickup/confirmation','/track','/track?ref=DEC-00000','/admin','/admin/routing','/admin/routing/preparation','/admin/routing/fleet','/admin/routing/proposals','/admin/routing?date=2026-10-26','/rates']],
 ['paperplus','https://paperplus.automconsultancy.in',['/','/what-we-take','/schedule','/schedule/done','/status','/status?ref=PPK-00000','/admin','/admin/routing','/admin/routing/preparation','/admin/routing/fleet','/admin/routing/proposals','/admin/routing?date=2026-10-26','/rates']],
 ['quickscrap','https://quickscrap.automconsultancy.in',['/','/rates','/pickup','/pickup/thanks','/track-order','/track-order?ref=QSH-00000','/admin','/admin/routing','/admin/routing/preparation','/admin/routing/fleet','/admin/routing/proposals','/admin/routing?date=2026-10-26']]
];
if(process.env.VERIFY_LOCAL==='true') {apps.splice(0,1);for(let i=0;i<apps.length;i++)apps[i][1]='http://127.0.0.1:'+(3460+i);}
const clean=url=>{try{const u=new URL(url);return u.origin+u.pathname;}catch{return url;}};
const browser=await chromium.launch({headless:true});const results=[];
try {for(const [app,origin,paths] of apps) for(const size of [{width:1440,height:900},{width:390,height:844}]){
 const context=await browser.newContext({viewport:size,serviceWorkers:'block'});
 const blocked=[];
 await context.route('**/*',route=>{const req=route.request();if(!['GET','HEAD','OPTIONS'].includes(req.method())||new URL(req.url()).origin!==origin){blocked.push({method:req.method(),url:clean(req.url())});return route.abort();}return route.continue();});
 for(const route of paths){const page=await context.newPage(),consoleErrors=[],pageErrors=[],failed=[],badResponses=[];
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text().slice(0,1200));});page.on('pageerror',e=>pageErrors.push(e.message));page.on('requestfailed',r=>failed.push({url:clean(r.url()),reason:r.failure()?.errorText}));page.on('response',r=>{if(r.status()>=400)badResponses.push({url:clean(r.url()),status:r.status()});});
  const row={app,origin,route,viewport:size};try{
   const response=await page.goto(origin+route,{waitUntil:'networkidle',timeout:30000});await page.locator('body').waitFor();
   row.status=response?.status();row.url=clean(page.url());row.title=await page.title();row.text=await page.locator('body').innerText();
   row.links=await page.locator('a[href]').evaluateAll(els=>els.map(e=>({text:e.textContent?.trim(),href:e.getAttribute('href')})));
   row.dates=await page.locator('input[type=date]').evaluateAll(els=>els.map(e=>e.value));row.itemRows=await page.getByTestId('item-row').count();
   row.pincodes=await page.locator('#pincode option').allTextContents();row.overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
   await page.keyboard.press('Tab');row.keyboardFocus=await page.evaluate(()=>({tag:document.activeElement?.tagName,text:document.activeElement?.textContent?.slice(0,100)}));
   const filename=app+'-'+route.replace(/[^a-z0-9]/gi,'_')+'-'+size.width;
   await page.screenshot({path:path.join(out,filename+'.png'),fullPage:true});
   row.screenshot=filename+'.png';
  }catch(e){row.error=e.message;}
  Object.assign(row,{consoleErrors,pageErrors,failed,badResponses});results.push(row);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({at:new Date().toISOString(),readOnly:true,results,blocked},null,2));await page.close();
 }await context.close();
}console.log(JSON.stringify({out,pages:results.length,errors:results.filter(x=>x.error).length,overflow:results.filter(x=>x.overflow).map(x=>[x.app,x.route,x.viewport.width]),consoleErrors:results.filter(x=>x.consoleErrors.length).map(x=>[x.app,x.route,x.consoleErrors])}));
}finally{await browser.close();}
