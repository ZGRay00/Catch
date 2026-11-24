'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const DEFAULT_PROJECT=path.resolve(__dirname,'..');
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
const read=file=>fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
function localFile(root,name){
  if(typeof name!=='string'||!name||path.isAbsolute(name))throw Error('Manifest file must be a relative path');
  const file=path.resolve(root,name),relative=path.relative(root,file);
  if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Manifest file escapes project: '+name);
  return file;
}
function validateData(name,data){
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error(name+' must be a JSON object');
  if(name==='DATA'){
    if(!Number.isInteger(data.layout)||!Array.isArray(data.mons)||!data.mons.length||!Array.isArray(data.chapters)||!data.chapters.length)throw Error('DATA lacks its save layout, species or chapter catalog');
    const ids=new Set();
    for(const mon of data.mons){
      if(!Number.isInteger(mon.id)||ids.has(mon.id)||typeof mon.name!=='string'||!Array.isArray(mon.types)||!mon.types.length)throw Error('Invalid or duplicate species: '+mon?.id);
      ids.add(mon.id);
      if(!mon.stats||['hp','atk','def','spa','spd','spe'].some(key=>!Number.isFinite(mon.stats[key])||mon.stats[key]<0))throw Error('Invalid base stats: '+mon.id);
      if(mon.learn!==undefined&&(!Array.isArray(mon.learn)||mon.learn.some(row=>!Array.isArray(row)||!Number.isFinite(row[0])||typeof row[1]!=='string')))throw Error('Invalid learn list: '+mon.id);
    }
    const chapters=new Set();for(const chapter of data.chapters){if(!Number.isInteger(chapter.id)||chapters.has(chapter.id)||typeof chapter.name!=='string')throw Error('Invalid or duplicate chapter: '+chapter?.id);chapters.add(chapter.id);}
    if(!data.chart||typeof data.chart!=='object'||!data.combat||typeof data.combat!=='object')throw Error('DATA lacks battle rules');
  }
  if(name==='EVOLUTION_DATA'&&(!data.rules||typeof data.rules!=='object'||Array.isArray(data.rules)))throw Error('EVOLUTION_DATA lacks its rule map');
  if(name==='LEGEND_ELITE'){
    if(!/^[a-f0-9]{10}$/.test(data.bundle)||!Number.isInteger(data.legendLimit)||data.legendLimit<0||!Object.keys(data.zones||{}).length)throw Error('LEGEND_ELITE lacks its build, party limit or matchups');
    for(const zone of Object.values(data.zones)){
      if(!Object.keys(zone.foes||{}).length||Object.values(zone.foes).some(tiers=>!Array.isArray(tiers)||tiers.length!==5||tiers.some(pair=>!Array.isArray(pair)||pair.length!==2||pair.some(value=>!Number.isFinite(value)||value<=0))))throw Error('LEGEND_ELITE contains invalid stage multipliers');
    }
  }
  if(name==='WEATHER_DATA'){
    if(data.schema!==2||!Number.isFinite(data.slotMs)||data.slotMs<=0||!Number.isFinite(data.chance)||data.chance<0||data.chance>1||!data.types||typeof data.types!=='object'||Array.isArray(data.types)||!Array.isArray(data.chapters)||!data.chapters.length||!Array.isArray(data.tables)||!data.tables.length||!Array.isArray(data.dailySpots))throw Error('WEATHER_DATA requires schema 2 hourly weather, daily spots and encounter tables');
    if(data.tables.some(table=>!Array.isArray(table)||table.some(row=>!Array.isArray(row)||!Number.isInteger(row[0])||row[0]<=0||!Number.isFinite(row[1])||row[1]<=0)))throw Error('WEATHER_DATA contains an invalid encounter table');
    const ids=new Set();for(const chapter of data.chapters){if(!Number.isInteger(chapter.id)||ids.has(chapter.id)||!chapter.pools||typeof chapter.pools!=='object')throw Error('WEATHER_DATA contains an invalid chapter');ids.add(chapter.id);}
    if(data.dailySpots.some(spot=>!spot||typeof spot!=='object'||!Number.isFinite(spot.share)||spot.share<0||spot.share>1||!Array.isArray(spot.zones)||spot.zones.some(zone=>typeof zone!=='string')))throw Error('WEATHER_DATA contains an invalid daily spot');
  }
}
function compileProject(projectRoot=DEFAULT_PROJECT){
  const project=path.resolve(projectRoot),workspace=path.dirname(project),pkg=JSON.parse(read(path.join(project,'package.json')));
  if(!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(pkg.version||''))throw Error('package.json version must be semver');
  const manifestPath=path.join(project,'build.manifest.json');
  if(!fs.existsSync(manifestPath))throw Error('Source modules are not imported yet. Run node tools/import-legacy.cjs after updating the legacy source.');
  const manifestText=read(manifestPath),manifest=JSON.parse(manifestText);
  if(manifest.schema!==1||!Array.isArray(manifest.entries)||!manifest.entries.length)throw Error('Unsupported or empty build manifest');
  const headerText=read(localFile(project,manifest.header));let header=headerText;
  if((header.match(/\{\{VERSION\}\}/g)||[]).length!==1||!header.startsWith('// ==UserScript==')||!header.includes('// ==/UserScript=='))throw Error('Userscript header is incomplete or has ambiguous version markers');
  header=header.replace('{{VERSION}}',pkg.version).trimEnd()+'\n\n';
  const files=new Set(),constants=new Set(),inputs=[
    {file:'package.json',sha256:hash(read(path.join(project,'package.json')))},
    {file:'build.manifest.json',sha256:hash(manifestText)},
    {file:manifest.header,sha256:hash(headerText)}
  ],parts=[];
  for(const entry of manifest.entries){
    const file=localFile(project,entry.file);if(files.has(file))throw Error('Duplicate module: '+entry.file);files.add(file);
    const content=read(file);inputs.push({file:entry.file,sha256:hash(content)});
    if(entry.kind==='source')parts.push(content);
    else if(entry.kind==='json'){
      if(!/^[A-Z][A-Z0-9_]*$/.test(entry.constant||'')||constants.has(entry.constant))throw Error('Invalid or duplicate data constant');
      constants.add(entry.constant);const data=JSON.parse(content);validateData(entry.constant,data);
      const json=JSON.stringify(data);
      // Let the native JSON reader build the two large catalogs instead of compiling
      // tens of thousands of nested array and object literals as JavaScript.
      const largeCatalog=entry.constant==='DATA'||entry.constant==='WEATHER_DATA';
      const value=largeCatalog
        ? "JSON.parse('"+json.replace(/[\\']/g,'\\$&').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029')+"')"
        : json;
      parts.push('    const '+entry.constant+' = '+value+';');
    }else throw Error('Unknown manifest entry kind: '+entry.kind);
  }
  if(!constants.has('DATA')||!constants.has('EVOLUTION_DATA'))throw Error('DATA and EVOLUTION_DATA must be independent data entries');
  let body=parts.join('');
  if((body.match(/\{\{VERSION\}\}/g)||[]).length!==1)throw Error('Bootstrap must contain one version marker');
  body=body.replace('{{VERSION}}',pkg.version);
  const script=header+body.trimStart().trimEnd()+'\n';
  if((script.match(/^    mount\(\);$/gm)||[]).length!==1)throw Error('The browser test mount hook must remain unique');
  if(!script.includes('module.exports')||!script.includes("typeof document === 'undefined'"))throw Error('The Node planning export boundary is missing');
  if(!/^\(function \(\) \{\s*'use strict';\s*const VERSION = '/m.test(script))throw Error('The startup wrapper/version order changed');
  new vm.Script(script,{filename:'pokecatch-helper.user.js'});
  const meta=header.trimEnd()+'\n';
  const info=JSON.stringify({schema:1,version:pkg.version,scriptSha256:hash(script),metadataSha256:hash(meta),inputs},null,2)+'\n';
  const artifacts=new Map([
    [path.join(workspace,'Pokecatch自动助手.user.js'),script],
    [path.join(project,'dist/pokecatch-helper.user.js'),script],
    [path.join(project,'dist/pokecatch-helper.meta.js'),meta],
    [path.join(project,'dist/build-info.json'),info]
  ]);
  return{project,workspace,version:pkg.version,script,meta,info,artifacts,inputs};
}
function build({projectRoot=DEFAULT_PROJECT,check=false,quiet=false}={}){
  const result=compileProject(projectRoot),differences=[];
  for(const[file,content]of result.artifacts){
    if(check){if(!fs.existsSync(file)||read(file)!==content)differences.push(path.relative(result.workspace,file));}
    else{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content,'utf8');}
  }
  if(differences.length)throw Error('Generated artifacts differ; run npm run build:\n'+differences.join('\n'));
  if(!quiet)process.stdout.write((check?'Verified':'Built')+' v'+result.version+' ('+Buffer.byteLength(result.script)+' bytes, '+result.inputs.length+' source/data files)\n');
  return result;
}
if(require.main===module){try{build({check:process.argv.includes('--check')});}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}}
module.exports={compileProject,build,validateData,localFile,read,hash};
