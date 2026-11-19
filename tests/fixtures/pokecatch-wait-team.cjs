module.exports=async function fit(engine,state,now){
    const result=engine.fitTeam(state,now),job=engine.teamSearch;
    if(!job)return result;
    const deadline=performance.now()+5000;
    while(!job.result&&!job.error&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,2));
    if(job.error)throw job.error;
    if(!job.result)throw Error('Team search did not produce a result');
    return engine.fitTeam(state,now);
};
