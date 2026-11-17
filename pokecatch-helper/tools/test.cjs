'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {build}=require('./build.cjs');
const project=path.resolve(__dirname,'..'),workspace=path.dirname(project);
try{
  build({check:true,quiet:true});
  const files=[];
  for(const[directory,pattern]of [[path.join(project,'tests'),/\.test\.cjs$/],[path.join(workspace,'tests'),/^pokecatch.*\.test\.cjs$/]]){
    if(fs.existsSync(directory))for(const name of fs.readdirSync(directory).sort())if(pattern.test(name))files.push(path.join(directory,name));
  }
  if(!files.length)throw Error('No regression tests were found');
  process.stdout.write('Running '+files.length+' offline regression files\n');
  const result=spawnSync(process.execPath,['--test',...files],{cwd:workspace,stdio:'inherit'});if(result.error)throw result.error;process.exitCode=result.status??1;
}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
