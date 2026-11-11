import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
try{
 const page=await browser.newPage({viewport:{width:1680,height:1060}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5192/design/studies/asset-audition/viewer.html');
 await page.waitForFunction(()=>window.auditionReady,{timeout:60000});
 const captures=[];
 for(const id of ['shop_front14','warehouse_front','apartment_block8']){
  await page.evaluate(id=>window.audition.select(id),id);
  await page.screenshot({path:`design/studies/asset-audition/${id}.png`,fullPage:true});
  captures.push({id,stats:await page.evaluate(()=>window.audition.stats()),label:await page.locator('#stats').innerText()});
 }
 await page.setViewportSize({width:390,height:844});
 const mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 await writeFile('design/studies/asset-audition/validation.json',JSON.stringify({errors,mobileOverflow,captures},null,2));
 console.log(JSON.stringify({errors,mobileOverflow,captures},null,2));
}finally{await browser.close();}
