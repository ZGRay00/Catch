// Run from workspace root, passing the baseline and new local userscript paths.
// Isolated about:blank. Measure real browser callbacks and animation frames.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const {setTimeout:delay}=require('node:timers/promises');
const {fixture,clock}=require('./benchmark-team.cjs');

async function browserTrial(H,state,now){
    const e=new H.Engine({getItem:()=>null},{mode:'progress'});e.running=true;
    const native=window.setTimeout,spans=[],frames=[];
    let frame,previous;
    function sample(t){if(previous!==undefined)frames.push(t-previous);previous=t;frame=requestAnimationFrame(sample);}
    function timed(fn){const t=performance.now();try{return fn();}finally{spans.push(performance.now()-t);}}
    await new Promise(resolve=>requestAnimationFrame(t=>{sample(t);resolve();}));
    const t=performance.now();
    try{
        window.setTimeout=(fn,ms,...args)=>native(()=>timed(()=>fn(...args)),ms);
        let windows=0,first;
        do{
            timed(()=>e.fitTeam(state,now));
            while(e.teamSearch&&!e.teamSearch.result&&!e.teamSearch.error){
                if(performance.now()-t>10000)throw Error('Planner timeout');
                await new Promise(r=>native(r,4));
            }
            if(e.teamSearch?.error)throw e.teamSearch.error;
            if(e.teamSearch)timed(()=>e.fitTeam(state,now));
            if(!e.teamCheck)throw Error('No plan applied');
            if(e.driver.teamTask){state.team=e.driver.teamTask.uids;state.road=state.team.slice();e.driver.teamTask=null;}
            first??=state.team.slice();windows++;now+=5001;
            if(windows>60)throw Error('No convergence');
        }while(e.teamCheck.limited);
        const wall=performance.now()-t;
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        return {wall,maxSlice:Math.max(...spans),maxFrame:Math.max(...frames),windows,first,team:state.team};
    }finally{cancelAnimationFrame(frame);window.setTimeout=native;}
}

async function main(){
    const files=process.argv.slice(2);if(!files.length)throw Error('Pass local userscript paths');
    const chrome=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pc-team-perf-'));
    const child=spawn(chrome,['--headless=new','--disable-background-networking','--disable-gpu','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{windowsHide:true,stdio:'ignore'});
    let socket;
    try{
        const portFile=path.join(dir,'DevToolsActivePort');
        for(let i=0;i<150&&!fs.existsSync(portFile);i++)await delay(100);
        const port=Number(fs.readFileSync(portFile,'utf8').split('\n')[0]);
        const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
        socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
        await new Promise((ok,fail)=>{socket.onopen=ok;socket.onerror=fail;});
        let next=0;const calls=new Map();
        socket.onmessage=({data})=>{const m=JSON.parse(data),call=calls.get(m.id);if(call){calls.delete(m.id);m.error?call.fail(Error(m.error.message)):call.ok(m.result);}};
        const send=(method,params={})=>new Promise((ok,fail)=>{const id=++next;calls.set(id,{ok,fail});socket.send(JSON.stringify({id,method,params}));});
        const evaluate=async expression=>{
            const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,timeout:15000});
            if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
            return r.result.value;
        };
        await send('Network.enable');await send('Network.setBlockedURLs',{urls:['http://*','https://*']});
        await send('Emulation.setCPUThrottlingRate',{rate:4});
        await send('Emulation.setHardwareConcurrencyOverride',{hardwareConcurrency:4});
        for(const file of files){
            const source=fs.readFileSync(file,'utf8');
            await evaluate('(function(document,module){'+source+'\nwindow.planner=module.exports})(undefined,{exports:{}})');
            for(const n of [18,90,300]){
                const results=[];
                for(let i=0;i<5;i++){
                    await evaluate('planner.clearTeamCache()');
                    results.push(await evaluate('('+browserTrial.toString()+')(planner,'+JSON.stringify(fixture(n))+','+clock+')'));
                }
                console.log(JSON.stringify({file,n,peakSlice:Math.max(...results.map(r=>r.maxSlice)),peakFrame:Math.max(...results.map(r=>r.maxFrame)),windows:results.map(r=>r.windows),teams:[...new Set(results.map(r=>r.team.join(',')))]}));
            }
        }
    }finally{socket?.close();child.kill();}
}
main().catch(err=>{console.error(err);process.exitCode=1;});
