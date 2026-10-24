import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const out = path.resolve('.data/ui-cleanup-20261024/browser-' + Date.now());
await fs.mkdir(out, {recursive:true});
const extension = path.join(out, 'extension');
await fs.mkdir(extension);
await fs.writeFile(path.join(extension, 'manifest.json'), JSON.stringify({manifest_version:3,name:'Local UI zoom verification',version:'1.0',permissions:['tabs'],background:{service_worker:'background.js'}}));
await fs.writeFile(path.join(extension, 'background.js'), 'chrome.runtime.onInstalled.addListener(()=>{});');
const context = await chromium.launchPersistentContext(path.join(out,'profile'), {channel:'chromium',headless:true,viewport:{width:1366,height:768},args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
const page = await context.newPage(), results = [], errors = [];
page.on('pageerror', e => errors.push(e.message));
await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
const origin = n => 'http://127.0.0.1:' + (3460+n);
const token = 'ui-cleanup-local-review';
async function zoom(value) {
  return worker.evaluate(async factor => { const tabs = await chrome.tabs.query({}); const tab = tabs.find(t => t.url?.startsWith('http://127.0.0.1:')); if (!tab && factor === 1) return 1; if (!tab) throw Error('No local page available for native zoom'); await chrome.tabs.setZoom(tab.id,factor); return chrome.tabs.getZoom(tab.id); }, value);
}
async function settled() {
  await page.waitForFunction(() => !document.querySelector('.ui-recycling-loader'), null, {timeout:90000});
  await page.locator('main').first().waitFor();
}
async function capture(name, url, prepare) {
  if(process.env.UI_FILTER && !process.env.UI_FILTER.split(",").some(filter=>name.includes(filter))) return;
  const row = {name,url,screens:[]}; results.push(row);
  try {
    await zoom(1); await page.setViewportSize({width:1366,height:768});
    if(name.endsWith('sign-in')) { await context.clearCookies({name:'admin_token'}); await page.evaluate(()=>sessionStorage.removeItem('rc_admin_token')); }
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:150000}); await page.waitForLoadState('load',{timeout:90000});
    if(prepare) await prepare(); await page.waitForLoadState("load", {timeout:90000}); await settled();
    if(name.endsWith("tracking-result")) await page.getByTestId("tracking-result").waitFor({timeout:90000});
    const text = await page.locator('body').innerText();
    row.removedUI = ['About this workspace','Test failure switches','Danger zone: reset','Reset Demo State','Synthetic Demo Data'].filter(x => text.includes(x));
    for(const [width,height] of [[1366,768],[1440,900],[390,844],[768,1024]]) {
      await page.setViewportSize({width,height});
      await page.screenshot({path:path.join(out,name+'-'+width+'.png'),fullPage:true,timeout:90000});
      row.screens.push(await page.evaluate(() => ({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1})));
    }
    row.accessibility=(await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,failure:n.failureSummary}))}));
    await page.keyboard.press('Tab');
    row.keyboard=await page.evaluate(()=>({tag:document.activeElement?.tagName,focusVisible:document.activeElement?.matches(':focus-visible')}));
    row.blankButtons=await page.locator('button').evaluateAll(nodes=>nodes.filter(n=>n.checkVisibility({visibilityProperty:true,opacityProperty:true}) && !n.textContent.trim() && !n.getAttribute('aria-label')).map(n=>n.outerHTML));
    await page.setViewportSize({width:1366,height:768}); row.zoom=await zoom(2);
    await page.waitForFunction(()=>innerWidth===683);
    row.zoomLayout=await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1}));
    await page.screenshot({path:path.join(out,name+'-actual-200.png'),fullPage:true,timeout:90000}); await zoom(1);
  } catch(e) {row.error=e.message;}
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify({out,results,errors},null,2));
  console.log(name,row.error||'captured',row.accessibility?.length,'axe findings');
}
async function unlock() {
  await page.getByLabel('Operator token').fill(token);
  await page.getByRole('button',{name:'Unlock routing workspace',exact:true}).click();
  await page.getByText('Connected to',{exact:false}).waitFor({timeout:90000});
}
try {
  await page.goto(origin(3)+'/api/demo-session',{timeout:150000,waitUntil:'domcontentloaded'});
  const household=await (await context.request.get(origin(3)+'/api/requests',{timeout:150000})).json();
  for(const route of ['/', '/arrange', '/test-cases']) await capture('household-'+(route.slice(1)||'pickups'),origin(3)+route);
  for(const state of ['AWAITING_APPROVAL','REJECTED']) { const r=household.requests.find(r=>r.request.state===state); if(r) await capture('household-'+state.toLowerCase(),origin(3)+'/r/'+r.request.id); }
  const editable=household.requests.find(r=>r.request.state==='AWAITING_APPROVAL'); if(editable) await capture('household-edit',origin(3)+'/arrange?edit='+editable.request.id);
  const booked=household.requests.find(r=>r.plan?.legs[0]?.bookingReference); if(booked) await capture('household-booked',origin(3)+'/r/'+booked.request.id);
  for(const [offset,tenant,routes] of [[0,'deccan',['/','/accepted-items','/pickup-charges','/book-pickup','/track','/book-pickup/confirmation']],[1,'paperplus',['/','/what-we-take','/schedule','/status','/schedule/done']],[2,'quickscrap',['/','/rates','/pickup','/track-order','/pickup/thanks']]]) {
    const data=await (await context.request.get(origin(offset)+'/api/admin',{headers:{'x-admin-token':token},timeout:150000})).json();
    for(const route of routes) await capture(tenant+'-'+(route.slice(1).replaceAll('/','-')||'overview'),origin(offset)+route);
    const track=routes.find(r=>['/track','/status','/track-order'].includes(r));
    if(data.bookings?.length) {
      await capture(tenant+'-tracking-result',origin(offset)+track+'?ref='+encodeURIComponent(data.bookings[0].bookingReference));
      await capture(tenant+'-confirmation-result',origin(offset)+routes.at(-1)+'?ref='+encodeURIComponent(data.bookings[0].bookingReference));
    }
    await capture(tenant+'-sign-in',origin(offset)+'/admin',async()=>{await context.clearCookies({name:'admin_token'});await page.evaluate(()=>sessionStorage.removeItem('rc_admin_token'));await page.reload();await page.getByTestId('admin-unauthorized').waitFor({timeout:90000});});
    await capture(tenant+'-operator',origin(offset)+'/admin',async()=>{await page.evaluate(value=>sessionStorage.setItem('rc_admin_token',value),token);await page.reload();await page.getByLabel('Search bookings').waitFor({timeout:90000});});
    for(const route of ['','/preparation','/fleet','/proposals']) await capture(tenant+'-routing'+(route.replace('/','-')||'-overview'),origin(offset)+'/admin/routing'+route+'?date=2026-10-24',unlock);
    if(data.bookings?.length) {
      const proposals=await (await context.request.get(origin(offset)+'/api/routing?view=proposals',{headers:{'x-admin-token':token},timeout:150000})).json();
      if(proposals.proposals?.length) await capture(tenant+'-proposal-details',origin(offset)+'/admin/routing/proposals/'+proposals.proposals[0].id+'?date=2026-10-24',unlock);
    }
  }
} finally {
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify({out,results,errors},null,2));
  await context.close();
}
if(errors.length || results.some(row => row.error || row.removedUI?.length || row.accessibility?.length || row.blankButtons?.length || row.screens.some(screen => screen.overflow) || row.zoom !== 2 || row.zoomLayout?.overflow)) process.exitCode = 1;
