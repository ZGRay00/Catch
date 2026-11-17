'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const {compileProject,build,validateData,localFile}=require('../tools/build.cjs');
const {extractJSON}=require('../tools/import-legacy.cjs');
const {zip,crc32,collectFiles}=require('../tools/package.cjs');
function fixture(t){
  const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'pokecatch-build-')),project=path.join(workspace,'pokecatch-helper');fs.mkdirSync(project);
  t.after(()=>fs.rmSync(workspace,{recursive:true,force:true}));
  const put=(name,content)=>{const file=path.join(project,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof content==='string'?content:JSON.stringify(content));};
  const data={layout:6,mons:[{id:1,name:'test',types:['normal'],stats:{hp:1,atk:1,def:1,spa:1,spd:1,spe:1},learn:[[1,'tackle']]}],chapters:[{id:0,name:'test'}],chart:{},combat:{}};
  put('package.json',{version:'4.0.0'});put('userscript.header.txt','// ==UserScript==\n// @name test\n// @version {{VERSION}}\n// ==/UserScript==\n');
  put('src/bootstrap.js',"(function () {\n    'use strict';\n    const VERSION = '{{VERSION}}';\n");put('data/game.json',data);put('data/evolution.json',{rules:{}});
  put('src/runtime.js',"\n    if (typeof module === 'object' && module.exports && typeof document === 'undefined') { module.exports = { DATA, VERSION }; return; }\n    function mount() {}\n    mount();\n})();\n");
  const manifest={schema:1,header:'userscript.header.txt',entries:[{kind:'source',file:'src/bootstrap.js'},{kind:'json',file:'data/game.json',constant:'DATA'},{kind:'json',file:'data/evolution.json',constant:'EVOLUTION_DATA'},{kind:'source',file:'src/runtime.js'}]};
  put('build.manifest.json',manifest);return{workspace,project,put,data,manifest};
}
test('build is deterministic and propagates one package version to all outputs',t=>{
  const f=fixture(t),a=compileProject(f.project),b=compileProject(f.project);assert.equal(a.script,b.script);assert.equal(a.info,b.info);
  assert.match(a.script,/const VERSION = '4\.0\.0'/);assert.match(a.meta,/@version 4\.0\.0/);assert.equal(a.script.match(/^    mount\(\);$/gm).length,1);
  build({projectRoot:f.project,quiet:true});assert.doesNotThrow(()=>build({projectRoot:f.project,check:true,quiet:true}));
  const file=path.join(f.workspace,'Pokecatch自动助手.user.js'),before=fs.readFileSync(file);f.put('src/runtime.js',fs.readFileSync(path.join(f.project,'src/runtime.js'),'utf8')+'\n// changed\n');
  assert.throws(()=>build({projectRoot:f.project,check:true,quiet:true}),/artifacts differ/);assert.deepEqual(fs.readFileSync(file),before);
});
test('manifest rejects traversal, duplicates, missing modules and damaged startup hooks',t=>{
  const f=fixture(t);assert.throws(()=>localFile(f.project,'../secret'),/escapes/);
  f.manifest.entries.push(f.manifest.entries[0]);f.put('build.manifest.json',f.manifest);assert.throws(()=>compileProject(f.project),/Duplicate module/);
  f.manifest.entries.pop();f.manifest.entries[0].file='src/missing.js';f.put('build.manifest.json',f.manifest);assert.throws(()=>compileProject(f.project),/ENOENT/);
  f.manifest.entries[0].file='src/bootstrap.js';f.put('build.manifest.json',f.manifest);f.put('src/runtime.js',"\nmodule.exports = {}; const value = typeof document === 'undefined';\n})();\n");assert.throws(()=>compileProject(f.project),/mount hook/);
});
test('data schema rejects duplicate ids, malformed learnsets and invalid stats',t=>{
  const {data}=fixture(t);assert.doesNotThrow(()=>validateData('DATA',data));
  assert.throws(()=>validateData('DATA',{...data,mons:[...data.mons,...data.mons]}),/duplicate species/);
  assert.throws(()=>validateData('DATA',{...data,mons:[{...data.mons[0],learn:[[1,7]]}]}),/learn list/);
  assert.throws(()=>validateData('DATA',{...data,mons:[{...data.mons[0],stats:{}}]}),/base stats/);
  assert.throws(()=>validateData('EVOLUTION_DATA',{rules:[]}),/rule map/);
  const weather={schema:2,slotMs:3600000,chance:.54,types:{rain:{}},chapters:[{id:0,pools:{}}],tables:[[[1,1]]],dailySpots:[]};assert.doesNotThrow(()=>validateData('WEATHER_DATA',weather));
  assert.throws(()=>validateData('WEATHER_DATA',{...weather,schema:1}),/schema 2/);assert.throws(()=>validateData('WEATHER_DATA',{...weather,dailySpots:[{share:2,zones:[]}]}),/daily spot/);
});
test('JSON extraction handles nested braces and escaped strings without executing code',()=>{
  const object={nested:{text:'brace } and escaped " quote \\'},rows:[{value:1}]},source='    const DATA = '+JSON.stringify(object)+';\nnext();';
  const result=extractJSON(source,0,'DATA');assert.deepEqual(result.data,object);assert.equal(source.slice(result.end),'\nnext();');
  assert.throws(()=>extractJSON('    const DATA = {"value":(()=>7)()};',0,'DATA'),SyntaxError);
});
test('ZIP writer is byte stable, has correct CRC, and rejects unsafe names',()=>{
  const a=zip(new Map([['sample/中文.txt','hello'],['sample/a.json','{}']])),b=zip(new Map([['sample/a.json','{}'],['sample/中文.txt','hello']]));assert.deepEqual(a,b);assert.equal(crc32(Buffer.from('123456789')),0xcbf43926);
  assert.equal(a.readUInt32LE(0),0x04034b50);const size=a.readUInt32LE(18),nameLength=a.readUInt16LE(26),start=30+nameLength;assert.deepEqual(zlib.inflateRawSync(a.subarray(start,start+size)),Buffer.from('{}'));
  assert.throws(()=>zip([['../secret','x']]),/Unsafe/);assert.throws(()=>zip([['a','x'],['a','y']]),/Duplicate/);
});
test('package allowlist excludes unrelated scripts, reference plugins, archives and saves',t=>{
  const f=fixture(t);for(const name of ['README.md','ARCHITECTURE.md'])f.put(name,'docs');for(const name of ['build.cjs','package.cjs','test.cjs'])f.put('tools/'+name,'// tool');
  f.put('dist/personal-save.json','secret');f.put('dist/old.zip','secret');f.put('reference-plugin.js','secret');f.put('.git/config','secret');f.put('extension/manifest.json','{}');
  build({projectRoot:f.project,quiet:true});fs.mkdirSync(path.join(f.workspace,'tests'));fs.writeFileSync(path.join(f.workspace,'tests/pokecatch-example.test.cjs'),'// regression');fs.writeFileSync(path.join(f.workspace,'tests/aether-secret.cjs'),'secret');
  const files=collectFiles(f.project,'4.0.0'),names=[...files.keys()];assert.ok(names.some(name=>name.endsWith('/extension/manifest.json')));assert.ok(names.some(name=>name.endsWith('/tests/pokecatch-example.test.cjs')));
  assert.ok(names.every(name=>!/(personal-save|old\.zip|reference-plugin|\.git|aether-secret)/.test(name)));assert.deepEqual(zip(files),zip(collectFiles(f.project,'4.0.0')));
});
