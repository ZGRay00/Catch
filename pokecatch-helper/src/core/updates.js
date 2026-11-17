    const UPDATE_RELEASE=Object.freeze({repository:'ZGRay00/Catch',name:'PokéCatch 自动助手 · 图鉴 / 刷钱 / 团体战',namespace:'local.pokecatch.auto-helper',
        file:'pokecatch-helper.user.js',head:'https://api.github.com/repos/ZGRay00/Catch/git/ref/heads/main',
        download:'https://raw.githubusercontent.com/ZGRay00/Catch/main/pokecatch-helper.user.js'});
    const UPDATE_SOURCES=Object.freeze([
        {id:'github',name:'GitHub Raw',base:'https://raw.githubusercontent.com/ZGRay00/Catch/'},
        {id:'jsdelivr',name:'jsDelivr',base:'https://cdn.jsdelivr.net/gh/ZGRay00/Catch@'},
        {id:'fastly',name:'jsDelivr Fastly',base:'https://fastly.jsdelivr.net/gh/ZGRay00/Catch@'},
        {id:'gcore',name:'jsDelivr Gcore',base:'https://gcore.jsdelivr.net/gh/ZGRay00/Catch@'}
    ].map(source=>Object.freeze(source)));
    function updateSourceURL(sourceId,ref='main',fresh=null){
        const source=UPDATE_SOURCES.find(row=>row.id===sourceId);
        if(!source||!/^(?:main|[a-f0-9]{40})$/.test(ref))throw new Error('未知更新来源或提交');
        return source.base+ref+'/'+UPDATE_RELEASE.file+(fresh==null?'':'?_pokecatch_check='+encodeURIComponent(String(fresh)));
    }
    function updateVersionParts(value){
        const text=String(value??'').trim(),match=/^(\d+(?:\.\d+){0,7})(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(text);
        if(!match||text.length>160)throw new Error('更新文件版本号无效');
        return{core:match[1].split('.'),pre:match[2]?.split('.')||[]};
    }
    function compareUpdateVersions(a,b){
        const left=updateVersionParts(a),right=updateVersionParts(b),numeric=(x,y)=>{
            x=x.replace(/^0+(?=\d)/,'');y=y.replace(/^0+(?=\d)/,'');return x.length!==y.length?Math.sign(x.length-y.length):x===y?0:x>y?1:-1;
        };
        for(let i=0;i<Math.max(left.core.length,right.core.length);i++){const n=numeric(left.core[i]||'0',right.core[i]||'0');if(n)return n;}
        if(!left.pre.length||!right.pre.length)return left.pre.length?-1:right.pre.length?1:0;
        for(let i=0;i<Math.max(left.pre.length,right.pre.length);i++){
            const x=left.pre[i],y=right.pre[i];if(x===undefined)return -1;if(y===undefined)return 1;if(x===y)continue;
            const nx=/^\d+$/.test(x),ny=/^\d+$/.test(y);if(nx&&ny){const n=numeric(x,y);if(n)return n;continue;}
            if(nx!==ny)return nx?-1:1;return x>y?1:-1;
        }
        return 0;
    }
    function allowedUpdateURL(value){
        let url;try{url=new URL(value);}catch{throw new Error('更新源地址无效');}
        const api=url.hostname==='api.github.com'&&url.pathname==='/repos/ZGRay00/Catch/git/ref/heads/main';
        const raw=url.hostname==='raw.githubusercontent.com'&&/^\/ZGRay00\/Catch\/(?:main|[a-f0-9]{40})\/pokecatch-helper\.user\.js$/.test(url.pathname);
        const cdn=['cdn.jsdelivr.net','fastly.jsdelivr.net','gcore.jsdelivr.net'].includes(url.hostname)&&/^\/gh\/ZGRay00\/Catch@(?:main|[a-f0-9]{40})\/pokecatch-helper\.user\.js$/.test(url.pathname);
        if(url.protocol!=='https:'||url.port||url.username||url.password||!api&&!raw&&!cdn)throw new Error('更新请求仅允许指定 Catch 仓库的 HTTPS 地址');
        url.hash='';return url.href;
    }
    function allowedUpdateRedirect(requested,actual){
        const from=new URL(allowedUpdateURL(requested)),to=new URL(allowedUpdateURL(actual));
        const identity=url=>url.hostname==='api.github.com'?'head':/\/(?:Catch\/|Catch@)(main|[a-f0-9]{40})\/pokecatch-helper\.user\.js$/.exec(url.pathname)?.[1];
        if(identity(from)!==identity(to))throw new Error('更新响应跳转到了不同提交或文件');
        return to.href;
    }
    function parseUpdateScript(text){
        if(typeof text!=='string'||text.length>4*1024*1024)throw new Error('更新文件为空或超过大小限制');
        const begin=/^\uFEFF?[ \t\r\n]*\/\/[ \t]*==UserScript==[ \t]*\r?\n/.exec(text),close=/^[ \t]*\/\/[ \t]*==\/UserScript==[ \t]*(?:\r?\n|$)/gm;
        if(!begin)throw new Error('更新源没有返回用户脚本，可能是网络错误或网页');
        close.lastIndex=begin[0].length;const end=close.exec(text);
        if(!end||end.index>65536)throw new Error('更新文件元数据不完整');
        const entries=[...text.slice(begin[0].length,end.index).matchAll(/^[ \t]*\/\/[ \t]*@(\S+)[ \t]+([^\r\n]+?)[ \t]*$/gm)],values=key=>entries.filter(entry=>entry[1]===key).map(entry=>entry[2]);
        const name=values('name'),namespace=values('namespace'),version=values('version');
        if(name.length!==1||name[0]!==UPDATE_RELEASE.name||namespace.length!==1||namespace[0]!==UPDATE_RELEASE.namespace)throw new Error('更新文件名称或 namespace 与当前助手不匹配');
        if(version.length!==1)throw new Error('更新文件缺少唯一版本号');updateVersionParts(version[0]);
        if(!values('match').some(value=>/^https:\/\/pokecatch-online\.(?:netlify\.app|pages\.dev)\//.test(value)))throw new Error('更新文件缺少 PokéCatch 适用网址');
        let body=text.slice(end.index+end[0].length).trim();
        // Only consume leading comments. A comment containing "function" is not a script body.
        for(;;){if(body.startsWith('//')){const at=body.indexOf('\n');body=at<0?'':body.slice(at+1).trimStart();continue;}
            if(body.startsWith('/*')){const at=body.indexOf('*/',2);if(at<0){body='';break;}body=body.slice(at+2).trimStart();continue;}break;}
        const runtime=/^\(function[ \t]*\([ \t]*\)[ \t]*\{[ \t\r\n]*(['"])use strict\1;[ \t\r\n]*const VERSION[ \t]*=[ \t]*(['"])([^'"\r\n]+)\2/.exec(body);
        if(!runtime||runtime[3]!==version[0]||body.length<256||!body.trimEnd().endsWith('})();'))throw new Error('更新文件正文不完整或运行版本与元数据不一致');
        return{version:version[0],name:name[0],namespace:namespace[0]};
    }
    function updateAbortError(message='更新检查已取消'){
        const error=new Error(message);error.name='AbortError';return error;
    }
    function requestUpdateResource(value,{signal,timeout=9000}={}){
        const url=allowedUpdateURL(value);
        return new Promise((resolve,reject)=>{
            let settled=false,handle,controller;
            const abortTransport=()=>{try{handle?.abort();controller?.abort();}catch{}};
            const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',aborted);error?reject(error):resolve(result);};
            const aborted=()=>{finish(updateAbortError());abortTransport();};
            const ms=Math.max(1,Math.min(9000,Number(timeout)||9000));
            const timer=setTimeout(()=>{const error=new Error('连接更新源超时');error.name='TimeoutError';finish(error);abortTransport();},ms);
            if(signal?.aborted){aborted();return;}signal?.addEventListener('abort',aborted,{once:true});
            const loaded=result=>{try{
                if(result.status!==200)throw new Error(`更新源返回 HTTP ${result.status||0}`);
                if(result.url)allowedUpdateRedirect(url,result.url);
                if(typeof result.text!=='string'||result.text.length>4*1024*1024)throw new Error('更新响应为空或过大');
                finish(null,{text:result.text,url:result.url||url});
            }catch(error){finish(error);}};
            try{
                if(typeof GM_xmlhttpRequest==='function')handle=GM_xmlhttpRequest({method:'GET',url,anonymous:true,timeout:ms,responseType:'text',headers:{'Cache-Control':'no-cache'},
                    onload:result=>loaded({status:result.status,text:result.responseText,url:result.finalUrl}),
                    onerror:()=>finish(new Error('无法连接更新源，请检查网络或油猴域名授权')),
                    ontimeout:()=>{const error=new Error('连接更新源超时');error.name='TimeoutError';finish(error);},onabort:()=>finish(updateAbortError())});
                else{controller=new AbortController();fetch(url,{cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal})
                    .then(async result=>loaded({status:result.status,text:await result.text(),url:result.url})).catch(()=>finish(new Error('连接更新源失败，请在油猴中运行并允许访问 GitHub')));}
            }catch(error){finish(error);}
        });
    }
    function updateRequestWithDeadline(request,url,{signal,timeout}){
        return new Promise((resolve,reject)=>{
            const controller=new AbortController();let settled=false,timer;
            const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',aborted);error?reject(error):resolve(value);};
            const aborted=()=>{finish(updateAbortError());controller.abort();};
            if(signal?.aborted){aborted();return;}signal?.addEventListener('abort',aborted,{once:true});
            timer=setTimeout(()=>{const error=new Error('连接更新源超时');error.name='TimeoutError';finish(error);controller.abort();},timeout);
            try{Promise.resolve(request(url,{signal:controller.signal,timeout})).then(value=>finish(null,value),error=>finish(error));}
            catch(error){finish(error);}
        });
    }
    function downloadUpdateScript(text,filename=UPDATE_RELEASE.file){
        parseUpdateScript(text);
        if(!/^[\w.+-]+\.user\.js$/.test(filename)||typeof document==='undefined')throw new Error('无法创建脚本下载');
        const blob=new Blob([text],{type:'text/javascript;charset=utf-8'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');
        try{anchor.href=url;anchor.download=filename;anchor.rel='noopener';anchor.style.display='none';document.body.appendChild(anchor);anchor.click();}
        catch(error){URL.revokeObjectURL(url);throw error;}
        finally{anchor.remove();}
        setTimeout(()=>URL.revokeObjectURL(url),5000);return true;
    }
    function openUpdateInstaller(url){
        allowedUpdateURL(url);
        if(typeof GM_openInTab==='function'){const tab=GM_openInTab(url,{active:true,insert:true,setParent:true});return tab!==null&&tab!==false;}
        const page=window.open(url,'_blank');if(!page)return false;try{page.opener=null;}catch{}return true;
    }
    class UpdateChecker{
        constructor({request=requestUpdateResource,open=openUpdateInstaller,download=downloadUpdateScript,currentVersion=VERSION,onChange=()=>{},now=Date.now,headTimeout=4000,sourceTimeout=9000}={}){
            this.request=request;this.open=open;this.currentVersion=currentVersion;this.onChange=onChange;this.now=now;
            this.downloadFile=download;this.headTimeout=Math.max(1,Math.min(4000,Number(headTimeout)||4000));this.sourceTimeout=Math.max(1,Math.min(9000,Number(sourceTimeout)||9000));
            this.epoch=0;this.controller=null;this.sourceId='auto';this.phase='idle';this.sourceResults=[];
            this.busy=false;this.pending=null;this.checkedAt=0;this.message=`当前 v${currentVersion} · 更新来源 ZGRay00/Catch`;
        }
        changed(){try{this.onChange(this);}catch(error){console.warn('[PokéCatch 更新]',error);}}
        async check({sourceId='auto'}={}){
            if(this.busy)return null;
            if(sourceId!=='auto'&&!UPDATE_SOURCES.some(source=>source.id===sourceId)){this.message='检查失败：未知更新来源';this.changed();return null;}
            this.busy=true;this.pending=null;this.sourceId=sourceId;this.phase='head';this.controller=new AbortController();
            const epoch=++this.epoch,signal=this.controller.signal,current=()=>epoch===this.epoch&&!signal.aborted;
            const sources=UPDATE_SOURCES.filter(source=>sourceId==='auto'||source.id===sourceId);
            this.sourceResults=[{id:'head',name:'GitHub HEAD',state:'waiting',version:'',ms:0,error:''},...UPDATE_SOURCES.map(source=>({id:source.id,name:source.name,state:sources.includes(source)?'waiting':'skipped',version:'',ms:0,error:''}))];
            const progress=(id,patch)=>{if(!current())return;this.sourceResults=this.sourceResults.map(row=>row.id===id?{...row,...patch}:row);this.changed();};
            this.message=`正在检查在线更新 · 本地 v${this.currentVersion}`;this.changed();
            try{
                const fresh=String(this.now()),headURL=UPDATE_RELEASE.head+'?_pokecatch_check='+encodeURIComponent(fresh);let commit=null;
                const headAt=this.now();progress('head',{state:'checking'});
                try{
                    const reply=await updateRequestWithDeadline(this.request,headURL,{signal,timeout:this.headTimeout});
                    if(reply?.url)allowedUpdateRedirect(headURL,reply.url);
                    const head=JSON.parse(typeof reply==='string'?reply:reply.text);
                    if(!/^[a-f0-9]{40}$/.test(head?.object?.sha||''))throw new Error('最新提交信息无效');
                    commit=head.object.sha;progress('head',{state:'success',ms:Math.max(0,this.now()-headAt),commit});
                }catch(error){if(!current())return null;progress('head',{state:error.name==='TimeoutError'?'timeout':'error',ms:Math.max(0,this.now()-headAt),error:String(error.message||error).slice(0,240)});}
                if(!current())return null;
                const batch=async(ref,phase)=>{
                    this.phase=phase;this.message=ref==='main'?'正在并行比对更新来源，跳过过期缓存':'正在并行核验同一 GitHub 提交';this.changed();
                    const results=await Promise.all(sources.map(async source=>{
                        const started=this.now(),url=updateSourceURL(source.id,ref,ref==='main'?fresh:null);progress(source.id,{state:'checking',version:'',error:'',phase,ms:0});
                        try{
                            const response=await updateRequestWithDeadline(this.request,url,{signal,timeout:this.sourceTimeout});
                            if(!current())return null;
                            const finalURL=response?.url?allowedUpdateRedirect(url,response.url):url,text=typeof response==='string'?response:response?.text;
                            const latest=parseUpdateScript(text);
                            progress(source.id,{state:'success',version:latest.version,ms:Math.max(0,this.now()-started)});
                            return{...latest,text,url:finalURL,commit:ref==='main'?null:ref,sourceId:source.id};
                        }catch(error){if(current())progress(source.id,{state:error.name==='TimeoutError'?'timeout':'error',error:String(error.message||error).slice(0,240),ms:Math.max(0,this.now()-started)});return null;}
                    }));
                    return results.filter(Boolean).sort((a,b)=>compareUpdateVersions(b.version,a.version));
                };
                let results=commit?await batch(commit,'pinned'):[];
                if(current()&&commit&&results.length>1&&results.some(result=>result.version!==results[0].version||result.text!==results[0].text)){
                    const detail=results.map(result=>`${result.sourceId}: v${result.version}`).join('、');
                    for(const result of results)progress(result.sourceId,{state:'conflict',error:'同一固定提交的版本或正文不一致'});
                    throw new Error(`同一提交的更新来源内容冲突（${detail}）；请手动选择可信来源核对后重试`);
                }
                if(current()&&!results.length)results=await batch('main','branch');
                if(!current())return null;
                if(!results.length)throw new Error('所有更新来源均未返回有效脚本；可切换来源后重试');
                const latest=results[0],comparison=compareUpdateVersions(latest.version,this.currentVersion);
                this.checkedAt=this.now();
                this.phase='complete';
                if(comparison>0){this.pending=latest;this.message=`发现 v${latest.version} · ${UPDATE_SOURCES.find(source=>source.id===latest.sourceId).name}；${latest.commit?'已固定最新提交，可安装新版':'分支缓存尚未确认最新提交，可下载已验证快照避免安装缓存变化'}`;}
                else this.message=comparison===0?(latest.commit?`已核对最新提交，当前为 v${this.currentVersion}`:`已比对 ${results.length} 个有效来源，与当前 v${this.currentVersion} 一致（最新提交暂未确认，CDN可能缓存）`):`有效来源最高为 v${latest.version}，本地 v${this.currentVersion} 较新`;
                return latest;
            }catch(error){if(current()){this.phase='error';this.message='检查失败：'+(error?.message||error);}return null;}
            finally{if(epoch===this.epoch){this.busy=false;this.controller=null;this.changed();}}
        }
        cancel(){
            if(!this.busy)return false;
            const controller=this.controller;this.epoch++;this.busy=false;this.controller=null;this.pending=null;this.phase='cancelled';
            this.sourceResults=this.sourceResults.map(row=>['checking','waiting'].includes(row.state)?{...row,state:'cancelled'}:row);
            this.message='更新检查已取消，可重新选择来源检查';controller?.abort();this.changed();return true;
        }
        verifiedPending(){
            if(this.busy||!this.pending)return null;
            const latest=parseUpdateScript(this.pending.text);
            if(latest.version!==this.pending.version||compareUpdateVersions(latest.version,this.currentVersion)<=0)throw new Error('待安装脚本版本与已验证缓存不一致');
            const url=allowedUpdateURL(this.pending.url);
            if(this.pending.commit)allowedUpdateRedirect(updateSourceURL('github',this.pending.commit),url);
            return this.pending;
        }
        install(){
            if(this.busy||!this.pending)return false;
            try{const pending=this.verifiedPending();if(this.open(pending.url)===false)throw new Error('浏览器阻止了更新页，请允许弹出窗口后重试');this.message=`已打开 v${pending.version} 安装确认页，完成后刷新游戏${pending.commit?'':'；分支地址可能变化，也可下载本次已验证快照'}`;this.changed();return true;}
            catch(error){this.message='打开更新页失败：'+(error?.message||error);this.changed();return false;}
        }
        download(){
            if(this.busy||!this.pending)return false;
            try{const pending=this.verifiedPending();if(this.downloadFile(pending.text,`pokecatch-helper-${pending.version}.user.js`)===false)throw new Error('浏览器阻止了脚本下载');this.message=`已下载 v${pending.version} 已验证脚本，请导入油猴后刷新游戏`;this.changed();return true;}
            catch(error){this.message='下载已验证脚本失败：'+(error?.message||error);this.changed();return false;}
        }
    }

    // Public game data snapshot: https://pokecatch-online.pages.dev/boot.js
    // Build b05c8cc201, 2026-11-16. This script only reads saves and clicks game controls.
    // Battle learns/moves and raid counters checked against build 1a16948eef, 2026-11-17.
    // Economy/XP and raid ally mechanisms verified against b05c8cc201, 2026-11-16.
