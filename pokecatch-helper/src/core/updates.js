    const UPDATE_RELEASE=Object.freeze({repository:'ZGRay00/Catch',name:'PokéCatch 自动助手 · 图鉴 / 刷钱 / 团体战',namespace:'local.pokecatch.auto-helper',
        file:'pokecatch-helper.user.js',head:'https://api.github.com/repos/ZGRay00/Catch/git/ref/heads/main',
        download:'https://catch-elite-sim-1426994854.cos.ap-guangzhou.myqcloud.com/updates/v1/helper/pokecatch-helper.user.js'});
    const helperCos=UPDATE_RELEASE.download.slice(0,UPDATE_RELEASE.download.lastIndexOf('/')+1);
    const helperRaw='https://raw.githubusercontent.com/ZGRay00/Catch/';
    const UPDATE_SOURCES=Object.freeze([{id:'cos',name:'国内 / COS'},{id:'github',name:'全球 / GitHub Raw'},{id:'jsdelivr',name:'jsDelivr 镜像'}]);
    const helperPublicKey='MCowBQYDK2VwAyEAsyJJaZWan0xmCgBZGG7gBiQs0e4vX6NvPJIkQ8+Q/bk=';
    function installedHelperChannel(){
        const url=typeof GM_info==='undefined'?'':GM_info.script?.downloadURL||GM_info.script?.updateURL||GM_info.scriptMetaStr||'';
        return url.includes(helperCos)?'cn':url.includes(helperRaw)?'global':null;
    }
    function updateSourceURL(id,version,channel=id==='cos'?'cn':'global'){
        if(!['cn','global'].includes(channel)||!UPDATE_SOURCES.some(s=>s.id===id)||version!==undefined&&!/^\d+\.\d+\.\d+$/.test(version))throw Error('更新源或版本无效');
        const tag='helper-v'+version,file='pokecatch-helper-'+channel+'.user.js';
        if(id==='cos')return helperCos+(version?'releases/'+version+'/'+file:'helper-release.json');
        const base=id==='github'?helperRaw:'https://cdn.jsdelivr.net/gh/ZGRay00/Catch@';
        return base+(version?tag+'/releases/'+tag+'/'+file:'main/helper-release.json');
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
        const exact=url.origin+url.pathname,version=/helper-v(\d+\.\d+\.\d+)|releases\/(\d+\.\d+\.\d+)/.exec(url.pathname);
        const valid=[UPDATE_RELEASE.download,helperRaw+'main/pokecatch-helper.user.js',...UPDATE_SOURCES.map(s=>updateSourceURL(s.id))];
        if(version)valid.push(...UPDATE_SOURCES.flatMap(s=>['cn','global'].map(c=>updateSourceURL(s.id,version[1]||version[2],c))));
        if(!valid.includes(exact)||url.username||url.password||url.search||url.hash)throw Error('更新地址超出发行范围');
        return url.href;
    }
    function allowedUpdateRedirect(requested,actual){
        if(allowedUpdateURL(requested)!==allowedUpdateURL(actual))throw Error('更新文件被重定向');
        return actual;
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
        if(!values('match').some(value=>/^https:\/\/pokecatch-online\.(?:app|netlify\.app|pages\.dev)\//.test(value)))throw new Error('更新文件缺少 PokéCatch 适用网址');
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
                const headers={};
                if(typeof GM_xmlhttpRequest==='function')handle=GM_xmlhttpRequest({method:'GET',url,anonymous:true,timeout:ms,responseType:'text',headers:{...headers,'Cache-Control':'no-cache'},
                    onload:result=>loaded({status:result.status,text:result.responseText,url:result.finalUrl}),
                    onerror:()=>finish(new Error('无法连接更新源，请检查网络或油猴域名授权')),
                    ontimeout:()=>{const error=new Error('连接更新源超时');error.name='TimeoutError';finish(error);},onabort:()=>finish(updateAbortError())});
                else{controller=new AbortController();fetch(url,{headers,cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal})
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
    const helperDigest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
    async function verifyHelperManifest(text){
        if(typeof text!=='string'||text.length>16384)throw Error('发行清单大小无效');
        const env=JSON.parse(text),decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
        const data=decode(env.data),key=await crypto.subtle.importKey('spki',decode(helperPublicKey),'Ed25519',false,['verify']);
        if(!await crypto.subtle.verify('Ed25519',key,decode(env.sig),data))throw Error('发行签名无效');
        const m=JSON.parse(new TextDecoder().decode(data)),hash=/^[a-f0-9]{64}$/;
        if(m.channel!=='stable'||m.kind!=='pokecatch-helper-release'||!/^\d+\.\d+\.\d+$/.test(m.version)||m.releaseId!=='helper-v'+m.version||!hash.test(m.bodyHash)||!/^[a-f0-9]{40}$/.test(m.sourceCommit))throw Error('正式发行身份无效');
        for(const channel of ['cn','global'])for(const kind of ['meta','user']){
            const f=m.files?.['pokecatch-helper-'+channel+'.'+kind+'.js'];if(!f||!hash.test(f.sha256)||!Number.isInteger(f.size)||f.size<1||f.size>4194304)throw Error('发行文件记录无效');
        }
        return m;
    }
    class UpdateChecker{
        constructor({request=requestUpdateResource,open=openUpdateInstaller,download=downloadUpdateScript,currentVersion=VERSION,onChange=()=>{},now=Date.now,headTimeout=4000,sourceTimeout=9000}={}){
            this.identities=new Map();this.verifyManifest=verifyHelperManifest;this.request=request;this.open=open;this.currentVersion=currentVersion;this.onChange=onChange;this.now=now;
            this.downloadFile=download;this.headTimeout=Math.max(1,Math.min(4000,Number(headTimeout)||4000));this.sourceTimeout=Math.max(1,Math.min(9000,Number(sourceTimeout)||9000));
            this.epoch=0;this.controller=null;this.sourceId='auto';this.phase='idle';this.sourceResults=[];
            this.busy=false;this.pending=null;this.checkedAt=0;this.message=`当前 v${currentVersion} · 更新来源 ZGRay00/Catch`;
        }
        changed(){try{this.onChange(this);}catch(error){console.warn('[PokéCatch 更新]',error);}}
        async check({sourceId='auto'}={}){
            if(this.busy)return null;
            const installed=installedHelperChannel();
            const first=sourceId==='auto'?(installed==='global'?'github':'cos'):sourceId;
            if(!UPDATE_SOURCES.some(s=>s.id===first))return null;
            const order=[first,...['cos','github','jsdelivr'].filter(s=>s!==first)];
            const controller=new AbortController(),epoch=++this.epoch;
            this.controller=controller;this.busy=true;this.pending=null;this.phase='checking';this.sourceId=sourceId;
            this.sourceResults=order.map(id=>({id,name:UPDATE_SOURCES.find(s=>s.id===id).name,state:'waiting'}));
            const stop=Date.now()+18000;
            const fetchText=async url=>{
                const remaining=stop-Date.now();if(remaining<1)throw Error('检查超时');
                const reply=await updateRequestWithDeadline(this.request,url,{signal:controller.signal,timeout:Math.min(remaining,this.sourceTimeout, url.endsWith('.json')?3000:9000)});
                if(reply?.url)allowedUpdateRedirect(url,reply.url);
                return typeof reply==='string'?reply:reply.text;
            };
            this.message='正在核对正式发行清单';this.changed();
            try{
                let cached=null;
                for(const row of this.sourceResults){
                    if(controller.signal.aborted||epoch!==this.epoch)return null;
                    const started=this.now();row.state='checking';this.changed();
                    try{
                        const manifest=await this.verifyManifest(await fetchText(updateSourceURL(row.id)));
                        if(controller.signal.aborted||epoch!==this.epoch)return null;
                        const channel=installed??(first==='github'||first==='jsdelivr'?'global':'cn'),version=manifest.version,entry=manifest.files['pokecatch-helper-'+channel+'.user.js'];
                        if(this.identities.has(version)&&this.identities.get(version)!==JSON.stringify(manifest.files))throw Error('同版本签名清单内容冲突');
                        this.identities.set(version,JSON.stringify(manifest.files));
                        row.version=version;
                        if(compareUpdateVersions(version,this.currentVersion)<0){row.state='skipped';cached=version;continue;}
                        const url=updateSourceURL(row.id,version,channel);
                        const text=await fetchText(url);const parsed=parseUpdateScript(text);
                        const bytes=new TextEncoder().encode(text),body=text.slice(text.indexOf('// ==/UserScript==')+'// ==/UserScript=='.length+1);
                        if(parsed.version!==version||bytes.length!==entry.size||await helperDigest(bytes)!==entry.sha256||await helperDigest(new TextEncoder().encode(body))!==manifest.bodyHash)throw Error('正文与签名发行清单冲突');
                        if(controller.signal.aborted||epoch!==this.epoch)return null;
                        if(version===this.currentVersion){this.message='当前已是正式版 v'+version;row.state='success';this.phase='complete';this.checkedAt=this.now();return {version};}
                        this.pending=Object.freeze({version,text,url,sourceId:row.id,commit:manifest.sourceCommit,hash:entry.sha256,channel});
                        row.state='success';this.phase='complete';this.checkedAt=this.now();this.message='发现 v'+version+' · '+row.name+'，已验证正式发行签名及正文';return this.pending;
                    }catch(error){if(controller.signal.aborted||epoch!==this.epoch)return null;row.state='error';row.error=String(error.message||error).slice(0,160);if(row.error.includes('冲突'))throw error;}
                    finally{row.ms=Math.max(0,this.now()-started);if(epoch===this.epoch)this.changed();}
                }
                throw Error(cached?'来源仍缓存 v'+cached+'，保留当前版本':'所有更新源暂不可用');
            }catch(error){if(epoch===this.epoch){this.message='检查失败：'+error.message;this.phase='error';}return null;}
            finally{if(epoch===this.epoch){this.controller=null;this.busy=false;this.changed();}}
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
            allowedUpdateRedirect(updateSourceURL(this.pending.sourceId,this.pending.version,this.pending.channel),url);
            return this.pending;
        }
        install(){
            if(this.busy||!this.pending)return false;
            try{const pending=this.verifiedPending();if(new URL(pending.url).hostname==='api.github.com')return this.download();
                if(this.open(pending.url)===false)throw new Error('浏览器阻止了更新页，请允许弹出窗口后重试');this.message=`已打开 v${pending.version} 安装确认页，完成后刷新游戏${pending.commit?'':'；分支地址可能变化，也可下载本次已验证快照'}`;this.changed();return true;}
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
