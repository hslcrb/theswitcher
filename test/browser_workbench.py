from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from pathlib import Path
from playwright.sync_api import sync_playwright
import tempfile, os

root = str(Path(__file__).resolve().parents[1]/'dist')
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw): super().__init__(*a,directory=root,**kw)
    def end_headers(self):
        if self.path == '/assets/worker-compat.js':
            self.send_header("Content-Security-Policy", "default-src 'none'; script-src 'self' 'unsafe-eval'; connect-src 'self'; worker-src 'none'")
        elif self.path == '/assets/worker.js':
            self.send_header("Content-Security-Policy", "default-src 'none'; script-src 'self'; connect-src 'self'; worker-src 'none'")
        elif self.path in ('/', '/index.html'):
            self.send_header("Content-Security-Policy", "default-src 'none'; script-src 'self'; worker-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
        super().end_headers()
    def log_message(self,*args): pass
s=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=s.serve_forever,daemon=True).start()
url=os.environ.get('SWITCHER_TEST_URL',f'http://127.0.0.1:{s.server_port}/')
font=os.environ['TTF_FIXTURE']
with sync_playwright() as p:
    proxy=os.environ.get('HTTPS_PROXY') if url.startswith('https://') else None
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),proxy={'server':proxy} if proxy else None)
    for width in (390,1280):
        page=browser.new_page(viewport={'width':width,'height':900},accept_downloads=True)
        requests=[]; errors=[]
        page.on('request',lambda r:requests.append((r.method,r.url)))
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('console',lambda m: print('CONSOLE',m.type,m.text[:250],flush=True) if m.type=='error' else None)
        page.goto(url,wait_until='networkidle')
        assert not any('/dist-' in u or 'decompress-' in u or 'woff2-fast-' in u for _,u in requests)
        assert page.evaluate('document.documentElement.scrollWidth') == width
        page.locator('#files').set_input_files(font)
        page.locator('#start:not([disabled])').wait_for()
        page.evaluate("document.querySelector('#start').click(); document.querySelector('#stop').click()")
        page.get_by_text('변환 중지',exact=True).wait_for()
        page.get_by_role('button',name='다시 대기').click()
        page.get_by_role('button',name='변환 시작',exact=False).click()
        save=page.get_by_role('link',name='내려받기')
        try: save.wait_for(timeout=10000)
        except Exception:
            print(page.locator('#jobs').inner_text(),requests,errors,flush=True)
            raise
        with page.expect_download() as d: save.click()
        dl=d.value
        with tempfile.TemporaryDirectory() as folder:
            path=folder+'/'+dl.suggested_filename
            dl.save_as(path)
            data=Path(path).read_bytes()
            assert data[:4] == b'wOF2'
            assert page.evaluate("async (bytes) => (await new FontFace('ProofFont',new Uint8Array(bytes)).load()).status",list(data))=='loaded'
        assert not any('worker-compat' in u or 'decompress-' in u for _,u in requests),requests
        assert page.evaluate('document.documentElement.scrollWidth') == width
        assert all(m=='GET' and u.startswith(url) for m,u in requests),requests
        assert not errors,errors
        page.locator('#target').select_option('original')
        page.locator('#files').set_input_files({'name':'roundtrip.woff2','mimeType':'font/woff2','buffer':data})
        page.locator('#start:not([disabled])').wait_for()
        page.locator('#start').click()
        page.get_by_text('처리 완료',exact=True).wait_for(timeout=20000)
        assert page.get_by_role('link',name='내려받기').last.get_attribute('download')=='roundtrip.ttf'
        assert any('worker-compat.js' in u for _,u in requests)
        assert all(m=='GET' and u.startswith(url) for m,u in requests),requests
        assert not errors,errors
        artifact = os.environ.get("SWITCHER_ARTIFACT_DIR")
        if artifact: page.screenshot(path=str(Path(artifact)/f"preview-{width}.png"),full_page=True)
        print(width,'no external request, WOFF2 download OK, worker cancel and retry OK',flush=True)
        page.close()
    page=browser.new_page(viewport={'width':390,'height':760})
    page.add_init_script("""
      Object.defineProperty(navigator,'deviceMemory',{value:2});
      const OriginalWorker=window.Worker;
      window.poolProof={live:0,max:0};
      window.Worker=class extends OriginalWorker {
        constructor(...args){
          super(...args);
          this.released=false;
          window.poolProof.live++;
          window.poolProof.max=Math.max(window.poolProof.max,window.poolProof.live);
        }
        terminate(){
          if(!this.released){this.released=true;window.poolProof.live--;}
          return super.terminate();
        }
      };
    """)
    page.goto(url,wait_until='networkidle')
    page.evaluate("""() => {
      const bar=document.querySelector('progress');
      window.progressProof=[bar.value];
      new MutationObserver(()=>window.progressProof.push(bar.value)).observe(bar,{attributes:true,attributeFilter:['value']});
    }""")
    with tempfile.TemporaryDirectory() as d:
        fs=[]
        for n in range(3):
            path=Path(d)/f"test-{n}.ttf"
            path.write_bytes(Path(font).read_bytes())
            fs.append(str(path))
        page.locator('#files').set_input_files(fs)
        page.locator('#start:not([disabled])').wait_for()
        page.locator('#start').click()
        page.get_by_text('처리 완료',exact=True).wait_for(timeout=30000)
        assert page.get_by_role('link',name='내려받기').count()==3
    proof=page.evaluate("({pool:window.poolProof, values:window.progressProof})")
    assert proof["pool"]=={"live":0,"max":2},proof
    assert proof["values"][-1]==1 and proof["values"]==sorted(proof["values"]),proof
    assert any(0<v<1 for v in proof["values"]),proof
    print("parallel: peak two real workers, all terminated; progress monotonic and complete",proof["values"])
    page.close()
    page=browser.new_page(viewport={'width':390,'height':760})
    page.add_init_script("Object.defineProperty(navigator, 'deviceMemory', {value: 2});")
    page.goto(url,wait_until='networkidle')
    with tempfile.TemporaryDirectory() as d:
        oversized=Path(d)/'over-budget.ttf'
        with oversized.open('wb') as fd: fd.truncate(6*1024**2+1)
        page.locator('#files').set_input_files(str(oversized))
        page.get_by_text('실패',exact=True).wait_for()
        assert '6 MiB' in page.locator('#limits').inner_text()
        assert page.locator('#start').is_disabled()
    print('low-memory limit: file rejected before worker run')
