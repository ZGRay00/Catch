const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),Module=require('node:module');
const {compileProject,hash}=require('../tools/build.cjs');
const r=compileProject(),keys=crypto.generateKeyPairSync('ed25519'),testKey=keys.publicKey.export({format:'der',type:'spki'}).toString('base64');
const target=new Module('synthetic-helper');
target._compile(r.script.replace('MCowBQYDK2VwAyEAsyJJaZWan0xmCgBZGG7gBiQs0e4vX6NvPJIkQ8+Q/bk=',testKey),'synthetic-helper.cjs');
const H=target.exports,files={};
for(const [c,pair] of Object.entries(r.variants))for(const [k,v] of Object.entries(pair))files['pokecatch-helper-'+c+'.'+k+'.js']={sha256:hash(v),size:Buffer.byteLength(v)};
const m={kind:'pokecatch-helper-release',channel:'stable',releaseId:'helper-v'+r.version,version:r.version,sourceCommit:'ac'.repeat(20),bodyHash:hash(r.commonBody),files};
function sign(doc){const b=Buffer.from(JSON.stringify(doc));return JSON.stringify({sig:crypto.sign(null,b,keys.privateKey).toString('base64'),data:b.toString('base64')});}
test('channel variants differ only in the two URLs; repeated builds give identical hashes',()=>{
 assert.equal(r.variants.global.user.slice(r.variants.global.meta.length),r.commonBody);
 const canonical=t=>t.replace(/^\/\/ @(updateURL|downloadURL).*$/gm,'');
 assert.equal(canonical(r.variants.global.user),canonical(r.variants.cn.user));assert.equal(compileProject().script,r.script);
 for(const p of Object.values(r.variants)){assert.equal(p.meta.match(/@updateURL/g).length,1);assert.equal(p.meta.match(/@downloadURL/g).length,1);}
});
for(const [name,online,first] of [['COS only','cos','auto'],['Raw only','github','auto'],['Global first','github','github'],['mirror only','jsdelivr','auto']])test(name,async()=>{
 const channel=first==='github'?'global':'cn';let opened;const seen=[],checker=new H.UpdateChecker({currentVersion:'1.0.0',open:u=>{opened=u;return true;},request:async u=>{
 seen.push(u);if(u===H.updateSourceURL(online))return sign(m);if(u===H.updateSourceURL(online,r.version,channel))return r.variants[channel].user;throw Error('offline');}});
 const result=await checker.check({sourceId:first});assert.ok(result,checker.message);assert.equal(checker.install(),true);assert.equal(opened,H.updateSourceURL(online,r.version,channel));assert.equal(seen.filter(s=>s.endsWith('.user.js')).length,1);
});
test('forged version, stale cache, corrupt payload, network loss and late completion preserve installed version',async()=>{
 for(const mode of ['forged','stale','corrupt','404','html','large']){
  let installs=0;const checker=new H.UpdateChecker({currentVersion:mode==='stale'?'999.0.0':'1.0.0',open:()=>++installs,request:async u=>{
   if(u.endsWith('json'))return mode==='forged'?JSON.stringify({...JSON.parse(sign(m)),data:Buffer.from(JSON.stringify({...m,version:'99.0.0'})).toString('base64')}):sign(m);
   if(mode==='404')throw Error('404');return mode==='large'?'x'.repeat(4194305):mode==='html'?'<html>':r.script+' ';
  }});await checker.check();assert.equal(checker.pending,null,mode);assert.equal(checker.install(),false);assert.equal(installs,0);
 }
 let finish;const checker=new H.UpdateChecker({request:()=>new Promise(ok=>{finish=ok;})});const pending=checker.check();checker.cancel();finish(sign(m));await pending;assert.equal(checker.phase,'cancelled');assert.equal(checker.pending,null);
});
test('strict paths and source timeouts',async()=>{
 const good=H.updateSourceURL('github',r.version);for(const bad of [good+'?token=x',good.replace('ZGRay00','other'),good.replace('https:','http:'),good.replace('global','unknown'),good.replace('raw.githubusercontent','rawXgithubusercontent')])assert.throws(()=>H.allowedUpdateURL(bad));
 assert.throws(()=>H.allowedUpdateRedirect(good,H.updateSourceURL('cos',r.version)));
 const c=new H.UpdateChecker({sourceTimeout:2,request:()=>new Promise(()=>{})});await c.check();assert.equal(c.busy,false);assert.equal(c.pending,null);
});

test('Global installation remains Global when only COS can transport the fixed body',async t=>{
 global.GM_info={script:{downloadURL:'https://raw.githubusercontent.com/ZGRay00/Catch/main/pokecatch-helper.user.js'}};t.after(()=>delete global.GM_info);
 let opened;const checker=new H.UpdateChecker({currentVersion:'1.0.0',open:u=>{opened=u;return true;},request:async u=>{
  if(u===H.updateSourceURL('cos'))return sign(m);if(u===H.updateSourceURL('cos',r.version,'global'))return r.variants.global.user;throw Error('offline');
 }});await checker.check();assert.equal(checker.install(),true);assert.equal(opened,H.updateSourceURL('cos',r.version,'global'));assert.match(checker.pending.text,/^\/\/ @updateURL\s+https:\/\/raw\.githubusercontent/m);
});
