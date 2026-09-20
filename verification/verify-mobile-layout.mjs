import path from 'node:path'
import os from 'node:os'
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
import fs from 'node:fs/promises'
const url=process.env.KIT_TEST_URL || 'http://127.0.0.1:4184/'
const results=[]
const engines=process.env.KIT_TEST_ENGINE?[process.env.KIT_TEST_ENGINE]:['chromium','webkit']
const screenshots=process.env.KIT_ARTIFACT_DIR || path.join(os.tmpdir(), 'kit-ai-mobile-layout')
await fs.mkdir(screenshots, { recursive: true })
const assert=(ok,message)=>{if(!ok)throw Error(message)}
const delay=ms=>new Promise(r=>setTimeout(r,ms))
for(const engine of engines){
 const browser=engine==='chromium'?await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE_PATH ? { executablePath: process.env.CHROME_EXECUTABLE_PATH } : {})}):await webkit.launch({headless:true})
 for(const language of ['en','es']){
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:engine==='chromium',hasTouch:true,locale:language})
  await context.addInitScript(({language})=>{
   localStorage.setItem('kit-ai-auto-prepare','false');localStorage.setItem('kit-ai-offline-download-approved','false');localStorage.setItem('kit-ai-allow-online','false');localStorage.setItem('kit-ai-language',language)
   const now=Date.now(),conversations={},conversationOrder=[]
   for(let i=0;i<30;i++) {const id=`test-${i}`;conversationOrder.push(id);conversations[id]={id,title:`Saved example ${i+1}`,createdAt:now-i*1000,updatedAt:now-i*1000,messages:Array.from({length:i===0?60:2},(_,j)=>({role:j%2?'assistant':'user',content:`Example ${j+1}. ${'This is sample text for checking the page layout. '.repeat(6)}`,timestamp:now+j,source:'guides'}))}}
   localStorage.setItem('kit-ai-chat-history',JSON.stringify({version:1,conversations,conversationOrder,currentConversationId:'test-0'}))
  },{language})
  const page=await context.newPage();const errors=[];let heavyRequests=0
  page.on('pageerror',e=>errors.push(e.message))
  page.on('request',r=>{if(/huggingface|hf\.space|webllm|\.wasm|params_shard/.test(r.url()))heavyRequests++})
  await page.goto(url);await page.locator('main h1').waitFor();await page.evaluate(()=>document.fonts.ready);await delay(300)
  const cdp=engine==='chromium'?await context.newCDPSession(page):null
  const nav=()=>page.locator('nav').last()
  const selectTab=async i=>{await nav().locator('button').nth(i).click();await delay(120)}
  const metrics=()=>page.evaluate(()=>{const m=document.querySelector('main'),r=m.getBoundingClientRect(),n=[...document.querySelectorAll('nav')].at(-1),nRect=n.getBoundingClientRect();return {width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,documentTop:scrollY,mainTop:m.scrollTop,mainScrollHeight:m.scrollHeight,mainClientHeight:m.clientHeight,mainRect:r.toJSON(),navRect:nRect.toJSON(),navDisplay:getComputedStyle(n).display}})
  const swipe=async(start=650,end=260)=>{
   if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:start}]});for(let y=start-20;y>=end;y-=20){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180,y}]});await delay(16)}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}
   else {await page.mouse.move(180,start);await page.mouse.wheel(0,start-end)}
   await delay(350)
  }
  const noOverflow=async label=>{const m=await metrics();assert(m.documentWidth<=m.width+1,`${label}: horizontal overflow ${m.documentWidth}/${m.width}`);return m}
  let start=await metrics();await swipe();let after=await noOverflow('guides');assert(after.documentTop>80,'Mobile guides must use native document scroll');assert(after.mainTop===0,'Guide main must not be a second scroller');results.push({engine,language,check:'native-guide-scroll',start,after})
  await page.evaluate(()=>window.scrollTo(0,0));await page.locator('main').getByRole('button').filter({has:page.locator('svg')}).last().click().catch(()=>{})
  // Locate a guide by its documented title when the layout contains extra controls.
  if(!(await page.locator('main article').count())){
   await selectTab(0);await page.locator('main button').filter({hasText:language==='es'?'Quemaduras':'Burns'}).first().click()
  }
  await delay(120);assert(await page.locator('main article').count(),'Guide should open');assert((await metrics()).documentTop<10,'Opening guide resets document scroll')
  await swipe();after=await noOverflow('article');assert(after.documentTop>80,'Long guide article must scroll');results.push({engine,language,check:'article-scroll',after})
  await selectTab(3);assert((await metrics()).documentTop<10,'Changing tab resets document scroll');await swipe();after=await noOverflow('settings');assert(after.documentTop>80,'Settings should scroll natively');results.push({engine,language,check:'settings-scroll',after})
  await selectTab(2);await swipe();after=await noOverflow('history');assert(after.documentTop>80,'Long history should scroll natively');results.push({engine,language,check:'history-scroll',after})
  await selectTab(1);await delay(200);start=await metrics();assert(start.mainScrollHeight>start.mainClientHeight*3,'Synthetic conversation should be long');assert(start.documentTop<2,'Chat must not move document');assert(start.mainTop+start.mainClientHeight>=start.mainScrollHeight-4,'Opening conversation follows latest message')
  if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:220}]});for(let y=240;y<=580;y+=20){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180,y}]});await delay(16)}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(350)}else{await page.mouse.move(180,400);await page.mouse.wheel(0,-650);await delay(350)}
  const reading=await metrics();assert(reading.mainTop<start.mainTop-100,'Reader can swipe toward older messages')
  await page.evaluate(()=>{const e=document.createElement('p');e.id='synthetic-growth';e.textContent='Additional synthetic answer content. '.repeat(60);document.querySelector('[role="log"]').append(e)})
  await delay(150);after=await metrics();assert(Math.abs(after.mainTop-reading.mainTop)<3,'New content must not pull reader away from older messages');results.push({engine,language,check:'reading-position-preserved',before:reading,after})
  await page.evaluate(()=>{document.querySelector('#synthetic-growth').remove();const m=document.querySelector('main');m.scrollTop=m.scrollHeight});await delay(100)
  await page.evaluate(()=>{const e=document.createElement('p');e.id='synthetic-growth';e.textContent='Additional synthetic answer content. '.repeat(60);document.querySelector('[role="log"]').append(e)})
  await delay(150);after=await metrics();assert(after.mainTop+after.mainClientHeight>=after.mainScrollHeight-4,'At bottom, new answer content stays in view');results.push({engine,language,check:'following-bottom',after})
  await page.evaluate(()=>document.querySelector('#synthetic-growth').remove())
  for(const size of [{width:320,height:568},{width:844,height:390},{width:390,height:440}]){
   await page.setViewportSize(size);await delay(150);after=await noOverflow(`chat-${size.width}x${size.height}`)
   const input=await page.locator('textarea').boundingBox();assert(input && input.y>=0 && input.y+input.height<=size.height+1,'Composer should remain visible after resize');assert(after.mainClientHeight>40,'Chat reading area must remain usable');results.push({engine,language,check:`chat-${size.width}x${size.height}`,after,input})
  }
  await page.setViewportSize({width:390,height:844});await delay(120)
  await page.locator('textarea').focus();await page.evaluate(()=>{window.__testVisualHeight=430;Object.defineProperty(window.visualViewport,'height',{configurable:true,get:()=>window.__testVisualHeight});window.visualViewport.dispatchEvent(new Event('resize'))});await delay(160)
  const keyboard=await metrics(),input=await page.locator('textarea').boundingBox();assert(input && input.y+input.height<=430+1,'Simulated keyboard: composer must stay above visible edge');assert(keyboard.navDisplay==='none','Simulated keyboard: mobile nav must make room');results.push({engine,language,check:'simulated-visual-keyboard',keyboard,input})
  await page.evaluate(()=>{Object.defineProperty(window.visualViewport,'offsetTop',{configurable:true,value:70});window.visualViewport.dispatchEvent(new Event('scroll'))});await delay(160)
  const pannedInput=await page.locator('textarea').boundingBox(),pannedShell=await page.locator('.app-shell').boundingBox();assert(Math.abs(pannedShell.y-70)<1,'Panned keyboard viewport: shell must follow offsetTop');assert(pannedInput.y+pannedInput.height<=500+1,'Panned keyboard viewport: composer must stay above visual bottom');results.push({engine,language,check:'simulated-keyboard-offset',shellTop:pannedShell.y,inputBottom:pannedInput.y+pannedInput.height})
  await page.evaluate(()=>{Object.defineProperty(window.visualViewport,'scale',{configurable:true,value:2});window.visualViewport.dispatchEvent(new Event('resize'))});await delay(160)
  assert(!(await page.locator('.app-shell').getAttribute('data-keyboard-open')),'Pinch zoom must not be mistaken for keyboard');assert((await metrics()).navDisplay!=='none','Pinch zoom must not hide navigation');results.push({engine,language,check:'zoom-not-keyboard'})
  await page.evaluate(()=>{document.activeElement.blur();delete window.visualViewport.height;delete window.visualViewport.offsetTop;delete window.visualViewport.scale;window.visualViewport.dispatchEvent(new Event('resize'))});await delay(160)
  await page.setViewportSize({width:844,height:390});await delay(120);await page.locator('textarea').focus();await page.evaluate(()=>{Object.defineProperty(window.visualViewport,'height',{configurable:true,value:210});window.visualViewport.dispatchEvent(new Event('resize'))});await delay(160)
  const landscapeInput=await page.locator('textarea').boundingBox(),landscapeShell=await page.locator('.app-shell').boundingBox(),landscape=await metrics();assert(Math.abs(landscapeShell.height-210)<1,'Landscape keyboard: shell must fit visual viewport');assert(landscapeInput.y+landscapeInput.height<=211,'Landscape keyboard: composer must remain visible');assert(landscape.mainClientHeight>30,'Landscape keyboard: conversation must retain room to scroll');results.push({engine,language,check:'simulated-landscape-keyboard',shellHeight:landscapeShell.height,inputBottom:landscapeInput.y+landscapeInput.height,after:landscape})
  await page.evaluate(()=>{document.activeElement.blur();delete window.visualViewport.height;window.visualViewport.dispatchEvent(new Event('resize'))});await page.setViewportSize({width:390,height:844});await delay(120)
  await page.setViewportSize({width:320,height:568});await delay(120);await page.locator('header button').click();await delay(160)
  const empty=await metrics();assert(empty.mainTop<2,'New conversation starts at welcome on a small phone');assert((await page.getByRole('log').textContent()).trim()==='','New conversation clears visible messages');results.push({engine,language,check:'small-phone-new-conversation',after:empty})
  await page.setViewportSize({width:390,height:844});await delay(120)
  for(const tabIndex of [0,3]){
   await selectTab(tabIndex);await page.locator('main input').first().focus();await page.evaluate(()=>{Object.defineProperty(window.visualViewport,'height',{configurable:true,value:430});window.visualViewport.dispatchEvent(new Event('resize'))});await delay(100)
   assert(!(await page.locator('.app-shell').getAttribute('data-keyboard-open')),'Focused nonchat page must not enable fixed keyboard layout');await page.evaluate(()=>window.scrollTo(0,250));after=await metrics();assert(after.documentTop>100,'Focused nonchat page must retain document scrolling');results.push({engine,language,check:tabIndex===0?'focused-search-native-scroll':'focused-settings-native-scroll',after})
   await page.evaluate(()=>{document.activeElement.blur();delete window.visualViewport.height;window.visualViewport.dispatchEvent(new Event('resize'))})
  }
  await selectTab(0);await page.screenshot({path:`${screenshots}/kit-${engine}-${language}-mobile.png`,fullPage:true})
  for(const size of [{width:320,height:568},{width:844,height:390},{width:1440,height:1000}]){await page.setViewportSize(size);await delay(150);after=await noOverflow(`guides-${size.width}x${size.height}`);results.push({engine,language,check:`guides-${size.width}x${size.height}`,after})}
  if(language==='en')await page.screenshot({path:`${screenshots}/kit-${engine}-desktop.png`,fullPage:true})
  assert(errors.length===0,`Browser errors: ${errors.join('; ')}`);assert(heavyRequests===0,`Unexpected heavy/model requests: ${heavyRequests}`)
  results.push({engine,language,check:'console-and-downloads',errors,heavyRequests})
  await context.close()
 }
 await browser.close()
}
await fs.writeFile(path.join(screenshots, 'mobile-layout-results.json'),JSON.stringify({url,runAt:new Date().toISOString(),results},null,2))
console.log(JSON.stringify({url,checks:results.length,result:'pass',engines,note:'Chromium used synthesized touch gestures; WebKit used wheel. WebKit used a desktop context at phone widths because its mobile emulation does not support wheel input. Keyboard viewport was simulated; no physical-phone claim.'},null,2))
