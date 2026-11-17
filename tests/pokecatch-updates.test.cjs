const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const H=require('../Pokecatch自动助手.user.js'),sha='ab'.repeat(20);
const newerParts=H.VERSION.split('.').map(Number);newerParts[newerParts.length-1]++;const newer=newerParts.join('.');
const head={text:JSON.stringify({object:{sha}})},pinned=`https://raw.githubusercontent.com/ZGRay00/Catch/${sha}/pokecatch-helper.user.js`;
function release(version=H.VERSION,{name=H.UPDATE_RELEASE.name,namespace=H.UPDATE_RELEASE.namespace,match='https://pokecatch-online.netlify.app/*',body,runtime=version}={}){
    return `// ==UserScript==\n// @name ${name}\n// @namespace ${namespace}\n// @version ${version}\n// @match ${match}\n// ==/UserScript==\n${body??`(function () {\n'use strict';\nconst VERSION = '${runtime}';\nconst fixture = [${Array.from({length:35},(_,i)=>i).join(',')}];\nfunction mount(){const title='This code is never executed by the updater';return fixture.map(value=>value+title.length);} window.remoteExecuted = mount();\n})();`}`;
}
function checker(script=release(newer),extra={}){
    const requests=[],opened=[],u=new H.UpdateChecker({request:async url=>{requests.push(url);return url.startsWith('https://api.github.com/')?head:{text:script,url};},open:url=>{opened.push(url);return true;},now:()=>1700000000000,...extra});
    return{u,requests,opened};
}
test('release metadata and runtime use the repository named by the user',()=>{
    const source=fs.readFileSync(path.join(__dirname,'../Pokecatch自动助手.user.js'),'utf8');
    assert.match(H.VERSION,/^\d+\.\d+\.\d+$/);assert.equal(H.parseUpdateScript(source).version,H.VERSION);
    assert.ok(source.includes('@updateURL    https://raw.githubusercontent.com/ZGRay00/Catch/main/pokecatch-helper.meta.js'));
    assert.ok(source.includes('@downloadURL  '+H.UPDATE_RELEASE.download));assert.equal(H.UPDATE_RELEASE.repository,'ZGRay00/Catch');
    assert.ok(!source.includes('@connect      *'));
});
test('update URLs permit only the fixed repository, file and branch or commit',()=>{
    for(const url of [H.UPDATE_RELEASE.head,H.UPDATE_RELEASE.download,pinned,pinned+'?fresh=1'])assert.equal(H.allowedUpdateURL(url),url);
    for(const url of ['javascript:alert(1)','http://raw.githubusercontent.com/ZGRay00/Catch/main/pokecatch-helper.user.js','https://raw.githubusercontent.com/other/Catch/main/pokecatch-helper.user.js','https://api.github.com/user','https://example.test/file.user.js','https://u:p@raw.githubusercontent.com/ZGRay00/Catch/main/pokecatch-helper.user.js','https://raw.githubusercontent.com/ZGRay00/Catch/main/other.user.js'])assert.throws(()=>H.allowedUpdateURL(url));
});
test('versions compare numerical segments and prereleases without precision loss',()=>{
    const compare=H.compareUpdateVersions;
    for(const [a,b]of [['3.1.10','3.1.2'],['3.2.0','3.2.0-beta.8'],['3.2.0-beta.10','3.2.0-beta.2'],['3.2.0-rc','3.2.0-beta'],['3.2.0-z','3.2.0-1'],['9007199254740993.0','9007199254740992.9']]){assert.equal(compare(a,b),1);assert.equal(compare(b,a),-1);}
    assert.equal(compare('3.2','3.2.0'),0);assert.equal(compare('3.2.0+abc','3.2.0+def'),0);
    for(const value of ['',null,'latest','3.x.0','v3.2.0','3.2.0-','3.2.0+','-1.2','3.2.0\n@match *'])assert.throws(()=>compare(value,'3.2.0'));
});
test('script validation accepts BOM, CRLF, either game hostname and actual matching runtime version',()=>{
    for(const source of [release(), '\uFEFF'+release().replaceAll('\n','\r\n'), release(H.VERSION,{match:'https://pokecatch-online.pages.dev/*'})])assert.equal(H.parseUpdateScript(source).version,H.VERSION);
});
test('script validation rejects HTML, wrong identities, missing metadata and truncated or metadata-only files',()=>{
    for(const source of ['', '<!doctype html><h1>404</h1>',release(newer,{name:'other'}),release(newer,{namespace:'other'}),release(newer,{match:'https://example.test/*'}),release().replace('// @version '+H.VERSION,'// @version latest'),release().replace('// @version '+H.VERSION,''),release().replace('// ==/UserScript==','// @description // ==/UserScript=='),release(newer,{runtime:H.VERSION}),release().slice(0,-4),release(newer,{body:''}),release(newer,{body:'// function temporary placeholder\n'.repeat(30)}),release(newer,{body:'/* const placeholder = function(){} */'.repeat(20)}),release(newer,{body:'/* unfinished comment'}),release().replace('// @version '+H.VERSION,'// @version '+H.VERSION+'\n// @version '+H.VERSION)])assert.throws(()=>H.parseUpdateScript(source));
});
test('new releases use the same pinned commit for verification and explicit installation',async()=>{
    const {u,requests,opened}=checker();assert.equal(u.busy,false);assert.equal(opened.length,0);assert.equal(u.install(),false);
    const latest=await u.check();assert.equal(latest.version,newer);assert.equal(requests.length,2);assert.equal(requests[1],pinned);assert.equal(u.pending.url,pinned);assert.equal(u.pending.commit,sha);assert.equal(opened.length,0);
    assert.equal(u.install(),true);assert.deepEqual(opened,[pinned]);assert.equal(u.busy,false);assert.equal(u.checkedAt,1700000000000);
});
test('equal and older remote releases are never offered as installable updates',async()=>{
    for(const version of [H.VERSION,'3.1.2']){const {u,opened}=checker(release(version));assert.ok(await u.check());assert.equal(u.pending,null);assert.equal(u.install(),false);assert.deepEqual(opened,[]);}
});
test('API failure falls back only to a fresh branch URL and installs that exact checked URL',async()=>{
    const requests=[],opened=[],u=new H.UpdateChecker({now:()=>12345,request:async url=>{requests.push(url);if(url.startsWith('https://api.github.com/'))throw Error('API unavailable');return{text:release(newer),url};},open:url=>{opened.push(url);return true;}});
    await u.check();assert.equal(requests.length,2);assert.equal(requests[1],H.UPDATE_RELEASE.download+'?_pokecatch_check=12345');assert.equal(u.pending.commit,null);assert.equal(u.install(),true);assert.equal(opened[0],requests[1]);
});
test('untrusted HEAD and response redirect information cannot select another host',async()=>{
    const requests=[],u=new H.UpdateChecker({request:async url=>{requests.push(url);if(url.startsWith('https://api.github.com/'))return{text:JSON.stringify({object:{sha:'https://evil.test'}})};return{text:release(newer),url:'https://evil.test/helper.user.js'};}});
    assert.equal(await u.check(),null);assert.equal(u.pending,null);assert.equal(u.busy,false);assert.match(u.message,/检查失败/);assert.ok(requests[1].startsWith(H.UPDATE_RELEASE.download+'?'));
});
test('concurrent clicks create one check and do not open the installer automatically',async()=>{
    let resolveHead;const requests=[],{u,opened}=checker(undefined,{request:async url=>{requests.push(url);if(url.startsWith('https://api.github.com/'))return new Promise(resolve=>{resolveHead=resolve;});return{text:release(newer)};}});
    const active=u.check();assert.equal(u.busy,true);assert.equal(await u.check(),null);assert.equal(requests.length,1);assert.equal(u.install(),false);resolveHead(head);await active;assert.equal(requests.length,2);assert.equal(u.busy,false);assert.deepEqual(opened,[]);
});
test('network and malformed-file errors release busy state and permit a later retry',async()=>{
    let failure='network';const {u}=checker(undefined,{request:async url=>{if(url.startsWith('https://api.github.com/'))return head;if(failure==='network')throw Error('fixture timeout');return{text:failure==='html'?'<html>bad</html>':release(newer)};}});
    assert.equal(await u.check(),null);assert.match(u.message,/fixture timeout/);assert.equal(u.busy,false);
    failure='html';assert.equal(await u.check(),null);assert.equal(u.pending,null);assert.equal(u.busy,false);
    failure='none';assert.ok(await u.check());assert.equal(u.pending.version,newer);
});
test('blocked or throwing installer keeps the verified release retryable',async()=>{
    let kind='blocked';const {u}=checker(undefined,{open:()=>{if(kind==='throw')throw Error('fixture opener');return kind==='open';}});await u.check();
    assert.equal(u.install(),false);assert.ok(u.pending);kind='throw';assert.equal(u.install(),false);assert.match(u.message,/fixture opener/);kind='open';assert.equal(u.install(),true);
});
test('updater has no storage or engine dependency and never evaluates the downloaded body',async()=>{
    let changes=0;global.remoteExecuted=undefined;const {u}=checker(undefined,{onChange:()=>changes++});await u.check();assert.equal(global.remoteExecuted,undefined);assert.equal(changes,2);assert.equal('storage'in u,false);assert.equal('engine'in u,false);delete global.remoteExecuted;
});
test('transport requests are anonymous, bounded and accept only successful whitelisted responses',async t=>{
    const previous=global.GM_xmlhttpRequest;t.after(()=>{if(previous===undefined)delete global.GM_xmlhttpRequest;else global.GM_xmlhttpRequest=previous;});
    let request;global.GM_xmlhttpRequest=details=>{request=details;queueMicrotask(()=>details.onload({status:200,responseText:'fixture',finalUrl:details.url}));return{abort(){}};};
    const result=await H.requestUpdateResource(pinned);assert.equal(result.text,'fixture');assert.equal(request.anonymous,true);assert.equal(request.timeout,12000);assert.equal(request.method,'GET');
    for(const callback of [d=>d.onload({status:404,responseText:'missing'}),d=>d.onload({status:200,responseText:'fixture',finalUrl:'https://evil.test/a'}),d=>d.ontimeout(),d=>d.onerror(),d=>d.onabort()]){global.GM_xmlhttpRequest=details=>{queueMicrotask(()=>callback(details));return{abort(){}};};await assert.rejects(H.requestUpdateResource(pinned));}
});
