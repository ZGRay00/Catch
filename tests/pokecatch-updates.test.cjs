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

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const nextVersion=version=>{const parts=version.split('.').map(Number);parts[parts.length-1]++;return parts.join('.');};

test('all four sources are fixed repository URLs and redirects must preserve the exact ref',()=>{
    assert.deepEqual(H.UPDATE_SOURCES.map(source=>source.id),['github','jsdelivr','fastly','gcore']);
    for(const source of H.UPDATE_SOURCES)for(const ref of ['main',sha])assert.equal(H.allowedUpdateURL(H.updateSourceURL(source.id,ref)),H.updateSourceURL(source.id,ref));
    for(const url of ['https://raw.githubusercontent.com:444/ZGRay00/Catch/main/pokecatch-helper.user.js','https://cdn.jsdelivr.net:444/gh/ZGRay00/Catch@main/pokecatch-helper.user.js','https://cdn.jsdelivr.net/gh/other/Catch@main/pokecatch-helper.user.js','https://fastly.jsdelivr.net/gh/ZGRay00/Catch@latest/pokecatch-helper.user.js','https://u:p@gcore.jsdelivr.net/gh/ZGRay00/Catch@main/pokecatch-helper.user.js','https://gcore.jsdelivr.net/gh/ZGRay00/Catch@main/other.user.js'])assert.throws(()=>H.allowedUpdateURL(url));
    assert.equal(H.allowedUpdateRedirect(pinned,H.updateSourceURL('fastly',sha)),H.updateSourceURL('fastly',sha));
    for(const url of [H.updateSourceURL('github','main'),H.updateSourceURL('gcore','cd'.repeat(20)),H.UPDATE_RELEASE.head])assert.throws(()=>H.allowedUpdateRedirect(pinned,url));
    assert.throws(()=>H.updateSourceURL('custom'));assert.throws(()=>H.updateSourceURL('github','latest'));
});

test('new releases verify all four immutable mirrors and installation uses the successful pinned URL',async()=>{
    const {u,requests,opened}=checker();assert.equal(u.install(),false);assert.equal(u.download(),false);
    const latest=await u.check();assert.equal(latest.version,newer);assert.equal(requests.length,5);
    assert.deepEqual(requests.slice(1),H.UPDATE_SOURCES.map(source=>H.updateSourceURL(source.id,sha)));
    assert.equal(u.pending.url,pinned);assert.equal(u.pending.commit,sha);assert.equal(u.pending.text,release(newer));assert.equal(opened.length,0);
    assert.equal(u.sourceResults.length,5);assert.ok(u.sourceResults.every(row=>row.state==='success'&&row.ms>=0));
    assert.equal(u.install(),true);assert.deepEqual(opened,[pinned]);assert.equal(u.checkedAt,1700000000000);
});

test('Raw failure cannot block a valid CDN at the same pinned commit',async()=>{
    const requests=[],{u}=checker(undefined,{request:async url=>{requests.push(url);if(url.startsWith('https://api.github.com/'))return head;if(url.startsWith('https://raw.githubusercontent.com/'))throw Error('raw unreachable');return{text:release(newer),url};}});
    assert.ok(await u.check());assert.equal(u.pending.sourceId,'jsdelivr');assert.equal(u.pending.commit,sha);assert.equal(requests.length,5);
    assert.ok(requests.slice(1).every(url=>url.includes(sha)));assert.equal(u.sourceResults.find(row=>row.id==='github').state,'error');
});

test('different versions or bodies at one pinned commit fail explicitly without hiding the conflict behind branch fallback',async()=>{
    for(const sameVersion of [false,true]){
        const requests=[],u=new H.UpdateChecker({request:async url=>{
            requests.push(url);if(url.startsWith('https://api.github.com/'))return head;
            const script=url.startsWith(H.UPDATE_SOURCES[0].base)?release(H.VERSION):sameVersion?release(H.VERSION).replace('const fixture = [','const changedFixture = ['):release('3.1.2');
            return{text:script,url};
        }});
        assert.equal(await u.check(),null);assert.equal(u.pending,null);assert.equal(u.busy,false);assert.equal(requests.length,5);
        assert.equal(u.sourceResults.filter(row=>row.state==='conflict').length,4);assert.equal(u.phase,'error');
        assert.equal(u.install(),false);assert.equal(u.download(),false);
        assert.ok(await u.check({sourceId:'github'}),'An explicit single-source choice can be reviewed independently');assert.equal(requests.length,7);
    }
});

test('only complete pinned failure permits a parallel branch fallback and the highest valid version wins',async()=>{
    const requests=[],highest=nextVersion(newer),u=new H.UpdateChecker({request:async url=>{requests.push(url);if(url.startsWith('https://api.github.com/'))return head;if(url.includes(sha))throw Error('pinned unavailable');const id=H.UPDATE_SOURCES.find(source=>url.startsWith(source.base)).id;return{text:release(id==='gcore'?highest:id==='github'?H.VERSION:newer),url};},now:()=>12345});
    const latest=await u.check();assert.equal(latest.version,highest);assert.equal(requests.length,9);assert.equal(u.pending.commit,null);assert.equal(u.pending.sourceId,'gcore');
    assert.ok(requests.slice(5).every(url=>url.includes('main')&&url.endsWith('?_pokecatch_check=12345')));assert.ok(u.pending.text.includes(highest));
});

test('an unavailable API and stale first CDN do not hide a newer mirror response',async()=>{
    const highest=nextVersion(newer),requests=[],u=new H.UpdateChecker({request:async url=>{requests.push(url);if(url.startsWith('https://api.github.com/'))throw Error('API down');const id=H.UPDATE_SOURCES.find(source=>url.startsWith(source.base)).id;return{text:release(id==='fastly'?highest:id==='gcore'?newer:H.VERSION),url};}});
    assert.equal((await u.check()).version,highest);assert.equal(requests.length,5);assert.equal(u.pending.sourceId,'fastly');assert.equal(u.pending.commit,null);
    assert.equal(u.sourceResults.find(row=>row.id==='head').state,'error');
});

test('manual source selection still pins its commit and never contacts other script mirrors',async()=>{
    const {u,requests}=checker();assert.ok(await u.check({sourceId:'gcore'}));assert.equal(requests.length,2);assert.equal(requests[1],H.updateSourceURL('gcore',sha));assert.equal(u.pending.sourceId,'gcore');
    assert.deepEqual(u.sourceResults.filter(row=>row.state==='skipped').map(row=>row.id),['github','jsdelivr','fastly']);
    const count=requests.length;assert.equal(await u.check({sourceId:'evil'}),null);assert.equal(requests.length,count);
});

test('same or older releases are never offered and malformed script mirrors fail independently',async()=>{
    for(const version of [H.VERSION,'3.1.2']){const {u,opened}=checker(release(version));assert.ok(await u.check());assert.equal(u.pending,null);assert.equal(u.install(),false);assert.deepEqual(opened,[]);}
    const u=new H.UpdateChecker({request:async url=>{if(url.startsWith('https://api.github.com/'))return head;const id=H.UPDATE_SOURCES.find(source=>url.startsWith(source.base)).id;return{text:id==='github'?'<html>bad</html>':id==='jsdelivr'?release(newer,{namespace:'wrong'}):id==='fastly'?release(newer,{runtime:H.VERSION}):release(newer),url};}});
    assert.ok(await u.check());assert.equal(u.pending.sourceId,'gcore');assert.equal(u.sourceResults.filter(row=>row.state==='error').length,3);
});

test('malicious redirects and invalid HEAD values cannot select another repository, file or ref',async()=>{
    const u=new H.UpdateChecker({request:async url=>url.startsWith('https://api.github.com/')?{text:JSON.stringify({object:{sha:'https://evil.test'}})}:{text:release(newer),url:'https://evil.test/helper.user.js'}});
    assert.equal(await u.check(),null);assert.equal(u.pending,null);assert.equal(u.busy,false);
    const other=new H.UpdateChecker({request:async url=>url.startsWith('https://api.github.com/')?head:{text:release(newer),url:H.updateSourceURL('github',url.includes(sha)?'main':sha)}});
    assert.equal(await other.check(),null);assert.equal(other.pending,null);assert.equal(other.sourceResults.filter(row=>row.state==='error').length,4);
});

test('concurrent checks create one request batch and never open the installer',async()=>{
    let resolveHead;const requests=[],{u,opened}=checker(undefined,{request:async url=>{requests.push(url);if(url.startsWith('https://api.github.com/'))return new Promise(resolve=>{resolveHead=resolve;});return{text:release(newer),url};}});
    const active=u.check();assert.equal(u.busy,true);assert.equal(await u.check(),null);assert.equal(requests.length,1);assert.equal(u.install(),false);
    resolveHead(head);await active;assert.equal(requests.length,5);assert.equal(u.busy,false);assert.deepEqual(opened,[]);
});

test('cancel aborts an active HEAD, permits a new check and ignores the previous late response',async()=>{
    const heads=[],u=new H.UpdateChecker({request:(url,options)=>url.startsWith('https://api.github.com/')?new Promise(resolve=>heads.push({resolve,signal:options.signal})):Promise.resolve({text:release(newer),url})});
    const old=u.check();assert.equal(u.cancel(),true);assert.equal(heads[0].signal.aborted,true);assert.equal(u.busy,false);assert.equal(u.phase,'cancelled');assert.equal(await old,null);
    const next=u.check();heads[1].resolve(head);await next;const pending=u.pending;
    heads[0].resolve({text:JSON.stringify({object:{sha:'cd'.repeat(20)}})});await tick();assert.equal(u.pending,pending);assert.equal(u.busy,false);assert.equal(u.cancel(),false);
});

test('cancel aborts all in-flight pinned mirrors and cannot start a branch fallback',async()=>{
    const sources=[],u=new H.UpdateChecker({request:(url,options)=>url.startsWith('https://api.github.com/')?Promise.resolve(head):new Promise(resolve=>sources.push({resolve,url,signal:options.signal}))});
    const active=u.check();await tick();assert.equal(sources.length,4);u.cancel();assert.ok(sources.every(source=>source.signal.aborted));assert.equal(await active,null);
    for(const source of sources)source.resolve({text:release(newer),url:source.url});await tick();assert.equal(sources.length,4);assert.equal(u.pending,null);assert.ok(u.sourceResults.filter(row=>row.id!=='head').every(row=>row.state==='cancelled'));
});

test('each mirror has an independent bounded deadline and all branch requests start together',async()=>{
    const calls=[],u=new H.UpdateChecker({headTimeout:5,sourceTimeout:20,request:(url,options)=>{calls.push({url,...options});return new Promise(()=>{});}});
    assert.equal(await u.check(),null);assert.equal(calls.length,5);assert.equal(calls[0].timeout,5);assert.ok(calls.slice(1).every(call=>call.timeout===20&&call.signal.aborted));assert.ok(u.sourceResults.every(row=>row.state==='timeout'));assert.equal(u.busy,false);
    const defaults=new H.UpdateChecker();assert.equal(defaults.headTimeout,4000);assert.equal(defaults.sourceTimeout,9000);
});

test('installer and verified snapshot download remain retryable without refetching or evaluating',async()=>{
    let openResult=false,downloadResult=false;const downloads=[],{u,requests,opened}=checker(undefined,{open:url=>{if(openResult==='throw')throw Error('blocked opener');if(openResult)opened.push(url);return openResult;},download:(text,name)=>{downloads.push({text,name});if(downloadResult==='throw')throw Error('blocked download');return downloadResult;}});
    await u.check();const count=requests.length;assert.equal(u.install(),false);openResult='throw';assert.equal(u.install(),false);assert.ok(u.pending);
    openResult=true;assert.equal(u.install(),true);assert.equal(u.download(),false);downloadResult='throw';assert.equal(u.download(),false);downloadResult=true;assert.equal(u.download(),true);
    assert.equal(requests.length,count);assert.equal(opened[0],pinned);assert.ok(downloads.every(file=>file.text===release(newer)&&file.name===`pokecatch-helper-${newer}.user.js`));
    assert.equal(global.remoteExecuted,undefined);
});

test('cached script and metadata version must still agree at installation or download',async()=>{
    const {u}=checker();await u.check();const valid=u.pending.text;u.pending.text=release(newer,{runtime:H.VERSION});assert.equal(u.install(),false);assert.equal(u.download(),false);u.pending.text=valid;u.pending.version=H.VERSION;assert.equal(u.install(),false);
});

test('all-source failure releases busy state and a new check can succeed',async()=>{
    let broken=true;const {u}=checker(undefined,{request:async url=>{if(url.startsWith('https://api.github.com/'))return head;if(broken)throw Error('network down');return{text:release(newer),url};}});
    assert.equal(await u.check(),null);assert.equal(u.busy,false);assert.equal(u.pending,null);broken=false;assert.ok(await u.check());assert.equal(u.pending.version,newer);
});

test('updater has no storage or engine dependency and never evaluates remote content',async()=>{
    let changes=0;delete global.remoteExecuted;const {u}=checker(undefined,{onChange:()=>changes++});await u.check();assert.equal(global.remoteExecuted,undefined);assert.ok(changes>5);assert.equal('storage'in u,false);assert.equal('engine'in u,false);
});

test('transport is anonymous, bounded, cancellable and rejects unsafe or wrong-ref redirects',async t=>{
    const previous=global.GM_xmlhttpRequest;t.after(()=>{if(previous===undefined)delete global.GM_xmlhttpRequest;else global.GM_xmlhttpRequest=previous;});
    let request,aborts=0;global.GM_xmlhttpRequest=details=>{request=details;queueMicrotask(()=>details.onload({status:200,responseText:'fixture',finalUrl:details.url}));return{abort(){aborts++;details.onabort();}};};
    const result=await H.requestUpdateResource(pinned);assert.equal(result.text,'fixture');assert.equal(request.anonymous,true);assert.equal(request.timeout,9000);assert.equal(request.method,'GET');
    for(const callback of [d=>d.onload({status:404,responseText:'missing'}),d=>d.onload({status:200,responseText:'fixture',finalUrl:'https://evil.test/a'}),d=>d.onload({status:200,responseText:'fixture',finalUrl:H.UPDATE_RELEASE.download}),d=>d.ontimeout(),d=>d.onerror(),d=>d.onabort()]){global.GM_xmlhttpRequest=details=>{queueMicrotask(()=>callback(details));return{abort(){}};};await assert.rejects(H.requestUpdateResource(pinned));}
    const controller=new AbortController();global.GM_xmlhttpRequest=details=>({abort(){aborts++;details.onabort();}});const pending=H.requestUpdateResource(pinned,{signal:controller.signal,timeout:40});controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(aborts,1);
});

test('default snapshot download writes exactly the verified JavaScript without running it',async t=>{
    const original={document:global.document,setTimeout:global.setTimeout,create:URL.createObjectURL,revoke:URL.revokeObjectURL};let blob,clicked=false,removed=false,revoked=false,later;
    t.after(()=>{if(original.document===undefined)delete global.document;else global.document=original.document;global.setTimeout=original.setTimeout;URL.createObjectURL=original.create;URL.revokeObjectURL=original.revoke;});
    const anchor={style:{},click(){clicked=true;},remove(){removed=true;}};global.document={createElement:()=>anchor,body:{appendChild(){}}};URL.createObjectURL=value=>{blob=value;return'blob:offline-verified';};URL.revokeObjectURL=()=>{revoked=true;};global.setTimeout=fn=>{later=fn;return 0;};
    assert.equal(H.downloadUpdateScript(release(newer),'verified.user.js'),true);assert.equal(anchor.download,'verified.user.js');assert.equal(clicked,true);assert.equal(removed,true);assert.equal(await blob.text(),release(newer));later();assert.equal(revoked,true);assert.equal(global.remoteExecuted,undefined);
});
