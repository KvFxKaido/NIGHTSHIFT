import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

await mkdir('artifacts/frontage-editor',{recursive:true});
const file='src/sim/alder-frontages.json',original=await readFile(file,'utf8');
const document=JSON.parse(original),entry=document.entries.find(e=>!e.locked&&e.plan.recipe.kind==='shops');
const browser=await chromium.launch({args:['--use-angle=d3d11']});
let savedTestFile=null;
try {
  const page=await browser.newPage({viewport:{width:1600,height:1000}});page.setDefaultTimeout(90000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:5173/editor.html');
  await page.waitForFunction(()=>document.body.dataset.editorReady==='true');
  await page.waitForFunction(()=>document.querySelector('#front-status')?.textContent.includes('Saved choices loaded'));
  await page.locator('#building').selectOption(entry.buildingId);
  await page.locator('#front-view').click();
  const signIndex=entry.plan.modules.findIndex(m=>m.kind==='sign');
  await page.locator('#front-module').selectOption(String(signIndex));
  await page.locator('#front-text').fill('RAIN CHECK QA');
  await page.locator('#front-apply').click();
  await page.waitForFunction(()=>document.querySelector('#front-status').textContent.includes('Draft preview'));
  assert.equal(await page.locator('#front-locked').isChecked(),true,'manual edits lock the building');
  assert.equal(await page.locator('#front-reroll').isDisabled(),true);
  assert.equal(await readFile(file,'utf8'),original,'preview must not write the project');
  await page.screenshot({path:'artifacts/frontage-editor/draft.png'});
  await page.locator('#front-undo').click();
  assert.equal(await page.locator('#front-text').inputValue(),entry.plan.modules[signIndex].text);
  await page.locator('#front-redo').click();
  assert.equal(await page.locator('#front-text').inputValue(),'RAIN CHECK QA');
  await page.locator('#front-save').click();
  await page.waitForFunction(()=>document.querySelector('#front-status').textContent.startsWith('Saved frontages to project'));
  savedTestFile=await readFile(file,'utf8');
  assert.equal(JSON.parse(savedTestFile).entries.find(e=>e.buildingId===entry.buildingId).plan.modules[signIndex].text,'RAIN CHECK QA');
  // Reload through the actual endpoint, retaining the saved lock and exact text.
  await page.reload();await page.waitForFunction(()=>document.body.dataset.editorReady==='true');
  await page.waitForFunction(()=>document.querySelector('#front-status')?.textContent.includes('Saved choices loaded'));
  await page.locator('#building').selectOption(entry.buildingId);
  await page.locator('#front-module').selectOption(String(signIndex));
  assert.equal(await page.locator('#front-text').inputValue(),'RAIN CHECK QA');
  assert.equal(await page.locator('#front-locked').isChecked(),true);
  // A missing generation pass preserves the protected pilot and the hand edit.
  await page.locator('#front-generate').click();
  assert.equal(await page.locator('#front-text').inputValue(),'RAIN CHECK QA');
  assert.equal(await page.locator('#front-save').isDisabled(),true);
  await page.locator('#front-view').click();await page.screenshot({path:'artifacts/frontage-editor/saved.png'});
  // Moving a plot keeps the authored frontage data but requires a new access fit.
  const oldX=Number(await page.locator('#x').inputValue());
  await page.locator('#x').fill(String(oldX+1));await page.locator('#x').press('Tab');
  await page.waitForFunction(()=>document.querySelector('#front-status').textContent.includes('Placement changed'));
  assert.equal(await page.locator('#front-save').isDisabled(),true);
  await page.locator('#front-module').selectOption(String(signIndex));
  assert.equal(await page.locator('#front-text').inputValue(),'RAIN CHECK QA','building move retains authored module choices');
  await page.locator('#undo').click();
  await page.waitForFunction(()=>!document.querySelector('#front-status').textContent.includes('Placement changed'));
  assert.deepEqual(errors,[]);await writeFile('artifacts/frontage-editor/check.json',JSON.stringify({building:entry.buildingId,previewIsNonDestructive:true,undoRedo:true,saveReload:true,lockPreserved:true,errors},null,2));
  console.log('Editor preview, undo/redo, real save/reload and lock checks passed.');
} finally {
  await browser.close();
  const current=await readFile(file,'utf8');
  if(current===savedTestFile)await writeFile(file,original);
  else if(current!==original)throw Error('Frontage file changed elsewhere; test did not overwrite it.');
}
