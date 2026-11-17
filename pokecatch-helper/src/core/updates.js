    const UPDATE_RELEASE=Object.freeze({repository:'ZGRay00/Catch',name:'PokéCatch 自动助手 · 图鉴 / 刷钱 / 团体战',namespace:'local.pokecatch.auto-helper',
        file:'pokecatch-helper.user.js',head:'https://api.github.com/repos/ZGRay00/Catch/git/ref/heads/main',
        download:'https://raw.githubusercontent.com/ZGRay00/Catch/main/pokecatch-helper.user.js'});
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
        if(url.protocol!=='https:'||url.username||url.password||!api&&!raw)throw new Error('更新请求仅允许指定 Catch 仓库的 HTTPS 地址');
        url.hash='';return url.href;
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
    function requestUpdateResource(value){
        const url=allowedUpdateURL(value);
        return new Promise((resolve,reject)=>{
            let settled=false,handle,controller;
            const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(result);};
            const timer=setTimeout(()=>{finish(new Error('连接更新源超时'));try{handle?.abort();controller?.abort();}catch{}},13000);
            const loaded=result=>{try{
                if(result.status!==200)throw new Error(`更新源返回 HTTP ${result.status||0}`);
                if(result.url)allowedUpdateURL(result.url);
                if(typeof result.text!=='string'||result.text.length>4*1024*1024)throw new Error('更新响应为空或过大');
                finish(null,{text:result.text,url:result.url||url});
            }catch(error){finish(error);}};
            try{
                if(typeof GM_xmlhttpRequest==='function')handle=GM_xmlhttpRequest({method:'GET',url,anonymous:true,timeout:12000,responseType:'text',headers:{'Cache-Control':'no-cache'},
                    onload:result=>loaded({status:result.status,text:result.responseText,url:result.finalUrl}),
                    onerror:()=>finish(new Error('无法连接更新源，请检查网络或油猴域名授权')),
                    ontimeout:()=>finish(new Error('连接更新源超时')),onabort:()=>finish(new Error('更新请求已取消'))});
                else{controller=new AbortController();fetch(url,{cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal})
                    .then(async result=>loaded({status:result.status,text:await result.text(),url:result.url})).catch(()=>finish(new Error('连接更新源失败，请在油猴中运行并允许访问 GitHub')));}
            }catch(error){finish(error);}
        });
    }
    function openUpdateInstaller(url){
        allowedUpdateURL(url);
        if(typeof GM_openInTab==='function'){const tab=GM_openInTab(url,{active:true,insert:true,setParent:true});return tab!==null&&tab!==false;}
        const page=window.open(url,'_blank');if(!page)return false;try{page.opener=null;}catch{}return true;
    }
    class UpdateChecker{
        constructor({request=requestUpdateResource,open=openUpdateInstaller,currentVersion=VERSION,onChange=()=>{},now=Date.now}={}){
            this.request=request;this.open=open;this.currentVersion=currentVersion;this.onChange=onChange;this.now=now;
            this.busy=false;this.pending=null;this.checkedAt=0;this.message=`当前 v${currentVersion} · 更新来源 ZGRay00/Catch`;
        }
        changed(){try{this.onChange(this);}catch(error){console.warn('[PokéCatch 更新]',error);}}
        async check(){
            if(this.busy)return null;this.busy=true;this.pending=null;this.message=`正在检查在线更新 · 本地 v${this.currentVersion}`;this.changed();
            try{
                const fresh=String(this.now()),headURL=UPDATE_RELEASE.head+'?_pokecatch_check='+encodeURIComponent(fresh);let commit=null;
                try{const reply=await this.request(headURL),head=JSON.parse(typeof reply==='string'?reply:reply.text);if(!/^[a-f0-9]{40}$/.test(head?.object?.sha||''))throw new Error('最新提交信息无效');commit=head.object.sha;}catch{}
                const url=commit?`https://raw.githubusercontent.com/${UPDATE_RELEASE.repository}/${commit}/${UPDATE_RELEASE.file}`:UPDATE_RELEASE.download+'?_pokecatch_check='+encodeURIComponent(fresh);
                const response=await this.request(url);if(response?.url)allowedUpdateURL(response.url);
                const latest=parseUpdateScript(typeof response==='string'?response:response?.text),comparison=compareUpdateVersions(latest.version,this.currentVersion);
                this.checkedAt=this.now();
                if(comparison>0){this.pending={...latest,url,commit};this.message=`发现 v${latest.version}，点击“安装新版”打开油猴确认页，完成后刷新游戏`;}
                else this.message=comparison===0?(commit?`已核对最新提交，当前为 v${this.currentVersion}`:`更新源与当前版本一致 · v${this.currentVersion}（最新提交暂未确认）`):`更新源为 v${latest.version}，本地 v${this.currentVersion} 较新`;
                return latest;
            }catch(error){this.message='检查失败：'+(error?.message||error);return null;}
            finally{this.busy=false;this.changed();}
        }
        install(){
            if(this.busy||!this.pending)return false;
            try{if(this.open(this.pending.url)===false)throw new Error('浏览器阻止了更新页，请允许弹出窗口后重试');this.message=`已打开 v${this.pending.version} 安装确认页，完成后刷新游戏`;this.changed();return true;}
            catch(error){this.message='打开更新页失败：'+(error?.message||error);this.changed();return false;}
        }
    }

    // Public game data snapshot: https://pokecatch-online.pages.dev/boot.js
    // Build b05c8cc201, 2026-11-16. This script only reads saves and clicks game controls.
    // Battle learns/moves and raid counters checked against build 1a16948eef, 2026-11-17.
    // Economy/XP and raid ally mechanisms verified against b05c8cc201, 2026-11-16.
