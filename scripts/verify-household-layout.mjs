import "./redesign-reporting.mjs";
import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser=await chromium.launch();
try{let ready=false;for(let n=0;n<60;n++){try{if((await fetch("http://localhost:3200")).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}assert(ready);const page=await browser.newPage({viewport:{width:720,height:500}});await page.goto("http://localhost:3200/arrange");await page.locator("#fullName").waitFor();await page.evaluate(()=>document.documentElement.style.zoom="2");await page.screenshot({path:"docs/redesign/screenshots/intake-200-percent.png",fullPage:true});const dimensions=await page.evaluate(()=>({content:document.documentElement.scrollWidth,viewport:innerWidth}));assert(dimensions.content<=dimensions.viewport,JSON.stringify(dimensions));console.log("PASS 200 percent zoom layout preflight");}finally{await browser.close();}
