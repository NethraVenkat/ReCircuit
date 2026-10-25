import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
const out=path.resolve(process.env.VERIFY_EVIDENCE_DIR);fs.mkdirSync(out,{recursive:true});
const targets=[['household','https://recircuit-git-presentation-rich-w-5105be-nethravenkats-projects.vercel.app'],['deccan','https://recircuit-deccan-git-presentation-a00923-nethravenkats-projects.vercel.app'],['paperplus','https://recircuit-paperplus-git-presentat-d628cc-nethravenkats-projects.vercel.app'],['quickscrap','https://recircuit-quickscrap-git-presenta-ef240c-nethravenkats-projects.vercel.app']];
const browser=await chromium.launch({headless:true}),results=[];
try{for(const [app,origin]of targets){const context=await browser.newContext();await context.route('**/*',route=>['GET','HEAD','OPTIONS'].includes(route.request().method())&&[origin,'https://vercel.com','https://assets.vercel.com'].includes(new URL(route.request().url()).origin)?route.continue():route.abort());const page=await context.newPage();
try{await page.goto(origin,{waitUntil:'domcontentloaded',timeout:30000});const u=new URL(page.url());results.push({app,origin,finalOrigin:u.origin,finalPath:u.pathname,title:await page.title(),status:u.origin===origin?'REQUIRES_PAGE_VERIFICATION':'BLOCKED',reason:u.origin===origin?'Deployment reachable':'Redirected to Vercel authentication; no credentials used'});await page.screenshot({path:path.join(out,app+'-boundary.png')});}catch(e){results.push({app,origin,status:'BLOCKED',error:e.message});}await context.close();}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({at:new Date().toISOString(),results},null,2));console.log(JSON.stringify(results));}finally{await browser.close();}
