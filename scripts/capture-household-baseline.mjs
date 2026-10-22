// Render the original committed UI in a private copy, without copying any API handlers.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
const root=process.cwd();const dir=path.join(root,".data","household-baseline-source");
const ref="cbf09d47c71d6401cc09c105dde1ece390f27285";
for(const file of ["package.json","tsconfig.json","next-env.d.ts","next.config.mjs","postcss.config.js","tailwind.config.ts","src/app/page.tsx","src/app/layout.tsx","src/app/globals.css"]){const dest=path.join(dir,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,execFileSync("git",["show",`${ref}:apps/web/${file}`]));}
const log=fs.openSync(path.join(dir,"runtime.log"),"a");const child=spawn(process.execPath,[path.join(root,"node_modules/next/dist/bin/next"),"dev","-p","3201"],{cwd:dir,env:{...process.env,BROWSER_MODE:"local",LLM_PROVIDER:"fake"},stdio:["ignore",log,log],windowsHide:true});
let browser;
try{let ready=false;for(let i=0;i<90;i++){try{if((await fetch("http://localhost:3201")).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}if(!ready)throw new Error("Baseline source renderer not ready");browser=await chromium.launch();const page=await browser.newPage();await page.goto("http://localhost:3201");await page.getByRole("heading",{level:1}).waitFor();for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.screenshot({path:path.join(root,"docs/redesign/screenshots",`baseline-${ref.slice(0,7)}-${width}.png`),fullPage:true});}console.log(`Captured original source ${ref}; no intake or booking actions invoked.`);}finally{if(browser)await browser.close();child.kill();}
