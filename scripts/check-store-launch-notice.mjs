import { build } from 'esbuild'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'node:http'
import { readFileSync, mkdirSync } from 'node:fs'
import postcss from 'postcss'
import tailwind from 'tailwindcss'

const dir = 'output/launch-notice-check'
mkdirSync(dir, {recursive:true})
const entry = `import React from 'react';
import {hydrateRoot} from 'react-dom/client';
import Notice from '../../components/StoreLaunchNotice';
hydrateRoot(document.getElementById('root'), <Notice />, {onRecoverableError: e => console.error(e)});`
const hooks = `import {translations} from '@/data/translations';
export function useTranslation(){return {t: key => translations[location.pathname.split('/')[1] || 'ru'][key]}};
export function useUnprefixedPathname(){return '/' + location.pathname.split('/').slice(2).join('/')};`
const plugin = {name:'isolated-hooks', setup(b){
  b.onResolve({filter:/^@\/lib\/(use-translation|i18n-context)$/}, () => ({path:'hooks',namespace:'test'}));
  b.onLoad({filter:/.*/,namespace:'test'}, () => ({contents:hooks,loader:'js',resolveDir:process.cwd()}));
}}
await build({preserveSymlinks:true,stdin:{contents:entry,resolveDir:process.cwd()+'/'+dir,loader:'tsx'},bundle:true,write:true,outfile:dir+'/bundle.js',plugins:[plugin],jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}})
const css = (await postcss([tailwind('./tailwind.config.cjs')]).process(readFileSync('styles/globals.css','utf8'), {from:'styles/globals.css'})).css
const server = createServer((req,res) => {
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(readFileSync(dir+'/bundle.js'));return}
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(`<html><head><style>${css}</style></head><body><header style="height:80px">Header</header><div id="root"></div><main>Main</main><script src="/bundle.js"></script></body></html>`)
})
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve))
const base = 'http://127.0.0.1:'+server.address().port
const browser = await chromium.launch({headless:true,channel:'chrome'})
const errors=[]
const key='hairshoppro.launch-notice.dismissed'
try {
  const context=await browser.newContext()
  const page=await context.newPage()
  page.on('pageerror',e=>errors.push(e.message))
  page.on('console',m=>{if(m.type()==='error') errors.push(m.text())})
  const titles={ru:'\u0414\u043e\u0431\u0440\u043e \u043f\u043e\u0436\u0430\u043b\u043e\u0432\u0430\u0442\u044c \u0432 Hairshop Pro!',lv:'Laipni l\u016bdzam Hairshop Pro!',en:'Welcome to Hairshop Pro!'}
  for(const width of [1440,375,320]) for(const lang of ['ru','lv','en']) {
    await page.setViewportSize({width,height:900})
    await page.goto(base+'/'+lang)
    await expect(page.getByRole('heading',{name:titles[lang],exact:true})).toBeVisible()
    await expect(page.getByRole('checkbox')).not.toBeChecked()
    await expect(page.locator('section a')).toHaveAttribute('href','mailto:info@hairshop.lv')
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    const bounds=await page.locator('section').boundingBox()
    expect(bounds.y).toBeGreaterThanOrEqual(80)
    const main=await page.locator('main').boundingBox()
    expect(main.y).toBeGreaterThanOrEqual(bounds.y+bounds.height)
    if(width===375) await page.screenshot({path:dir+'/'+lang+'-mobile.png',fullPage:true})
  }
  await page.getByRole('button').focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('section')).toHaveCount(0)
  expect(await page.evaluate(k=>sessionStorage.getItem(k),key)).toBe('1')
  expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBeNull()
  await page.goto(base+'/lv'); await expect(page.locator('section')).toHaveCount(0)
  await page.reload(); await expect(page.locator('section')).toHaveCount(0)
  const fresh=await context.newPage()
  await fresh.goto(base+'/en'); await expect(fresh.locator('section')).toBeVisible()
  await fresh.getByRole('checkbox').focus(); await fresh.keyboard.press('Space')
  await expect(fresh.getByRole('checkbox')).toBeChecked()
  await fresh.getByRole('button').click()
  expect(await fresh.evaluate(k=>localStorage.getItem(k),key)).toBe('1')
  await fresh.goto(base+'/ru'); await expect(fresh.locator('section')).toHaveCount(0)
  const nextSession=await context.newPage()
  await nextSession.goto(base+'/lv'); await expect(nextSession.locator('section')).toHaveCount(0)
  await page.evaluate(()=>{localStorage.clear();sessionStorage.clear()})
  for(const route of ['admin','auth/login','checkout','payment','order/123','account']) {
    await page.goto(base+'/en/'+route); await expect(page.locator('section')).toHaveCount(0)
  }
  await page.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw Error('denied')}});Object.defineProperty(window,'sessionStorage',{get(){throw Error('denied')}})})
  await page.goto(base+'/en'); await expect(page.locator('section')).toBeVisible()
  await page.getByRole('button').click(); await expect(page.locator('section')).toHaveCount(0)
  expect(errors).toEqual([])
  console.log('PASS: RU/LV/EN; 1440/375/320px; mailto; keyboard; session/local dismissal across languages and tabs; excluded routes; unavailable storage; hydration and browser errors.')
} finally {await browser.close();await new Promise(r=>server.close(r))}


