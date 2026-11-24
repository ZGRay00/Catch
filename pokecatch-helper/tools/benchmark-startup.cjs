'use strict';
// node tools/benchmark-startup.cjs old.user.js new.user.js [rounds] [boxSize]
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
const {fixture}=require('./benchmark-box.cjs');

function timePage(){
    const el=document.createElement('script');
    el.textContent=document.querySelector('#source').textContent;
    const start=performance.now();
    document.body.append(el);
    const width=document.querySelector('#pokecatch-auto-helper')?.getBoundingClientRect().width;
    const ms=performance.now()-start;
    const ready=!!window.__pokecatchHelper?.ready&&width>0;
    document.body.replaceChildren('STARTUP '+JSON.stringify({ms,ready,ua:navigator.userAgent}));
}

function bench(files,rounds,size){
    const chrome=process.env.CHROME_PATH||[
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'
    ].find(fs.existsSync);
    assert.ok(chrome,'Set CHROME_PATH to Chrome or Edge');
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pokecatch-cold-start-'));
    try{
        const save=JSON.stringify(fixture(require(files[0]),size));
        const variants=files.map((file,i)=>{
            const html=path.join(dir,'trial-'+i+'.html');
            const code=fs.readFileSync(file,'utf8').replace(/<\/script/gi,'<\\/script');
            const init='localStorage.setItem("gachamon-save-v1",'+JSON.stringify(save)+');';
            fs.writeFileSync(html,'<!doctype html><meta charset="utf-8"><body><script>'+init+'</script>'+
                '<script id="source" type="text/plain">'+code+'</script><script>('+timePage.toString()+')()</script>');
            return {file,html,samples:[]};
        });
        let ua;
        for(let i=0;i<rounds;i++){
            for(const v of i%2?variants.slice().reverse():variants){
                const profile=fs.mkdtempSync(path.join(dir,'profile-'));
                const result=spawnSync(chrome,['--headless=new','--disable-gpu','--no-first-run','--disable-extensions',
                    '--disable-background-networking','--disable-sync','--proxy-server=http://127.0.0.1:9',
                    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost','--user-data-dir='+profile,
                    '--dump-dom',pathToFileURL(v.html).href],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:16*1024*1024});
                if(result.error)throw result.error;
                assert.equal(result.status,0,result.stderr);
                const match=result.stdout.match(/STARTUP (\{[^<]*\})<\/body>/);
                assert.ok(match,'Browser did not return a startup measurement');
                const sample=JSON.parse(match[1]);
                assert.ok(sample.ready,'Panel failed to mount in '+v.file);
                v.samples.push(sample.ms);ua=sample.ua;
            }
        }
        return {size,rounds,ua,variants:variants.map(({file,samples})=>{
            const sorted=samples.slice().sort((a,b)=>a-b),i=Math.floor(sorted.length/2);
            return {file,medianMs:rounds%2?sorted[i]:(sorted[i-1]+sorted[i])/2,samples};
        })};
    }finally{fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
}

const [before,after,rounds='5',size='1000']=process.argv.slice(2);
assert.ok(before&&after&&Number.isSafeInteger(+rounds)&&+rounds>0&&Number.isSafeInteger(+size)&&+size>=45,
    'Expected two complete userscripts, optional positive round count and box size >=45');
console.log(JSON.stringify(bench([path.resolve(before),path.resolve(after)],+rounds,+size),null,2));
