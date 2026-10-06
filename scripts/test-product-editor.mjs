// Isolated browser regression checks: real editor/RHF/Zod, mocked network and
// application context. No server, credentials, or database writes are needed.
import { build } from 'esbuild'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'

const stubs = {
  '@/lib/use-admin-locale': "export const useAdminLocale = () => ({ l: (ru,en) => en });",
  '@/lib/use-translation': "export const useTranslation = () => ({ t: (_,fallback) => fallback });",
  '@/components/admin/AdminConfirmProvider': 'export const useAdminConfirm = () => async () => ({confirmed:false});',
  'next/navigation': 'export const useRouter = () => ({push: (url) => window.navigation.push(url), refresh: () => {}});',
  'next/image': "import React from 'react'; export default function Image(props) { const {unoptimized,...rest}=props; return <img {...rest}/>; }",
}
const omitted = /(?:ProductBasicFields|ProductPicker|ProductPreviewCard|ProductImageCropTool|ProductSeoIssuePanel)$/
const bundle = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import Editor from './components/admin/products/AddProductForm';
      import {mapProductToFormValues} from './lib/product-form-mapping';
      const initialValues=mapProductToFormValues({id:'p1',title:'Test',brand:'B',category:'hair',price:10,stock:5,rating:0,bulkPricingTiers:[{quantity:2,pricePerUnit:9.90}],images:['/first.png']});
      window.requests=[]; window.navigation=[]; window.uploadMode='success';
      window.fetch=async (url,options) => {
        if(url.includes('/upload')) {
          if(window.uploadMode==='pending') await new Promise(resolve => {window.finishUpload=resolve;});
          if(window.uploadMode==='failure') return {ok:false,status:500,json:async()=>({error:'failed_to_upload_file'})};
          return {ok:true,json:async()=>({path:'/uploaded-'+options.body.get('file').name})};
        }
        window.requests.push(JSON.parse(options.body)); return {ok:true,json:async()=>({data:{product:{revision:window.requests.length+1}}})};
      };
      createRoot(document.getElementById('root')).render(<Editor mode="edit" productId="p1" revision={1} initialValues={initialValues}/>);`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  bundle: true, write: false, format: 'iife', platform: 'browser', loader: { '.css': 'empty' },
  plugins: [{ name: 'isolated-context', setup(builder) {
    builder.onResolve({ filter: /.*/ }, (args) => {
      if (stubs[args.path] || omitted.test(args.path) || args.path.endsWith('NotifyPromoSubscribersButton')) return {path:args.path,namespace:'stub'};
    });
    builder.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({
      contents: stubs[args.path] ?? (args.path.endsWith('NotifyPromoSubscribersButton')
        ? 'export const NotifyPromoSubscribersButton = () => null;'
        : 'export default function Stub() {return null;}'), loader:'tsx', resolveDir:process.cwd(),
    }));
  }}],
})
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (existsSync(chrome) ? chrome : undefined), headless:true })
try {
  const page = await browser.newPage()
  const mount = async () => {
    await page.goto('about:blank')
    await page.setContent('<div id="root"></div>')
    await page.addScriptTag({content:bundle.outputFiles[0].text})
    await page.getByRole('button', {name:'Save changes', exact:true}).waitFor()
  }
  await mount()
  await page.getByText('Price', {exact:true}).first().click()
  await page.locator('#add-product-price').fill('12.50')
  await page.getByRole('button', {name:'Save changes',exact:true}).click()
  await page.waitForFunction(() => window.requests.length === 1)
  assert.deepEqual(await page.evaluate(() => window.requests[0]), {id:'p1',revision:1,changes:{price:12.5}})
  console.log('PASS: price saves with fractional bulk price in collapsed section')

  await mount()
  await page.locator('#product-form-images-section summary').click()
  const addURL = page.getByRole('button', {name:'+ Add URL',exact:true})
  await addURL.click(); await addURL.click()
  assert.equal(await page.getByPlaceholder(/^Image \d+ \(URL\)$/).count(),3)
  await page.getByPlaceholder('Image 2 (URL)',{exact:true}).fill('/second.png')
  await page.getByPlaceholder('Image 3 (URL)',{exact:true}).fill('/third.png')
  await page.locator('input[type=file][multiple]').setInputFiles([
    {name:'a.png',mimeType:'image/png',buffer:Buffer.from('a')},
    {name:'b.png',mimeType:'image/png',buffer:Buffer.from('b')},
  ])
  await page.getByPlaceholder('Image 5 (URL)',{exact:true}).waitFor()
  await page.getByRole('button', {name:'Save changes',exact:true}).click()
  await page.waitForFunction(() => window.requests.length === 1)
  assert.deepEqual(await page.evaluate(() => window.requests[0].changes),{images:['/first.png','/second.png','/third.png','/uploaded-a.png','/uploaded-b.png']})
  console.log('PASS: blank gallery rows and multiple uploads are preserved and saved')

  await mount()
  await page.getByText('Price', {exact:true}).first().click()
  await page.locator('#add-product-price').fill('-1')
  await page.getByText('Price', {exact:true}).first().click()
  await page.getByRole('button', {name:'Save changes',exact:true}).click()
  await page.getByRole('alert').waitFor()
  assert.equal(await page.evaluate(() => window.requests.length),0)
  assert.equal(await page.locator('#add-product-price').isVisible(),true)
  console.log('PASS: invalid values show an error, reveal fields, and never reach the API')

  await mount()
  await page.locator('#product-form-images-section summary').click()
  await page.evaluate(() => {window.uploadMode='pending';})
  await page.locator('input[type=file]:not([multiple])').setInputFiles({name:'main.png',mimeType:'image/png',buffer:Buffer.from('main')})
  await page.waitForFunction(() => Boolean(window.finishUpload))
  const save = page.getByRole('button', {name:'Save changes',exact:true})
  assert.equal(await save.isDisabled(),true,'Save must wait for the selected image to upload')
  await page.evaluate(() => window.finishUpload())
  await page.waitForFunction(() => document.querySelector('#add-product-image').value === '/uploaded-main.png')
  await save.click()
  await page.waitForFunction(() => window.requests.length === 1)
  assert.deepEqual(await page.evaluate(() => window.requests[0].changes),{image:'/uploaded-main.png'})
  assert.deepEqual(await page.evaluate(() => window.navigation),[])
  await page.getByRole('status').filter({hasText:'Changes saved'}).waitFor()
  await page.locator('#add-product-image').fill('/replacement.png')
  await save.click()
  await page.waitForFunction(() => window.requests.length === 2)
  assert.equal(await page.evaluate(() => window.requests[1].revision),2)
  console.log('PASS: upload blocks premature save; editor stays open and subsequent save uses new revision')

  await mount()
  await page.locator('#product-form-images-section summary').click()
  await page.evaluate(() => {window.uploadMode='failure';})
  await page.locator('input[type=file]:not([multiple])').setInputFiles({name:'bad.png',mimeType:'image/png',buffer:Buffer.from('bad')})
  await page.getByRole('alert').first().waitFor()
  assert.equal(await page.getByRole('button',{name:'Save changes',exact:true}).isDisabled(),true)
  assert.deepEqual(await page.evaluate(() => window.navigation),[])
  assert.equal(await page.evaluate(() => window.requests.length),0)
  console.log('PASS: failed upload stays visible and cannot be silently saved')
} finally { await browser.close() }
