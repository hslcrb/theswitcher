import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { build } from 'esbuild'

await rm('dist', { recursive: true, force: true })
await mkdir('dist', { recursive: true })
await cp('public','dist',{recursive:true})
const result = await build({
  entryPoints:{app:'src/app.ts',worker:'src/worker.ts'}, outdir:'dist/assets', bundle:true,
  minify:true, splitting:true, format:'esm', platform:'browser', target:['es2022'],
  chunkNames:'chunks/[name]-[hash]',legalComments:'external',metafile:true,
})
for(const [name, output] of Object.entries(result.metafile.outputs)) console.log(name, output.bytes, 'bytes')
await writeFile('dist/_build.json', JSON.stringify({commit:process.env.CF_PAGES_COMMIT_SHA??null})+'\n')
await cp('node_modules/woff2-encoder/LICENSE','dist/woff2-encoder.LICENSE.txt')
