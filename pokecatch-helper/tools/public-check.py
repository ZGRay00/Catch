"""Audit the public compatibility URLs, tag, Release and COS without credentials."""
import argparse,hashlib,json,os,subprocess,time
from pathlib import Path
from urllib import request,error
def audit(folder):
    subprocess.run(['node',str(Path(__file__).with_name('helper-release.cjs')),'verify',str(folder)],check=True)
    tag=folder.name;version=tag.removeprefix('helper-v');cos='https://catch-elite-sim-1426994854.cos.ap-guangzhou.myqcloud.com/updates/v1/helper/'
    raw='https://raw.githubusercontent.com/ZGRay00/Catch/';gh='https://github.com/ZGRay00/Catch/releases/download/'+tag+'/'
    urls={raw+'main/helper-release.json':'helper-release.json',cos+'helper-release.json':'helper-release.json'}
    for kind in ('user','meta'):
        name='pokecatch-helper.'+kind+'.js'
        for base,channel in ((raw+'main/','global'),(cos,'cn')):urls[base+name]='pokecatch-helper-'+channel+'.'+kind+'.js'
    for f in folder.iterdir():
        if f.is_file():urls[gh+f.name]=urls[cos+'releases/'+version+'/'+f.name]=f.name
    urls[raw+tag+'/releases/'+tag+'/pokecatch-helper-global.user.js']='pokecatch-helper-global.user.js'
    results={}
    for attempt in range(3):
        for url,f in urls.items():
            if results.get(url,{}).get('ok'):continue
            try:
                req=request.Request(url,headers={'User-Agent':'Pokecatch-release-readback','Cache-Control':'no-cache'})
                with request.urlopen(req,timeout=20) as response:body=response.read(5*1024*1024)
                results[url]={'ok':body==(folder/f).read_bytes(),'sha256':hashlib.sha256(body).hexdigest(),'size':len(body)}
            except (OSError,error.URLError) as exc:results[url]={'ok':False,'error':str(exc)[:160]}
        if all(row['ok'] for row in results.values()):break
        if attempt<2:time.sleep(8)
    return {'releaseId':tag,'urls':results,'verified':sum(r['ok'] for r in results.values()),'total':len(results)}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('folder',type=Path);p.add_argument('--output',type=Path);args=p.parse_args()
    result=audit(args.folder);s=json.dumps(result,indent=2);print(s,flush=True)
    if args.output:args.output.write_text(s,encoding='utf8')
    raise SystemExit(int(result['verified']!=result['total']))
