'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const {compileProject,hash}=require('./build.cjs');
const anchor='MCowBQYDK2VwAyEAsyJJaZWan0xmCgBZGG7gBiQs0e4vX6NvPJIkQ8+Q/bk=';
const key=crypto.createPublicKey({key:Buffer.from(anchor,'base64'),format:'der',type:'spki'});
const kinds=['cn','global'].flatMap(c=>['user','meta'].map(k=>'pokecatch-helper-'+c+'.'+k+'.js'));
function verify(dir){
  const envelope=JSON.parse(fs.readFileSync(path.join(dir,'helper-release.json'))),data=Buffer.from(envelope.data,'base64');
  if(!crypto.verify(null,data,key,Buffer.from(envelope.sig,'base64')))throw Error('Invalid release signature');
  const m=JSON.parse(data);
  if(m.kind!=='pokecatch-helper-release'||m.channel!=='stable'||!/^\d+\.\d+\.\d+$/.test(m.version)||m.releaseId!=='helper-v'+m.version||!/^[a-f0-9]{40}$/.test(m.sourceCommit)||Object.keys(m.files).sort().join()!==[...kinds].sort().join())throw Error('Invalid release identity');
  for(const file of kinds){
    const b=fs.readFileSync(path.join(dir,file)),f=m.files[file];
    if(f.sha256!==hash(b)||f.size!==b.length)throw Error('Mismatch '+file);
    if(file.endsWith('.user.js')){
      const meta=fs.readFileSync(path.join(dir,file.replace('.user.js','.meta.js')));
      if(!b.subarray(0,meta.length).equals(meta)||hash(b.subarray(meta.length))!==m.bodyHash)throw Error('Common body mismatch');
    }
  }
  const sums=[...kinds,'helper-release.json'].map(f=>hash(fs.readFileSync(path.join(dir,f)))+'  '+f).join('\n')+'\n';
  if(fs.readFileSync(path.join(dir,'SHA256SUMS'),'utf8')!==sums)throw Error('Checksum index mismatch');
  if(hash(fs.readFileSync(path.join(dir,'CHANGELOG.md')))!==m.notesHash)throw Error('Release notes mismatch');
  return m;
}
function seal(dir,commit){
  const r=compileProject(),git=(...args)=>cp.execFileSync('git',['-C',r.workspace,...args],{encoding:'utf8',maxBuffer:20*1024*1024});
  if(!/^[a-f0-9]{40}$/.test(commit)||git('rev-parse','HEAD').trim()!==commit)throw Error('Freeze source at HEAD before signing');
  for(const i of r.inputs){if(hash(git('show',commit+':pokecatch-helper/'+i.file).replace(/\r\n/g,'\n'))!==i.sha256)throw Error('Uncommitted input '+i.file);}
  fs.mkdirSync(dir,{recursive:true});
  const notes=fs.readFileSync(path.join(r.project,'docs','release-notes.md'));
  const files={};for(const c of ['cn','global'])for(const k of ['user','meta']){
    const name='pokecatch-helper-'+c+'.'+k+'.js',text=r.variants[c][k];files[name]={sha256:hash(text),size:Buffer.byteLength(text)};
    fs.writeFileSync(path.join(dir,name),text);
  }
  const doc={kind:'pokecatch-helper-release',channel:'stable',version:r.version,releaseId:'helper-v'+r.version,sourceCommit:commit,bodyHash:hash(r.commonBody),notesHash:hash(notes),files};
  const data=Buffer.from(JSON.stringify(doc));
  const sig=crypto.sign(null,data,fs.readFileSync(process.env.POKECATCH_SIGNING_KEY));
  if(!crypto.verify(null,data,key,sig))throw Error('Unexpected production root');
  fs.writeFileSync(path.join(dir,'helper-release.json'),JSON.stringify({data:data.toString('base64'),sig:sig.toString('base64')})+'\n');
  fs.writeFileSync(path.join(dir,'CHANGELOG.md'),notes);
  fs.writeFileSync(path.join(dir,'SHA256SUMS'),[...kinds,'helper-release.json'].map(f=>hash(fs.readFileSync(path.join(dir,f)))+'  '+f).join('\n')+'\n');
  return verify(dir);
}
if(require.main===module){
 const [action,dir,commit]=process.argv.slice(2);if(!dir||!['verify','seal'].includes(action))throw Error('Expected verify or seal and release directory');
 const m=action==='seal'?seal(dir,commit):verify(dir);console.log(m.releaseId+' '+m.sourceCommit+' '+m.bodyHash);
}
module.exports={verify};
