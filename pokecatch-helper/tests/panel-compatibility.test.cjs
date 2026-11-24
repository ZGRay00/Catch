'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=['panel-controls.js','field-insights.js'].map(name=>
    fs.readFileSync(path.join(__dirname,'../src/ui',name),'utf8')).join('\n');

function fixture(matchMedia){
    const nodes=new Map(),all=[];
    const node=tag=>{
        const element={tag,dataset:{},children:[],listeners:{},attributes:{},value:'',classList:{toggle(){}},
            append(...elements){this.children.push(...elements);},prepend(...elements){this.children.unshift(...elements);},
            replaceChildren(...elements){this.children=elements;},
            setAttribute(key,value){this.attributes[key]=value;},removeAttribute(key){delete this.attributes[key];},
            addEventListener(key,handler){this.listeners[key]=handler;},closest(){return null;},
            querySelector(key){if(!nodes.has(key))nodes.set(key,node(key));return nodes.get(key);}
        };
        all.push(element);return element;
    };
    const context=vm.createContext({window:{matchMedia,addEventListener(){}},document:{createElement:node},
        Option:()=>{throw Error('native Option unavailable');},PANEL_STYLE:'dark',lightPanelStyles:()=>'light',
        GEODE_TIERS:['普通','稀有'],GAME_UI_ICONS:{},RaidRerollLedger:class {}});
    vm.runInContext(source,context);
    return{root:node('root'),host:node('host'),all,context};
}

for(const [name,matchMedia,initial] of [
    ['missing media-query API',undefined,'dark'],
    ['media-query access denied',()=>{throw Error('restricted');},'dark'],
    ['read-only media-query result',()=>({matches:true}),'light']
])test(name+' preserves manual theme selection',()=>{
    const {host,root,context}=fixture(matchMedia),ui={};let saves=0;
    context.mountPanelAppearance(root,host,ui,()=>saves++);
    assert.equal(host.dataset.scheme,initial);
    const select=root.querySelector('#panel-theme');select.value=initial==='dark'?'light':'dark';
    select.listeners.change();assert.equal(host.dataset.scheme,select.value);assert.equal(saves,1);
});

test('legacy media listeners still propagate theme changes',()=>{
    let onChange;
    const media={matches:false,addListener(fn){onChange=fn;}};
    const {host,root,context}=fixture(()=>media);
    context.mountPanelAppearance(root,host,{},()=>{});
    media.matches=true;onChange();assert.equal(host.dataset.scheme,'light');
});

test('field and log selectors use document option nodes when global Option is not constructible',()=>{
    const {root,all,context}=fixture(),engine={storage:{},account:'test',logHistory:()=>[{module:'core'}]};
    context.mountFieldInsights(root,engine);
    const tier=all.find(el=>el.tag==='select'&&el.attributes['aria-label']==='晶洞档位');
    assert.deepEqual(tier.children.map(option=>[option.tag,option.value,option.textContent]),[['option','0','普通'],['option','1','稀有']]);
    context.mountPanelLogs(root,engine,()=>{}).controls(true);
    const choices=root.querySelector('#log-module').children;
    assert.equal(choices[0].textContent,'全部模块');assert.equal(choices[1].value,'core');
});
