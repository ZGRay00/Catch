'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {compileProject}=require('../tools/build.cjs');
const script=new vm.Script(compileProject().script);

function startup(kind){
    const menus=[],waits=[],doc=Object.assign(new EventTarget(),{body:null,getElementById:()=>null});
    const wrappedDoc=new Proxy(doc,{});
    doc.isSameNode=other=>other===doc||other===wrappedDoc;
    const native={document:doc,localStorage:{getItem:()=>null}};
    native.top=native.self=native;
    const sandbox=new Proxy(native,{get(target,key){return key==='self'?sandbox:Reflect.get(target,key);}});
    doc.defaultView=kind==='wrapped document'?sandbox:native;
    if(kind==='wrapped document')native.top={document:wrappedDoc};
    if(kind==='same-origin child')native.top={document:{}};
    if(kind==='cross-origin child')native.top={get document(){throw new DOMException('Cross-origin document','SecurityError');}};
    const window=kind==='native top'?native:sandbox;
    script.runInNewContext({window,document:doc,URL,Intl,TextEncoder,TextDecoder,Event,AbortController,console,
        setTimeout:(fn,ms)=>{waits.push(ms);},GM_registerMenuCommand:name=>{menus.push(name);}});
    return {menus,waits,api:window.__pokecatchHelper};
}
test('native and sandbox-wrapped top documents register diagnostics and reach the normal mount',()=>{
    for(const kind of ['native top','wrapped window','wrapped document']){
        const result=startup(kind);
        assert.deepEqual(result.menus,['显示 / 复位助手面板','助手启动诊断'],kind);
        assert.ok(result.api,kind);assert.deepEqual(result.waits,[500],kind);
    }
});
test('neither same-origin nor cross-origin child frames mount or register menus',()=>{
    for(const kind of ['same-origin child','cross-origin child']){
        const result=startup(kind);
        assert.deepEqual(result.menus,[],kind);assert.equal(result.api,undefined,kind);assert.deepEqual(result.waits,[],kind);
    }
});
test('Node tools still get the planning model without browser globals',()=>{
    const sandbox={module:{exports:{}},URL,Intl,TextEncoder,TextDecoder};
    script.runInNewContext(sandbox);assert.equal(typeof sandbox.module.exports.Engine,'function');
});
