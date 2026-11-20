import { readFile,writeFile } from 'node:fs/promises'
import { convertFont } from '../src/font.ts'
const [file, outputPrefix]=process.argv.slice(2)
if(!file||!outputPrefix) throw new Error('usage: node scripts/variable-round-trip.mjs <font> <output-prefix>')
const input=new Uint8Array(await readFile(file))
for(const target of ['woff2','woff2-compact']){
  const web=await convertFont(input,target)
  const raw=await convertFont(web,'original')
  const filename=`${outputPrefix}-${target}.sfnt`
  await writeFile(filename,raw)
  console.log(target, filename, web.length)
}
