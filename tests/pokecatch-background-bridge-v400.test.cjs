const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../Pokecatch自动助手.user.js');

test('default hidden behavior stays paused unless a live optional companion heartbeat exists',()=>{
    const old=global.document,now=Date.now();let value=null;
    global.document={hidden:true,documentElement:{getAttribute:()=>value}};
    try{
        assert.equal(H.backgroundKeepalive(now),false);assert.equal(H.pageHidden(),true);
        for(const invalid of ['', 'NaN','Infinity','-1',String(now+1),String(now+5001),String(now-90000)]){value=invalid;assert.equal(H.backgroundKeepalive(now),false,invalid);}
        value=String(now);assert.equal(H.backgroundKeepalive(now),true);assert.equal(H.pageHidden(),false);
        value=String(now-90001);assert.equal(H.pageHidden(),true);
        global.document.hidden=false;assert.equal(H.pageHidden(),false);
    }finally{if(old===undefined)delete global.document;else global.document=old;}
});

test('disabled, absent and expired companion heartbeats never grant background action permission',()=>{
    const old=global.document;global.document={hidden:true};
    try{assert.equal(H.pageHidden(),true);global.document.documentElement={};assert.equal(H.pageHidden(),true);}
    finally{if(old===undefined)delete global.document;else global.document=old;}
});
