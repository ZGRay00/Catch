// Run from a reviewed, clean Catch checkout. Only helper distribution files enter the promotion commit.
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const project=path.resolve(__dirname,'..'),repo=path.dirname(project);
const run=(exe,args,cwd=repo,env=process.env)=>cp.execFileSync(exe,args,{cwd,env,stdio:'inherit'});
const git=(...args)=>cp.execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();
function start(version,mode){
 if(!/^\d+\.\d+\.\d+$/.test(version)||!['cloud','local','check'].includes(mode))throw Error('Usage: node pokecatch-helper/tools/start-release.cjs VERSION [cloud|local|check]');
 if(!/^(?:https:\/\/github\.com\/|git@github\.com:)ZGRay00\/Catch(?:\.git)?$/i.test(git('remote','get-url','origin')))throw Error('Expected the Catch repository');
 if(git('status','--porcelain'))throw Error('Review and commit outstanding changes first');
 run('git',['fetch','origin','main']);const source=git('rev-parse','FETCH_HEAD');
 if(git('rev-parse','HEAD')!==source)throw Error('Review current origin/main before releasing');
 const build=require('./build.cjs').compileProject();
 if(build.version!==version)throw Error('Package version differs from requested version');
 const tag='helper-v'+version,folder='releases/'+tag,stable=path.join(repo,folder);
 if(fs.existsSync(stable)){
   const m=require('./helper-release.cjs').verify(stable);
   if(m.version!==version||Object.entries(build.variants).some(([c,p])=>Object.entries(p).some(([k,v])=>fs.readFileSync(path.join(stable,'pokecatch-helper-'+c+'.'+k+'.js'),'utf8')!==v)))throw Error('Use a higher version for changed bytes');
   console.log('Sealed helper already on main. Public readback only.');
   const args=[path.join(__dirname,'public-check.py'),stable];
   if(process.platform==='win32')run('python',['-I','-c',"from pip._vendor import truststore;truststore.inject_into_ssl();import runpy,sys;p=sys.argv.pop(1);runpy.run_path(p,run_name='__main__')",...args]);else run('python3',['-I',...args]);
   return;
 }
 if(mode==='check'){console.log('Ready to freeze '+source);return;}
 const branch='helper-prepared/'+version,parent=process.env.POKECATCH_BUILD_ROOT||'F:/Pokecatch-Release-Work/helper-preparation';
 fs.mkdirSync(parent,{recursive:true});const tmp=fs.mkdtempSync(path.join(parent,'prepare-')),tree=path.join(tmp,'checkout');
 const existing=git('ls-remote','--heads','origin','refs/heads/'+branch).split(/\s+/)[0];
 if(existing){run('git',['fetch','origin','refs/heads/'+branch]);if(git('rev-parse','FETCH_HEAD^')!==source)throw Error('Prepared branch belongs to a different source commit');}
 run('git',['worktree','add','--detach',tree,existing||source]);
 const env={...process.env};for(const k of ['POKECATCH_SIGNING_KEY','COS_SECRET_ID','COS_SECRET_KEY','GH_TOKEN','COS_SECURITY_TOKEN'])delete env[k];
 try{
  const out=path.join(tree,folder);
  if(!existing){
    run(process.execPath,['pokecatch-helper/tools/build.cjs'],tree,env);run(process.execPath,['pokecatch-helper/tools/test.cjs'],tree,env);
    run(process.execPath,['pokecatch-helper/tools/helper-release.cjs','seal',out,source],tree,{...env,POKECATCH_SIGNING_KEY:process.env.POKECATCH_SIGNING_KEY||'F:/Pokecatch-Release-Secrets/production-private.pem'});
    const links={'pokecatch-helper.user.js':'pokecatch-helper-global.user.js','Pokecatch自动助手.user.js':'pokecatch-helper-global.user.js','pokecatch-helper.meta.js':'pokecatch-helper-global.meta.js','helper-release.json':'helper-release.json','安装说明.txt':'CHANGELOG.md'};
    for(const [dest,src] of Object.entries(links))fs.copyFileSync(path.join(out,src),path.join(tree,dest));
    const readme=path.join(tree,'README.md');fs.writeFileSync(readme,fs.readFileSync(readme,'utf8').replace(/当前版本 \*\*[\d.]+\*\*/, '当前版本 **'+version+'**').replace(/\[[\d.]+ 正式发行与校验文件\]\(https:\/\/github\.com\/ZGRay00\/Catch\/releases\/tag\/helper-v[\d.]+\)/,'['+version+' 正式发行与校验文件](https://github.com/ZGRay00/Catch/releases/tag/'+tag+')'));
    run('git',['add','--',folder,...Object.keys(links),'README.md'],tree);
    run('git',['commit','-m','Seal '+tag],tree);run('git',['push','origin','HEAD:refs/heads/'+branch],tree);
  }
  const commit=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:tree,encoding:'utf8'}).trim();
  if(mode==='cloud'){
    run(process.platform==='win32'?'python':'python3',['-I',path.join(__dirname,'dispatch-helper.py'),version,commit],tree);
  }else{
    const wrapper=process.env.POKECATCH_LOCAL_RELEASE_PS1;if(!wrapper||!path.isAbsolute(wrapper))throw Error('Set POKECATCH_LOCAL_RELEASE_PS1 to your reviewed local.ps1 publisher path');
    run('powershell.exe',['-NoProfile','-ExecutionPolicy','RemoteSigned','-File',wrapper,'-Action','PublishHelper','-OutputDirectory',tmp,'-HelperVersion',version,'-HelperCommit',commit,'-HelperCheckout',tree],tree);
  }
 }finally{console.log('Preparation and recovery directory: '+tmp);}
}
try{start(process.argv[2],process.argv[3]||'cloud');}catch(e){console.error(e.message);process.exitCode=1;}
