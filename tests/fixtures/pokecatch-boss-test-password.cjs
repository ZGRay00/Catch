'use strict';
const {createHash}=require('node:crypto');
module.exports=function useFixturePassword(source){
    const pattern=/if\(digest!=='[a-f0-9]{64}'/g;
    if(source.match(pattern)?.length!==1)throw Error('Expected one boss password verifier in the test bundle');
    const digest=createHash('sha256').update('offline-fixture-pass').digest('hex');
    return source.replace(pattern,"if(digest!=='"+digest+"'");
};
