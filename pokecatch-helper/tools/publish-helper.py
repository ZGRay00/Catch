"""Publish the locally sealed helper. Only the GitHub repository and COS helper prefix below are writable."""
import argparse, base64, hashlib, hmac, json, os, re, subprocess, time
from pathlib import Path
from urllib import request, parse, error

API='https://api.github.com/repos/ZGRay00/Catch'
RAW='https://raw.githubusercontent.com/ZGRay00/Catch/'
COS='https://catch-elite-sim-1426994854.cos.ap-guangzhou.myqcloud.com'
PREFIX='/updates/v1/helper/'
class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self,*args):return None
client=request.build_opener(NoRedirect)
def http(url,method='GET',body=None,headers=None,optional=False,public=False):
    req=request.Request(url,data=body,method=method,headers={'User-Agent':'Pokecatch-helper-release','Cache-Control':'no-cache',**(headers or {})})
    try:
        with (request.urlopen(req,timeout=50) if public else client.open(req,timeout=50)) as r:return r.read()
    except error.HTTPError as e:
        if optional and e.code==404:return None
        raise RuntimeError(f'{method} {parse.urlsplit(url).netloc}{parse.urlsplit(url).path} HTTP {e.code}') from None
def sha(b):return hashlib.sha256(b).hexdigest()
def git(*args):return subprocess.check_output(['git',*args],text=True,encoding='utf8').strip()
def github_token():
    if os.getenv('GH_TOKEN'):return os.environ['GH_TOKEN']
    p=subprocess.run(['git','credential','fill'],input='protocol=https\nhost=github.com\npath=ZGRay00/Catch.git\n\n',text=True,capture_output=True,env={**os.environ,'GIT_TERMINAL_PROMPT':'0','GCM_INTERACTIVE':'never'})
    for line in p.stdout.splitlines():
        if line.startswith('password='):return line.partition('=')[2]
    raise RuntimeError('GitHub publishing identity unavailable')
def cos_put(path,data,immutable):
    url=COS+PREFIX+path
    before=http(url,optional=True)
    if before==data:return
    if immutable and before is not None:raise ValueError('Immutable COS object differs: '+path)
    now=int(time.time());period=f'{now-60};{now+600}';host=parse.urlsplit(url).netloc
    headers={'host':host,'cache-control':'public,max-age=31536000,immutable' if immutable else 'no-cache','content-type':'text/javascript; charset=utf-8' if path.endswith('.js') else 'application/octet-stream','content-md5':base64.b64encode(hashlib.md5(data).digest()).decode()}
    if os.getenv('COS_SECURITY_TOKEN'):headers['x-cos-security-token']=os.environ['COS_SECURITY_TOKEN']
    if immutable:headers['x-cos-forbid-overwrite']='true'
    names=';'.join(sorted(headers));query='&'.join(k+'='+parse.quote(headers[k],safe='') for k in sorted(headers))
    message='put\n'+PREFIX+path+'\n\n'+query+'\n'
    mac=lambda k,s:hmac.new(k.encode(),s.encode(),'sha1').hexdigest()
    signature=mac(mac(os.environ['COS_SECRET_KEY'],period),'sha1\n'+period+'\n'+hashlib.sha1(message.encode()).hexdigest()+'\n')
    headers['Authorization']='q-sign-algorithm=sha1&q-ak='+os.environ['COS_SECRET_ID']+'&q-sign-time='+period+'&q-key-time='+period+'&q-header-list='+names+'&q-url-param-list=&q-signature='+signature
    http(url,'PUT',data,headers)
    if http(url)!=data:raise ValueError('COS readback failed: '+path)
def publish(args):
    version=args.version
    if not re.fullmatch(r'\d+\.\d+\.\d+',version) or not re.fullmatch('[a-f0-9]{40}',args.commit):raise ValueError('Invalid version or prepared commit')
    repo=Path.cwd();tag='helper-v'+version;folder='releases/'+tag+'/';root=repo/folder
    safe_env={k:v for k,v in os.environ.items() if k not in ('GH_TOKEN','COS_SECRET_ID','COS_SECRET_KEY','COS_SECURITY_TOKEN','POKECATCH_SIGNING_KEY')}
    subprocess.run(['node',str(Path(__file__).with_name('helper-release.cjs')),'verify',str(root)],check=True,env=safe_env)
    m=json.loads(base64.b64decode(json.loads((root/'helper-release.json').read_bytes())['data']))
    if git('rev-parse',args.commit+'^')!=m['sourceCommit'] or m['version']!=version:raise ValueError('Prepared release differs from signed source')
    names=[*m['files'],'helper-release.json','SHA256SUMS','CHANGELOG.md']
    aliases={'pokecatch-helper.user.js':'pokecatch-helper-global.user.js','pokecatch-helper.meta.js':'pokecatch-helper-global.meta.js','helper-release.json':'helper-release.json','Pokecatch自动助手.user.js':'pokecatch-helper-global.user.js'}
    for name,src in {**{folder+n:n for n in names},**aliases}.items():
        blob=subprocess.check_output(['git','show',args.commit+':'+name])
        if blob!=(root/src).read_bytes():raise ValueError('Release commit and sealed file differ: '+name)
    whitelist=set(aliases)|{folder+n for n in names}|{'README.md','安装说明.txt'}
    changed=set(git('-c','core.quotepath=false','diff','--name-only',m['sourceCommit'],args.commit).splitlines())
    if changed-whitelist:raise ValueError('Unexpected paths in promotion commit: '+str(changed-whitelist))
    token=github_token()
    auth={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}
    def api(path,method='GET',doc=None,optional=False):
        raw=http(API+path,method,json.dumps(doc).encode() if doc is not None else None,{**auth,'Content-Type':'application/json'},optional)
        return json.loads(raw) if raw else None
    receipt={'version':version,'sourceCommit':m['sourceCommit'],'releaseCommit':args.commit,'bodyHash':m['bodyHash'],'github':'pending','cos':'pending'}
    def save():args.receipt.write_text(json.dumps(receipt,indent=2),encoding='utf8')
    save();locked=False
    try:
        # A GitHub ref is atomically created for both CI and local recovery writers.
        api('/git/refs','POST',{'ref':'refs/heads/helper-publish-lock','sha':args.commit});locked=True
        head=api('/git/ref/heads/main')['object']['sha']
        advance=head==m['sourceCommit']
        if head!=args.commit and not advance:
            if api('/compare/'+args.commit+'...'+head+'?per_page=1')['status']!='ahead':raise ValueError('main changed; re-freeze before promotion')
            tree={r['path']:r['sha'] for r in api('/git/trees/'+head)['tree']}
            for name,src in aliases.items():
                b=(root/src).read_bytes();oid=hashlib.sha1(('blob '+str(len(b))+'\0').encode()+b).hexdigest()
                if tree.get(name)!=oid:raise ValueError('main now serves a different stable helper')

        old=http(COS+PREFIX+'pokecatch-helper.meta.js')
        current=re.search(rb'^//\s*@version\s+([\d.]+)',old,re.M)
        if not current:raise ValueError('Missing COS version')
        ver=lambda v:tuple(map(int,v.split('.')))
        if ver(current[1].decode())>ver(version):raise ValueError('COS already serves a newer version')
        if current[1].decode()==version and (old!=(root/'pokecatch-helper-cn.meta.js').read_bytes() or http(COS+PREFIX+'pokecatch-helper.user.js')!=(root/'pokecatch-helper-cn.user.js').read_bytes()):raise ValueError('Same-version COS conflict')
        previous=api('/git/ref/tags/'+tag,optional=True)
        if previous and previous['object']['sha']!=args.commit:raise ValueError('Release tag conflict')
        release=next((r for r in api('/releases?per_page=100') if r['tag_name']==tag),None)
        if not release:release=api('/releases','POST',{'tag_name':tag,'target_commitish':args.commit,'name':'PokéCatch 助手 '+version,'body':(root/'CHANGELOG.md').read_text('utf8'),'draft':True})
        existing={a['name']:a for a in api('/releases/'+str(release['id'])+'/assets')}
        for n in names:
            data=(root/n).read_bytes();asset=existing.get(n)
            if not asset:
                if not release['draft']:raise ValueError('Published release lacks '+n)
                url='https://uploads.github.com/repos/ZGRay00/Catch/releases/'+str(release['id'])+'/assets?name='+parse.quote(n)
                asset=json.loads(http(url,'POST',data,{**auth,'Content-Type':'application/octet-stream'}))
            if asset.get('digest')!='sha256:'+sha(data):raise ValueError('GitHub asset digest mismatch '+n)
        receipt['github']='prepared';save()
        for n in names:cos_put('releases/'+version+'/'+n,(root/n).read_bytes(),True)
        receipt['cos']='prepared';save()
        if release['draft']:api('/releases/'+str(release['id']),'PATCH',{'draft':False})
        if api('/git/ref/tags/'+tag)['object']['sha']!=args.commit:raise ValueError('Release tag mismatch')
        if advance:api('/git/refs/heads/main','PATCH',{'sha':args.commit,'force':False})
        receipt['github']='published';save()
        for n in ['user','meta']:cos_put('pokecatch-helper.'+n+'.js',(root/('pokecatch-helper-cn.'+n+'.js')).read_bytes(),False)
        cos_put('helper-release.json',(root/'helper-release.json').read_bytes(),False);receipt['cos']='verified';save()
        urls={RAW+'main/'+n:s for n,s in aliases.items() if n.isascii()}
        urls[RAW+tag+'/'+folder+'pokecatch-helper-global.user.js']='pokecatch-helper-global.user.js'
        for n in names:urls['https://github.com/ZGRay00/Catch/releases/download/'+tag+'/'+n]=n
        for url,n in urls.items():
            for delay in (0,2,5,10,25):
                if delay:time.sleep(delay)
                if http(url,public=True,optional=True)==(root/n).read_bytes():break
            else:raise ValueError('Public readback pending: '+n)
        receipt['github']='verified';save()
    except Exception as exc:
        receipt['error']=str(exc);save();raise
    finally:
        if locked:api('/git/refs/heads/helper-publish-lock','DELETE')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--version',required=True);p.add_argument('--commit',required=True);p.add_argument('--receipt',type=Path,required=True)
    publish(p.parse_args())
