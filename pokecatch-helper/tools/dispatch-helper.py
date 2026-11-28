"""Submit a single reviewed promotion to the protected environment, using the existing GitHub login."""
import json,os,re,runpy,sys
from pathlib import Path
if os.name=='nt':
    from pip._vendor import truststore
    truststore.inject_into_ssl()
version,commit=sys.argv[1:]
if not re.fullmatch(r'\d+\.\d+\.\d+',version) or not re.fullmatch('[a-f0-9]{40}',commit):raise ValueError('Invalid release parameters')
pub=runpy.run_path(str(Path(__file__).with_name('publish-helper.py')))
headers={'Authorization':'Bearer '+pub['github_token'](),'Content-Type':'application/json'}
def get(path):return json.loads(pub['http'](pub['API']+path,headers=headers))
env='/environments/helper-production'
if get('/actions/variables/HELPER_CI_RELEASE_ENABLED')['value']!='true':raise ValueError('Protected publishing disabled')
if not any(r['type']=='required_reviewers' for r in get(env)['protection_rules']):raise ValueError('Missing required environment reviewer')
if {(p['name'],p.get('type','branch')) for p in get(env+'/deployment-branch-policies')['branch_policies']}!={('main','branch')}:raise ValueError('Expected main-only environment')
if not {'COS_SECRET_ID','COS_SECRET_KEY'}.issubset(s['name'] for s in get(env+'/secrets')['secrets']):raise ValueError('Configure the two COS environment secrets before cloud publication')
if get('/git/ref/heads/helper-prepared/'+version)['object']['sha']!=commit:raise ValueError('Prepared branch differs')
payload={'ref':'main','inputs':{'version':version,'prepared':commit}}
pub['http'](pub['API']+'/actions/workflows/pokecatch-helper.yml/dispatches','POST',json.dumps(payload).encode(),headers)
print('Promotion submitted: https://github.com/ZGRay00/Catch/actions/workflows/pokecatch-helper.yml')
