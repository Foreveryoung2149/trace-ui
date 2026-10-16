/** Real, fictional-data product captures. No logged-in browser profile or mock UI. */
import puppeteer from 'puppeteer';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const target=new URL(process.env.TRACE_UI_CAPTURE_URL||'https://traceapi.dev/timeline-builder');
const local=['localhost','127.0.0.1','[::1]'].includes(target.hostname);
assert.ok(['http:','https:'].includes(target.protocol)&&(target.origin==='https://traceapi.dev'||local)&&target.pathname==='/timeline-builder'&&!target.username&&!target.password&&!target.search&&!target.hash,'Capture only the public builder or its local equivalent');
const output=fileURLToPath(new URL('../assets/',import.meta.url));
await mkdir(output,{recursive:true});
const browser=await puppeteer.launch({headless:true,...(process.env.PUPPETEER_EXECUTABLE_PATH?{executablePath:process.env.PUPPETEER_EXECUTABLE_PATH}:{}),args:['--disable-background-networking','--disable-component-update','--no-first-run']});
const captures=[];
try {
  const page=await browser.newPage();
  await page.setViewport({width:1600,height:1100,deviceScaleFactor:1});
  await page.goto(target.href,{waitUntil:'networkidle0'});
  await page.waitForSelector('aside[aria-label="Timeline settings"]');
  await page.waitForFunction(()=>document.querySelector('.trace-timeline')?.textContent?.includes('Demo data'));
  await page.evaluate(()=>document.fonts.ready);
  const region=await page.$eval('aside[aria-label="Timeline settings"]',aside=>{
    const builder=aside.parentElement.getBoundingClientRect();
    const code=document.querySelector('section[aria-label="React export"]').getBoundingClientRect();
    // End at the export section boundary, never halfway through its copy button.
    return {x:builder.x+scrollX,y:builder.y+scrollY,width:builder.width,height:Math.min(1400,code.y-builder.y)};
  });
  await page.screenshot({path:output+'timeline-builder.png',clip:region,captureBeyondViewport:true});
  captures.push({file:'timeline-builder.png',view:'single shipment, dark, fictional delivered sample',...region});

  const selects=await page.$$('aside[aria-label="Timeline settings"] select');
  let experience;
  for(const select of selects){if((await select.evaluate(element=>element.labels?.[0]?.textContent||'')).startsWith('Experience')){experience=select;break;}}
  assert.ok(experience,'Experience control was not found');
  await experience.select('order');
  await page.waitForFunction(()=>document.querySelectorAll('.tt-order-parcels .trace-timeline').length===2);
  const order=await page.$('.tt-order');
  assert.ok((await order.evaluate(element=>element.textContent)).includes('Demo data'),'Keep fictional-data disclosure visible');
  await order.screenshot({path:output+'split-order.png'});
  captures.push({file:'split-order.png',view:'two independent fictional parcel journeys'});

  await page.setViewport({width:1200,height:630,deviceScaleFactor:1});
  await page.goto(target.href,{waitUntil:'networkidle0'});
  await page.waitForSelector('.trace-timeline');await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:output+'trace-ui-social.png',fullPage:false});
  captures.push({file:'trace-ui-social.png',view:'unmodified public builder viewport',width:1200,height:630});
  await writeFile(output+'capture-provenance.json',JSON.stringify({capturedAt:new Date().toISOString(),source:target.href,product:'Trace UI 0.2.0',syntheticSamplesOnly:true,customerData:false,artificialMockup:false,captures},null,2)+'\n');
  console.log(JSON.stringify({realProductCaptures:captures.length,syntheticSamplesOnly:true,output:'toolkit/assets'}));
}finally{await browser.close();}
