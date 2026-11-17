'use strict';
// Deterministic ZIP writer using only Node built-ins; no archive program is required.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {build,localFile}=require('./build.cjs');
const DEFAULT_PROJECT=path.resolve(__dirname,'..');
const CRC_TABLE=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(buffer){let value=0xffffffff;for(const byte of buffer)value=CRC_TABLE[(value^byte)&255]^(value>>>8);return(value^0xffffffff)>>>0;}
function archiveName(name){
  if(typeof name!=='string'||!name||name.includes('\\')||name.startsWith('/')||name.split('/').some(part=>!part||part==='.'||part==='..')||/^[a-z]:/i.test(name))throw Error('Unsafe archive entry: '+name);
  return name;
}
function zip(entries){
  const ordered=[...entries].map(([name,data])=>[archiveName(name),Buffer.isBuffer(data)?data:Buffer.from(data)]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
  if(ordered.length>65535)throw Error('ZIP64 entry counts are unsupported');
  const names=new Set(),records=[],central=[];let offset=0,centralSize=0;
  for(const[name,data]of ordered){
    if(names.has(name))throw Error('Duplicate archive entry: '+name);names.add(name);
    const filename=Buffer.from(name),packed=zlib.deflateRawSync(data,{level:9}),checksum=crc32(data);
    if(filename.length>65535||data.length>0xffffffff||packed.length>0xffffffff||offset>0xffffffff)throw Error('ZIP64 sizes are unsupported');
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(8,8);
    local.writeUInt16LE(0,10);local.writeUInt16LE(33,12);local.writeUInt32LE(checksum,14);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(filename.length,26);
    records.push(local,filename,packed);
    const record=Buffer.alloc(46);record.writeUInt32LE(0x02014b50);record.writeUInt16LE(20,4);record.writeUInt16LE(20,6);record.writeUInt16LE(0x800,8);record.writeUInt16LE(8,10);
    record.writeUInt16LE(0,12);record.writeUInt16LE(33,14);record.writeUInt32LE(checksum,16);record.writeUInt32LE(packed.length,20);record.writeUInt32LE(data.length,24);record.writeUInt16LE(filename.length,28);record.writeUInt32LE(offset,42);
    central.push(record,filename);centralSize+=record.length+filename.length;offset+=local.length+filename.length+packed.length;
  }
  if(offset+centralSize>0xffffffff)throw Error('ZIP64 sizes are unsupported');
  const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(ordered.length,8);end.writeUInt16LE(ordered.length,10);end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...records,...central,end]);
}
function collectFiles(projectRoot=DEFAULT_PROJECT,version){
  const project=path.resolve(projectRoot),workspace=path.dirname(project),result=new Map(),prefix='pokecatch-helper-v'+version+'/';
  function addFile(file,name){
    const stat=fs.lstatSync(file);if(stat.isSymbolicLink()||!stat.isFile())throw Error('Packaging accepts regular files only: '+file);
    const resolved=fs.realpathSync(file),relative=path.relative(workspace,resolved);if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Package file escapes workspace: '+file);
    const entry=archiveName(prefix+name);if(result.has(entry))throw Error('Duplicate packaged file: '+entry);result.set(entry,fs.readFileSync(file));
  }
  function tree(relative,filter=()=>true){
    const root=localFile(project,relative);if(!fs.existsSync(root))return;
    function walk(directory){for(const item of fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
      if(item.name.startsWith('.')||item.name==='node_modules')continue;
      const file=path.join(directory,item.name);if(item.isSymbolicLink())throw Error('Symlink excluded from release: '+file);
      if(item.isDirectory())walk(file);else if(item.isFile()&&filter(file))addFile(file,'pokecatch-helper/'+path.relative(project,file).split(path.sep).join('/'));
    }}walk(root);
  }
  addFile(path.join(workspace,'Pokecatch自动助手.user.js'),'Pokecatch自动助手.user.js');
  for(const name of ['package.json','README.md','ARCHITECTURE.md','build.manifest.json','userscript.header.txt'])addFile(localFile(project,name),'pokecatch-helper/'+name);
  for(const relative of ['src','data','tools','tests','docs'])tree(relative,file=>/\.(?:js|cjs|mjs|json|txt|md)$/.test(file));
  for(const name of ['pokecatch-helper.user.js','pokecatch-helper.meta.js','build-info.json'])addFile(path.join(project,'dist',name),'pokecatch-helper/dist/'+name);
  // Extensions are first-party optional artifacts supplied separately by this project.
  for(const relative of ['extension','extensions'])tree(relative,file=>/\.(?:js|json|html|css|md|txt|svg|png)$/.test(file));
  const tests=path.join(workspace,'tests');if(fs.existsSync(tests))for(const item of fs.readdirSync(tests,{withFileTypes:true})){
    if(item.isFile()&&/^pokecatch.*\.cjs$/.test(item.name))addFile(path.join(tests,item.name),'tests/'+item.name);
  }
  const nativeVM=path.join(workspace,'tools/pokecatch-native-vm.cjs');if(fs.existsSync(nativeVM))addFile(nativeVM,'tools/pokecatch-native-vm.cjs');
  const fixtures=path.join(tests,'fixtures');if(fs.existsSync(fixtures))for(const item of fs.readdirSync(fixtures,{withFileTypes:true})){
    if(item.isFile()&&/^pokecatch.*\.(?:json|js|cjs)$/.test(item.name))addFile(path.join(fixtures,item.name),'tests/fixtures/'+item.name);
  }
  result.set(prefix+'安装说明.txt',Buffer.from('安装 pokecatch-helper/dist/pokecatch-helper.user.js 到 Tampermonkey。\n源码与开发命令见 pokecatch-helper/README.md。\n无需运行 Node 或安装扩展即可使用脚本。\n'));
  return result;
}
function packageRelease({projectRoot=DEFAULT_PROJECT,quiet=false}={}){
  const result=build({projectRoot,quiet:true});build({projectRoot,check:true,quiet:true});
  const entries=collectFiles(projectRoot,result.version),buffer=zip(entries),file=path.join(result.project,'dist','pokecatch-helper-v'+result.version+'.zip');
  fs.writeFileSync(file,buffer);if(!quiet)process.stdout.write('Packaged '+path.relative(result.workspace,file)+' ('+entries.size+' files, '+buffer.length+' bytes)\n');
  return{file,buffer,entries,version:result.version};
}
if(require.main===module){try{packageRelease();}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}}
module.exports={crc32,archiveName,zip,collectFiles,packageRelease};
