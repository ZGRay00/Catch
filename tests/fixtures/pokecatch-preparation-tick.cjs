'use strict';

// Run one logical coach decision, including its timer slices and the later game tick
// that consumes their result. Never advance the native clock or perform extra clicks.
async function waitForPreparation(engine, job=engine.rankingJobs.get('preparation')) {
    const deadline=performance.now()+5000;
    while(job&&engine.rankingJobs.get('preparation')===job&&!job.rows&&!job.error){
        if(performance.now()>deadline)throw Error('Preparation ranking did not finish');
        await new Promise(resolve=>setTimeout(resolve,2));
    }
}
module.exports = async function preparationTick(engine, step) {
    await step();
    const job=engine.rankingJobs.get('preparation');
    if(!job)return;
    await waitForPreparation(engine,job);
    if(engine.rankingJobs.get('preparation')===job)await step();
};
module.exports.waitForPreparation=waitForPreparation;
