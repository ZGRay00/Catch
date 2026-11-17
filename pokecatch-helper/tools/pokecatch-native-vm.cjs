// Isolated, synthetic data runtime for the downloaded public game bundle.
// Timers never tick, network access throws, and no browser/user storage is opened.
const vm=require('node:vm'),fs=require('node:fs'),{webcrypto}=require('node:crypto');
module.exports=function nativeRuntime(file){
 const source=fs.readFileSync(file,'utf8'),m=/([A-Za-z_$][\w$]*)\.LegendZones=\{/.exec(source),alias=m?.[1],cut=alias?source.indexOf(`,${alias}.Roaming=`,m.index):-1;
 if(cut<0)throw Error('Review changed native module boundary');
 class Element extends EventTarget{constructor(){super();this.style={};this.dataset={};this.classList={add(){},remove(){},contains(){return false;},toggle(){}};this.children=[];this.content={cloneNode:()=>new Element()};}setAttribute(){}getAttribute(){return null;}appendChild(){return new Element();}append(){}querySelector(){return null;}querySelectorAll(){return [];}getContext(){return null;}cloneNode(){return new Element();}}
 const storage=new Map(),document=Object.assign(new Element(),{body:new Element(),head:new Element(),documentElement:new Element(),createElement:()=>new Element(),getElementById:()=>null,hidden:false,visibilityState:'visible'});
 const blocked=()=>{throw Error('Network disabled in synthetic native runtime');};
 const window=new EventTarget(),context={window,document,Node:Element,HTMLElement:Element,Image:Element,EventTarget,Event,AbortController,AbortSignal,CustomEvent:class extends Event{constructor(type,options={}){super(type);this.detail=options.detail;}},console:{log(){},warn(){},error(){}},crypto:webcrypto,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},navigator:{language:'fr',languages:['fr'],userAgent:'synthetic-data-audit'},location:{origin:'https://synthetic.invalid',href:'https://synthetic.invalid/'},URL,URLSearchParams,TextEncoder,TextDecoder,structuredClone,atob,btoa,fetch:async()=>({ok:false,status:0,json:async()=>({}),text:async()=>""}),WebSocket:blocked,XMLHttpRequest:blocked,setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},requestAnimationFrame:()=>0,cancelAnimationFrame(){},performance:{now:()=>0},LANG_PICK:{pref:'fr',lang:'fr',LANGS:['fr']}};
 context.addEventListener=window.addEventListener.bind(window);context.removeEventListener=window.removeEventListener.bind(window);context.dispatchEvent=window.dispatchEvent.bind(window);
 Object.assign(window,context);window.window=window;window.self=window;window.top=window;
 const sandbox=vm.createContext(context);
 try{vm.runInContext(source.slice(0,cut)+`;globalThis.__pcResearch=${alias};})();`,sandbox,{timeout:20000});}catch(e){throw Error('Synthetic native runtime: '+e.message);}
 return{run:code=>{try{return vm.runInContext(code,sandbox,{timeout:120000});}catch(error){throw Error('Synthetic native evaluation: '+error.message);}},context:sandbox};
};


