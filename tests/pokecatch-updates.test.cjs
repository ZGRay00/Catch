const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const H=require('../Pokecatch自动助手.user.js'),sha='ab'.repeat(20);
const newerParts=H.VERSION.split('.').map(Number);newerParts[newerParts.length-1]++;const newer=newerParts.join('.');
const head={text:JSON.stringify({object:{sha}})},pinned=`https://raw.githubusercontent.com/ZGRay00/Catch/${sha}/pokecatch-helper.user.js`;
function release(version=H.VERSION,{name=H.UPDATE_RELEASE.name,namespace=H.UPDATE_RELEASE.namespace,match='https://pokecatch-online.netlify.app/*',body,runtime=version}={}){
    return `// ==UserScript==\n// @name ${name}\n// @namespace ${namespace}\n// @version ${version}\n// @match ${match}\n// ==/UserScript==\n${body??`(function () {\n'use strict';\nconst VERSION = '${runtime}';\nconst fixture = [${Array.from({length:35},(_,i)=>i).join(',')}];\nfunction mount(){const title='This code is never executed by the updater';return fixture.map(value=>value+title.length);} window.remoteExecuted = mount();\n})();`}`;
}
test('release metadata and runtime use the repository named by the user',()=>{
    const source=fs.readFileSync(path.join(__dirname,'../Pokecatch自动助手.user.js'),'utf8');
    assert.match(H.VERSION,/^\d+\.\d+\.\d+$/);assert.equal(H.parseUpdateScript(source).version,H.VERSION);
    assert.ok(source.includes('@updateURL    https://catch-elite-sim-1426994854.cos.ap-guangzhou.myqcloud.com/updates/v1/helper/pokecatch-helper.meta.js'));
    assert.ok(source.includes('@downloadURL  '+H.UPDATE_RELEASE.download));assert.equal(H.UPDATE_RELEASE.repository,'ZGRay00/Catch');
    for(const host of ['pokecatch-online.app','pokecatch-online.netlify.app','pokecatch-online.pages.dev'])assert.match(source,new RegExp(`^// @match\\s+https://${host.replaceAll('.','\\.')}/\\*$`,'m'));
    assert.ok(!source.includes('@connect      *'));
});
test('versions compare numerical segments and prereleases without precision loss',()=>{
    const compare=H.compareUpdateVersions;
    for(const [a,b]of [['3.1.10','3.1.2'],['3.2.0','3.2.0-beta.8'],['3.2.0-beta.10','3.2.0-beta.2'],['3.2.0-rc','3.2.0-beta'],['3.2.0-z','3.2.0-1'],['9007199254740993.0','9007199254740992.9']]){assert.equal(compare(a,b),1);assert.equal(compare(b,a),-1);}
    assert.equal(compare('3.2','3.2.0'),0);assert.equal(compare('3.2.0+abc','3.2.0+def'),0);
    for(const value of ['',null,'latest','3.x.0','v3.2.0','3.2.0-','3.2.0+','-1.2','3.2.0\n@match *'])assert.throws(()=>compare(value,'3.2.0'));
});
test('script validation accepts BOM, CRLF and each supported game hostname',()=>{
    for(const source of [release(), '\uFEFF'+release().replaceAll('\n','\r\n'), release(H.VERSION,{match:'https://pokecatch-online.pages.dev/*'}), release(H.VERSION,{match:'https://pokecatch-online.app/*'})])assert.equal(H.parseUpdateScript(source).version,H.VERSION);
    assert.throws(()=>H.parseUpdateScript(release(H.VERSION,{match:'https://pokecatch-online.app.example.test/*'})),/适用网址/);
});
test('script validation rejects HTML, wrong identities, missing metadata and truncated or metadata-only files',()=>{
    for(const source of ['', '<!doctype html><h1>404</h1>',release(newer,{name:'other'}),release(newer,{namespace:'other'}),release(newer,{match:'https://example.test/*'}),release().replace('// @version '+H.VERSION,'// @version latest'),release().replace('// @version '+H.VERSION,''),release().replace('// ==/UserScript==','// @description // ==/UserScript=='),release(newer,{runtime:H.VERSION}),release().slice(0,-4),release(newer,{body:''}),release(newer,{body:'// function temporary placeholder\n'.repeat(30)}),release(newer,{body:'/* const placeholder = function(){} */'.repeat(20)}),release(newer,{body:'/* unfinished comment'}),release().replace('// @version '+H.VERSION,'// @version '+H.VERSION+'\n// @version '+H.VERSION)])assert.throws(()=>H.parseUpdateScript(source));
});

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const nextVersion=version=>{const parts=version.split('.').map(Number);parts[parts.length-1]++;return parts.join('.');};

