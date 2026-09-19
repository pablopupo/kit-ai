import os from 'node:os'
import path from 'node:path'
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
import fs from 'node:fs/promises'
const url=process.env.KIT_TEST_URL || 'http://127.0.0.1:4184/'
const results=[]
const artifacts=process.env.KIT_ARTIFACT_DIR || path.join(os.tmpdir(), 'kit-ai-save-support')
await fs.mkdir(artifacts,{recursive:true})
const ua='Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/1.0 Mobile/15E148 Safari/604.1'
const assert=(v,m)=>{if(!v)throw Error(m)}
for(const engine of ['chromium','webkit']){
 const browser=await (engine==='chromium'?chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE_PATH?{executablePath:process.env.CHROME_EXECUTABLE_PATH}:{})}):webkit.launch({headless:true}))
 try{
 for(const language of ['en','es'])for(const failure of ['missing','blocked','insecure']){
  const context=await browser.newContext({viewport:{width:390,height:844},userAgent:failure==='missing'?ua:undefined})
  await context.addInitScript(({language,failure})=>{
   localStorage.setItem('kit-ai-language',language);localStorage.setItem('kit-ai-allow-online','false');localStorage.setItem('kit-ai-offline-download-approved','false')
   if(failure==='missing')Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:undefined})
   if(failure==='blocked')Object.defineProperty(navigator,'serviceWorker',{configurable:true,get(){throw new DOMException('Private error content','SecurityError')}})
   if(failure==='insecure')Object.defineProperty(window,'isSecureContext',{configurable:true,value:false})
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__copied=value}}})
  },{language,failure})
  const page=await context.newPage(),errors=[],heavy=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/huggingface|hf\.space|webllm(?:Service|-worker)|\.wasm|params_shard/.test(r.url()))heavy.push(r.url())})
  await page.goto(url);await page.getByRole('searchbox').waitFor()
  const title=failure==='missing'?(language==='es'?'Abre Kit en Safari o Chrome':'Open Kit in Safari or Chrome'):(language==='es'?'No se puede guardar Kit en esta ventana':'Saving is unavailable in this window')
  await page.getByText(title,{exact:true}).waitFor()
  const body=await page.locator('body').innerText();assert(!body.includes(language==='es'?'Mantén Kit abierto hasta que termine':'Keep Kit open until saving finishes'),'Contradictory waiting text')
  if(failure==='missing'){
   await page.getByRole('button',{name:language==='es'?'Copiar enlace de Kit':'Copy Kit link',exact:true}).click();assert(await page.evaluate(()=>window.__copied==='https://kit-ai-pablopupo.vercel.app/'),'Wrong copied website')
  }
  await page.getByText(language==='es'?'Ayuda para guardar Kit':'Help with saving',{exact:true}).click()
  await page.getByRole('button',{name:language==='es'?'Comprobar este navegador':'Check this browser',exact:true}).click()
  const copy=page.getByRole('button',{name:language==='es'?'Copiar informe':'Copy report',exact:true});await copy.waitFor();await copy.click()
  const report=await page.evaluate(()=>JSON.parse(window.__copied))
  const reason={missing:'service-worker-unavailable',blocked:'service-worker-blocked',insecure:'insecure-context'}[failure]
  assert(report.offlineApp?.reason===reason,`Expected reason ${reason}, got ${JSON.stringify(report.offlineApp)}`)
  assert(!JSON.stringify(report).includes('Private error'),'Leaked exception');assert(!report.browserUserAgent,'Browser identity without consent');assert(!report.localTest,'False local test')
  assert(!(await page.getByRole('button',{name:language==='es'?'Probar una respuesta':'Try an answer',exact:true}).count()),'Unavailable setup offers impossible inference test')
  await page.screenshot({path:`${artifacts}/save-help-${engine}-${language}-${failure}.png`,fullPage:true})
  await page.locator('nav').last().locator('button').nth(1).click();assert(await page.locator('textarea').isEnabled(),'Chat blocked by unavailable saving')
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow');assert(!errors.length,'Page errors '+errors.join(';'));assert(!heavy.length,'Unwanted downloads')
  results.push({engine,language,failure,reason:report.offlineApp.reason,errors,heavyRequests:heavy.length});await context.close()
 }
 }finally{await browser.close()}
}
await fs.writeFile(path.join(artifacts,'save-support-results.json'),JSON.stringify({url,checkedAt:new Date().toISOString(),scope:'Missing API and blocked getters simulated in desktop browsers; not a physical iPhone test',results},null,2));console.log(JSON.stringify({checks:results.length,result:'pass'}))
