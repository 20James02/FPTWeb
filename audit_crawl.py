import requests, json, re, time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit
import xml.etree.ElementTree as ET

OUT=Path('audit-mangfpt'); OUT.mkdir(exist_ok=True)
class Parse(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts=[]; self.links=[]; self.skip=0; self.title=False; self.t=[]; self.headings=[]; self.h=False
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag in ('script','style','noscript'): self.skip+=1
        if tag=='a' and a.get('href'): self.links.append(a['href'])
        if tag=='title': self.title=True
        if tag in ('h1','h2','h3'): self.h=True; self.parts.append('\n')
        if tag in ('p','div','li','tr','br'): self.parts.append('\n')
    def handle_endtag(self,tag):
        if tag in ('script','style','noscript'): self.skip=max(0,self.skip-1)
        if tag=='title': self.title=False
        if tag in ('h1','h2','h3'): self.h=False; self.parts.append('\n')
    def handle_data(self,data):
        if self.skip: return
        s=data.strip()
        if s:
            self.parts.append(s+' ')
            if self.title: self.t.append(s)
            if self.h: self.headings.append(s)

def get(url):
    r=requests.get(url,timeout=35); r.raise_for_status(); return r
ns={'s':'http://www.sitemaps.org/schemas/sitemap/0.9'}
idx=ET.fromstring(get('https://mangfpt.vn/sitemap_index.xml').content)
maps=[x.text for x in idx.findall('s:sitemap/s:loc',ns)]
urls=[]
for sm in maps:
    root=ET.fromstring(get(sm).content)
    us=[x.text for x in root.findall('s:url/s:loc',ns)]
    print(sm,len(us),flush=True); urls.extend(us)
urls=list(dict.fromkeys(['https://mangfpt.vn/']+urls))
(OUT/'sitemap-urls.json').write_text(json.dumps(urls,ensure_ascii=False,indent=2))
print('TOTAL',len(urls),flush=True)
def fetch(u):
    try:
        r=get(u); p=Parse(); p.feed(r.text)
        slug=urlsplit(u).path.strip('/').replace('/','_') or 'home'
        txt=re.sub(r'\n\s*\n+','\n',''.join(p.parts))
        (OUT/(slug+'.txt')).write_text(txt)
        return {'url':u,'status':r.status_code,'title':' '.join(p.t),'headings':p.headings,'chars':len(txt),'file':slug+'.txt','links':list(dict.fromkeys(urljoin(u,x) for x in p.links))}
    except Exception as e: return {'url':u,'error':str(e)}
results=[]
with ThreadPoolExecutor(max_workers=5) as pool:
    tasks=[pool.submit(fetch,u) for u in urls]
    for f in as_completed(tasks):
        results.append(f.result())
        if len(results)%50==0: print('FETCHED',len(results),flush=True)
(OUT/'inventory.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print('DONE',len(results),'ERRORS',sum('error' in x for x in results),flush=True)
