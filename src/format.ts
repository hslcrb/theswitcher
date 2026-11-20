export type Container = 'ttf' | 'otf' | 'woff' | 'woff2'
export type Target = Container | 'original'
export const LIMITS = { input: 20 * 1024 ** 2, raw: 32 * 1024 ** 2, tables: 256, batch: 12 } as const
export const TTF = 0x00010000, APPLE = 0x74727565, OTF = 0x4f54544f, WOFF = 0x774f4646, WOFF2 = 0x774f4632
export const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength)
export const fail = (message: string): never => { throw new Error(message) }
export const flavorFor = (x: number) => x === TTF || x === APPLE ? 'ttf' as const : x === OTF ? 'otf' as const
  : fail(x === 0x74746366 ? 'TTC/OTC 컬렉션은 먼저 개별 폰트로 분리해 주세요.' : '지원하지 않는 폰트 헤더입니다.')

export function detectFont(b: Uint8Array) {
  if (b.length < 4) return fail('폰트 헤더가 잘렸습니다.')
  const d = view(b), marker = d.getUint32(0)
  if (marker === WOFF || marker === WOFF2) {
    if (b.length < (marker === WOFF ? 44 : 48)) return fail('웹폰트 헤더가 잘렸습니다.')
    return { container: (marker === WOFF ? 'woff' : 'woff2') as Container, flavor: flavorFor(d.getUint32(4)) }
  }
  const raw = flavorFor(marker)
  return { container: raw as Container, flavor: raw }
}

