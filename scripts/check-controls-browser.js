// Use an isolated playwright-cli session, never the user's browser profile.
async page => {
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const ready = () => page.waitForFunction(() => window.__ns && document.body.dataset.assetState === 'ready');
  const screen = name => page.waitForFunction(name => document.body.dataset.gameScreen === name, name);
  const binding = (action, device='keyboard') => page.locator(`[data-binding="${action}"][data-binding-device="${device}"]`);
  const frames = () => page.evaluate(async () => { for (let i=0;i<8;i++) await new Promise(requestAnimationFrame); });
  const setPad = async values => {
    await page.evaluate(values => {
      window.__testPad = {id:'Controls test pad',connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},(_,i)=>({value:values[i]||0,pressed:(values[i]||0)>.5,touched:false}))};
      navigator.getGamepads = () => [window.__testPad];
    }, values);
    await frames();
  };
  await page.setViewportSize({width:1280,height:900});
  await page.goto('http://127.0.0.1:5173/'); await ready();
  await page.evaluate(() => localStorage.removeItem('nightshift.controls'));
  await page.reload(); await ready();
  if (await page.locator('#controls').count()) throw Error('Driving guide still exists');
  await page.locator('[data-menu-screen="main"] [data-menu-action="options"]').click(); await screen('options');
  await page.locator('[data-menu-screen="options"] [data-menu-action="controls"]').click(); await screen('controls');
  await binding('throttle').click(); await page.keyboard.press('i');
  await page.waitForFunction(() => document.querySelector('[data-controls-status]').textContent.includes('saved'));
  if (await binding('throttle').textContent() !== 'I') throw Error('Keyboard binding missing');
  await binding('reset').click(); await page.keyboard.press('i');
  if (!/Already assigned/.test(await page.locator('[data-controls-status]').textContent())) throw Error('Conflict accepted');
  await binding('brake').click(); await page.keyboard.press('Escape'); await screen('controls');
  if (await binding('brake').textContent() !== 'S') throw Error('Cancel changed binding');
  await binding('handbrake','gamepad').focus();
  await setPad({0:1});
  await frames();
  if (!await binding('handbrake','gamepad').isDisabled()) throw Error('Held confirm was captured');
  // RB / R1 is Shift up since the drag gearbox landed, so capturing it now
  // trips the conflict guard. B / Circle is the only pad button the defaults
  // leave unbound; menus may share it because they run on another screen.
  await setPad({}); await setPad({1:1});
  await page.waitForFunction(() => document.querySelector('[data-binding="handbrake"][data-binding-device="gamepad"]').textContent === 'B / Circle');
  await setPad({});
  await page.screenshot({path:'artifacts/controls-desktop.png'});
  await page.reload(); await ready();
  await page.locator('[data-menu-screen="main"] [data-menu-action="options"]').click(); await screen('options');
  await page.locator('[data-menu-screen="options"] [data-menu-action="controls"]').click(); await screen('controls');
  if (await binding('throttle').textContent() !== 'I' || await binding('handbrake','gamepad').textContent() !== 'B / Circle') throw Error('Bindings lost on reload');
  // Two backs: controls sits inside options, so the first returns to options.
  await page.keyboard.press('Escape'); await screen('options');
  await page.keyboard.press('Escape'); await screen('main');
  await page.locator('[data-menu-screen="main"] [data-menu-action="new-drive"]').click(); await screen('playing');
  await frames();
  await page.keyboard.down('i');
  await page.waitForFunction(() => __ns.input().delivered.throttle === 1 && __ns.sim.state.vehicle.speed > 1);
  await page.keyboard.up('i');
  await page.keyboard.down('w'); await frames();
  if (await page.evaluate(() => __ns.input().delivered.throttle !== 0)) throw Error('Old key still accelerates');
  await page.keyboard.up('w');
  await setPad({1:1});
  await page.waitForFunction(() => __ns.input().delivered.handbrake === 1);
  await setPad({});
  await page.keyboard.press('Escape'); await screen('pause');
  const paused = await page.evaluate(() => JSON.stringify(__ns.sim.state));
  await page.locator('[data-menu-screen="pause"] [data-menu-action="options"]').click(); await screen('options');
  await page.locator('[data-menu-screen="options"] [data-menu-action="controls"]').click(); await screen('controls');
  await frames();
  if (await page.evaluate(before => JSON.stringify(__ns.sim.state) !== before, paused)) throw Error('Controls advanced paused run');
  await page.keyboard.press('Escape'); await screen('options');
  await page.keyboard.press('Escape'); await screen('pause');
  if (await page.evaluate(before => JSON.stringify(__ns.sim.state) !== before, paused)) throw Error('Back resumed run');
  await page.locator('[data-menu-screen="pause"] [data-menu-action="options"]').focus();
  await page.keyboard.press('Enter'); await screen('options');
  await page.locator('[data-menu-screen="options"] [data-menu-action="controls"]').focus();
  await page.keyboard.press('Enter'); await screen('controls');
  await binding('throttle').focus(); await page.keyboard.press('Enter');
  await page.keyboard.press('o');
  if (await binding('throttle').textContent() !== 'O') throw Error('Keyboard menu activation double-fired');
  await page.evaluate(() => { const original=Storage.prototype.setItem; Storage.prototype.setItem=function(k,v){if(k==='nightshift.controls')throw Error('Test blocked save');original.call(this,k,v);}; });
  await binding('throttle').click(); await page.keyboard.press('i');
  if (!/session only/.test(await page.locator('[data-controls-status]').textContent())) throw Error('Storage failure not reported');
  await page.locator('[data-default-bindings]').click();
  if (await binding('throttle').textContent() !== 'W' || await binding('handbrake','gamepad').textContent() !== 'A / Cross') throw Error('Defaults not restored');
  await page.setViewportSize({width:960,height:600});
  await page.locator('[data-menu-screen="controls"] [data-menu-action="back"]').scrollIntoViewIfNeeded();
  await page.screenshot({path:'artifacts/controls-small.png'});
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Controls overflow horizontally');
  await page.evaluate(() => localStorage.removeItem('nightshift.controls'));
  if (errors.length) throw Error(errors.join('\n'));
  return {checks:'Main/pause navigation through Options; paused state preserved; keyboard and simulated controller capture; held-button release; conflicts; cancel; persistence; live driving; restore defaults; blocked storage; small viewport', errors};
}
