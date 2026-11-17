'use strict';
// One-time migration of OUR existing userscript, not an importer/executor for third-party plugins.
const fs=require('node:fs'),path=require('node:path');
const {read,localFile,validateData}=require('./build.cjs');
const PROJECT=path.resolve(__dirname,'..');
const BOUNDARIES=[
  ['src/00-bootstrap.js','(function () {'],
  ['src/core/updates.js','    const UPDATE_RELEASE='],
  ['data/game.json','    const DATA = ' ,'DATA'],
  ['src/core/catalog.js','    const MONS = '],
  ['src/data/candy.js','    const CANDY_DATA='],
  ['src/core/settings-save.js','    const MODE_NAMES = '],
  ['src/models/facilities.js','    function towerWeek('],
  ['src/services/background.js','    function undergroundTeamKey('],
  ['src/models/farming.js','    function shinyRanking('],
  ['data/weather.json','    const WEATHER_DATA = ','WEATHER_DATA'],
  ['src/models/weather.js','    const WEATHER_POOL_CACHE = '],
  ['src/models/roster.js','    function partyMons('],
  ['data/evolution.json','    const EVOLUTION_DATA = ','EVOLUTION_DATA'],
  ['src/models/evolution.js','    function evolutionStatus('],
  ['src/models/combat-team.js','    function candyContext('],
  ['src/models/routes-training.js','    function ownedItems('],
  ['src/models/collection.js','    function legendProgress('],
  ['src/core/telemetry.js','    class Telemetry '],
  ['src/runtime/dom-driver.js','    const $ = '],
  ['src/runtime/automation.js','    class Automation '],
  ['src/runtime/level-coach.js','    class LevelCoach '],
  ['src/runtime/engine.js','    class Engine '],
  ['src/runtime/node-exports.js','    // Node-only exports for planning, accounting and browser regression tests.'],
  ['src/ui/mount.js','    if (window.top !== window.self) return;']
];
function extractJSON(source,start,constant){
  const match=new RegExp('^    const '+constant+'\\s*=\\s*').exec(source.slice(start));
  if(!match)throw Error('Data declaration changed: '+constant);
  let cursor=start+match[0].length;if(source[cursor]!=='{')throw Error(constant+' must be a JSON object literal');
  const objectStart=cursor;let depth=0,string=false,escaped=false;
  for(;cursor<source.length;cursor++){
    const char=source[cursor];
    if(string){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')string=false;continue;}
    if(char==='"'){string=true;continue;}if(char==='{')depth++;if(char==='}'&&--depth===0)break;
  }
  if(depth!==0)throw Error('Unclosed '+constant+' JSON literal');
  const end=cursor+1;if(source[end]!==';')throw Error('Expected a semicolon after '+constant);
  return{data:JSON.parse(source.slice(objectStart,end)),end:end+1};
}
function importLegacy({projectRoot=PROJECT,sourceFile=path.resolve(PROJECT,'../Pokecatch自动助手.user.js'),force=false}={}){
  const project=path.resolve(projectRoot),manifestFile=path.join(project,'build.manifest.json');
  if(fs.existsSync(manifestFile)&&!force)throw Error('Modules already exist. Edit source modules and build; --force is only for an intentional re-import.');
  const source=read(sourceFile),headerEnd=source.indexOf('// ==/UserScript==');
  if(headerEnd<0)throw Error('Source userscript header is missing');
  let header=source.slice(0,headerEnd+'// ==/UserScript=='.length);
  header=header.replace(/^\/\/ @version\s+[^\n]+$/m,'// @version      {{VERSION}}');
  header=header.replace(/^\/\/ @description\s+[^\n]+$/m,'// @description  原生伤害智能配队、天气窗口收集、练级刷钱、后台孵蛋地下探险与配置备份。');
  const spans=BOUNDARIES.map(([file,marker,constant])=>{const at=source.indexOf(marker);if(at<0||source.indexOf(marker,at+marker.length)>=0)throw Error('Missing or duplicate split boundary: '+marker);return{file,marker,constant,at};});
  for(let i=1;i<spans.length;i++)if(spans[i].at<=spans[i-1].at)throw Error('Source order changed near '+spans[i].file);
  const writes=new Map(),entries=[];writes.set('userscript.header.txt',header+'\n');
  for(let i=0;i<spans.length;i++){
    const span=spans[i],until=spans[i+1]?.at??source.length;let content=source.slice(span.at,until);
    if(span.constant){
      const literal=extractJSON(source,span.at,span.constant);validateData(span.constant,literal.data);writes.set(span.file,JSON.stringify(literal.data,null,2)+'\n');
      entries.push({kind:'json',file:span.file,constant:span.constant});
      const trailing=source.slice(literal.end,until);
      // Keep data-adjacent comments or assignments in their own source entry.
      if(trailing){const name={DATA:'game',EVOLUTION_DATA:'evolution',WEATHER_DATA:'weather'}[span.constant]||span.constant.toLowerCase();const file='src/data/'+name+'-after.js';writes.set(file,trailing);entries.push({kind:'source',file});}
    }else{
      if(i===0){content=content.replace(/const VERSION = '[^']+'/,'const VERSION = \'{{VERSION}}\'');if(!content.includes('{{VERSION}}'))throw Error('Bootstrap version declaration changed');}
      writes.set(span.file,content);entries.push({kind:'source',file:span.file});
    }
  }
  const manifest={schema:1,header:'userscript.header.txt',entries};writes.set('build.manifest.json',JSON.stringify(manifest,null,2)+'\n');
  // Validate every span before making any workspace changes.
  for(const[name,content]of writes){const file=localFile(project,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content,'utf8');}
  process.stdout.write('Imported '+entries.length+' source/data entries. Run npm run build, then npm test.\n');return manifest;
}
if(require.main===module){try{importLegacy({force:process.argv.includes('--force')});}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}}
module.exports={importLegacy,extractJSON,BOUNDARIES};
