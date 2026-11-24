(function () {
    'use strict';

    const VERSION = '{{VERSION}}', PREFIX = 'pokecatch-helper:v1:', SAVE_KEY = 'gachamon-save-v1';
    const hasGameDocument=typeof window!=='undefined'&&typeof document!=='undefined';
    function isTopGameDocument(doc){
        try{
            const view=doc.defaultView;
            if(!view)return false;
            const top=view.top;
            // A userscript sandbox can expose different Window wrappers for the same document.
            return view===top||doc===top.document||doc.isSameNode(top.document);
        }catch{return false;} // Cross-origin top documents are intentionally inaccessible.
    }
    if(hasGameDocument&&!isTopGameDocument(document))return;
    function backgroundKeepalive(now=Date.now()) {
        if(typeof document==='undefined')return false;
        const stamp=Number(document.documentElement?.getAttribute?.('data-pc-helper-background-at'));
        return Number.isFinite(stamp)&&stamp>0&&stamp<=now&&now-stamp<90000;
    }
    function pageHidden(){return typeof document!=='undefined'&&!!document.hidden&&!backgroundKeepalive();}
    let startupPhase='正在载入数据',startupError='';
    function revealHost(host){
        if(!host)return false;
        if(!host.isConnected&&document.body)document.body.appendChild(host);
        for(const [key,value]of [['display','block'],['visibility','visible'],['opacity','1']])host.style.setProperty(key,value,'important');
        return true;
    }
    function startupReport(){
        const host=document.getElementById('pokecatch-auto-helper'),box=host?.getBoundingClientRect(),style=host&&getComputedStyle(host);
        return [`PokéCatch 自动助手 ${VERSION}`,`启动阶段：${startupPhase}`,`面板节点：${host?'存在':'不存在'}`,
            host?`显示状态：${style.display} / ${style.visibility}，尺寸 ${Math.round(box.width)}×${Math.round(box.height)}`:'',
            `游戏休眠：${document.documentElement?.classList.contains('sleeping')?'是':'否'}`,startupError?`错误：${startupError}`:''].filter(Boolean).join('\n');
    }
    let restorePanel=()=>{
        const host=document.getElementById('pokecatch-auto-helper');
        if(revealHost(host)){
            host.style.left='auto';host.style.right='14px';host.style.top='86px';host.style.bottom='auto';
            host.shadowRoot?.querySelector('.panel')?.classList.remove('hidden');host.shadowRoot?.querySelector('.mini')?.classList.add('hidden');return true;
        }
        alert(startupReport());return false;
    };
    function showStartupError(err){
        if(typeof document==='undefined')throw err;
        startupError=String(err?.message||err);startupPhase='初始化失败';
        console.error('[PokéCatch 自动助手]',err);
        const show=()=>{
            if(!document.body){setTimeout(show,500);return false;}
            document.getElementById('pokecatch-auto-helper')?.remove();
            let notice=document.getElementById('pokecatch-helper-recovery');
            if(!notice){notice=document.createElement('div');notice.id='pokecatch-helper-recovery';document.body.appendChild(notice);}
            notice.style.cssText='display:block!important;visibility:visible!important;opacity:1!important;position:fixed;right:14px;bottom:14px;z-index:2147483647;max-width:calc(100vw - 28px);padding:14px;border:1px solid #e6be7a;border-radius:12px;background:#111a29;color:#e6edf8;font:13px/1.6 system-ui;white-space:pre-wrap;';
            const message=document.createElement('div');message.textContent='助手初始化失败：'+startupError+'\n可从油猴菜单打开“助手启动诊断”并提供具体内容。';
            const retry=document.createElement('button');retry.textContent='刷新页面重试';retry.style.cssText='margin-top:8px;padding:6px 10px;cursor:pointer;';retry.onclick=()=>location.reload();
            notice.replaceChildren(message,retry);return false;
        };
        restorePanel=show;show();
    }
    // Register before loading the data/model so the menu also diagnoses early failures.
    if(typeof GM_registerMenuCommand==='function'&&hasGameDocument){
        try{GM_registerMenuCommand('显示 / 复位助手面板',()=>restorePanel());GM_registerMenuCommand('助手启动诊断',()=>alert(startupReport()));}catch(err){console.warn('[PokéCatch 自动助手] 菜单不可用',err);}
    }
    try{

