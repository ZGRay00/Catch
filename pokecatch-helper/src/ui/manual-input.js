    function bindManualInput(engine,host,paint,showHelper){
        const pointers=new Map(), keys=new Map();
        const modifierNames=new Set(['Alt','AltGraph','Control','Meta','Shift']);
        let composing=null,dragAt=null;
        const outside=event=>event.isTrusted&&!event.composedPath().includes(host);
        const activePress=()=>document.documentElement.matches('html:active');
        function updateHeld(){
            engine.inputComposing=!!composing;
            engine.inputHeld=!!composing||dragAt!==null||pointers.size>0||keys.size>0;
        }
        function released(){
            updateHeld();
            if(engine.manual)engine.manualInput();
        }
        function clear(){
            composing=null;dragAt=null;pointers.clear();keys.clear();updateHeld();
        }
        engine.clearHeldInput=clear;
        function leavePage(){
            const held=engine.inputHeld;
            clear();
            if(held&&engine.manual)engine.manualInput();
        }
        window.addEventListener('blur',leavePage);
        document.addEventListener('visibilitychange',()=>{if(document.hidden)leavePage();});
        document.addEventListener('freeze',leavePage);

        function manualEvent(event){
            if(!engine.running||!outside(event))return;
            if(engine.automation?.rankUI)engine.automation.rankUI=null;
            if(!engine.settings.manualPause)return;
            const changed=!engine.manual,previousHeld=engine.inputHeld;
            engine.manualInput();
            if(engine.manual){
                const now=Date.now();
                if(event.type==='pointerdown'){
                    pointers.set(event.pointerId,{type:event.pointerType,target:event.target,at:now,
                        primary:event.button===0,active:event.button===0&&activePress()});
                }else if(event.type==='keydown'){
                    keys.set(event.code||event.key,{modifier:modifierNames.has(event.key)?event.key:null,at:now});
                }else if(event.type==='dragstart')dragAt=now;
                if(event.type==='compositionstart'||event.isComposing)composing=event.target;
                updateHeld();
            }
            paint(changed||previousHeld!==engine.inputHeld);
        }
        for(const name of ['pointerdown','input','compositionstart','dragstart'])document.addEventListener(name,manualEvent,true);
        document.addEventListener('wheel',manualEvent,{capture:true,passive:true});
        window.addEventListener('keydown',event=>{
            if(event.isTrusted&&event.altKey&&event.shiftKey&&event.code==='KeyP'){event.preventDefault();event.stopPropagation();showHelper();}
        },true);
        document.addEventListener('keydown',event=>{
            if(event.isTrusted&&event.key==='Escape'&&engine.running){engine.stop('Esc 停止助手');paint(true);return;}
            manualEvent(event);
        },true);
        window.addEventListener('keyup',event=>{
            if(event.isTrusted&&keys.delete(event.code||event.key))released();
        },true);
        // Chromium can report a native compositionend as untrusted. Match its active editing target.
        window.addEventListener('compositionend',event=>{
            if(!composing||event.target!==composing)return;
            composing=null;keys.delete('Process');keys.delete('Unidentified');released();paint(true);
        },true);

        function modifierSnapshot(event){
            if(!keys.size||!event.isTrusted||typeof event.getModifierState!=='function')return;
            let changed=false;
            for(const [code,key] of keys){
                if(!key.modifier)continue;
                if(event.getModifierState(key.modifier))key.at=Date.now();
                else{keys.delete(code);changed=true;}
            }
            if(changed)released();
        }
        for(const name of ['keydown','keyup','pointerdown','pointermove','wheel'])window.addEventListener(name,modifierSnapshot,{capture:true,passive:true});

        function pointerState(event){
            if(!event.isTrusted)return;
            const held=pointers.get(event.pointerId);
            if(!held)return;
            if(event.type==='pointerup'||event.type==='pointercancel'||event.buttons===0){
                pointers.delete(event.pointerId);released();
            }else{
                held.at=Date.now();
                if(held.type==='mouse'&&held.primary!==!!(event.buttons&1)){
                    held.primary=!!(event.buttons&1);held.active=false;
                }
                if(held.primary&&!held.active)held.active=activePress();
            }
        }
        for(const name of ['pointerup','pointercancel','lostpointercapture','pointermove','pointerover'])window.addEventListener(name,pointerState,{capture:true,passive:true});
        function releaseType(type){
            let changed=false;
            for(const [id,held] of pointers)if(held.type===type){pointers.delete(id);changed=true;}
            if(changed)released();
        }
        // Mouse and touch compatibility events also arrive when the game consumes pointerup.
        function mouseRelease(event){
            if(!pointers.size||!event.isTrusted||event.buttons!==0||event.sourceCapabilities?.firesTouchEvents)return;
            if(event.type!=='mouseup'&&(event.detail===0||event.pointerType&&event.pointerType!=='mouse'))return;
            releaseType('mouse');
        }
        for(const name of ['mouseup','click','auxclick'])window.addEventListener(name,mouseRelease,true);
        for(const name of ['touchend','touchcancel'])window.addEventListener(name,event=>{
            if(event.isTrusted&&event.touches.length===0)releaseType('touch');
        },{capture:true,passive:true});
        for(const name of ['drag','dragover'])window.addEventListener(name,event=>{
            if(event.isTrusted&&dragAt!==null)dragAt=Date.now();
        },{capture:true,passive:true});
        for(const name of ['dragend','drop'])window.addEventListener(name,event=>{
            if(event.isTrusted&&dragAt!==null){dragAt=null;released();}
        },true);

        // Only the task heartbeat reconciles missing events, after the configured idle period.
        engine.reconcileHeldInput=now=>{
            if(composing||(!pointers.size&&!keys.size&&dragAt===null))return;
            const idle=Math.max(10000,engine.settings.resumeSeconds*1000);
            if(dragAt!==null&&now-dragAt>=idle)dragAt=null;
            for(const [id,held] of pointers){
                const active=held.primary&&activePress();
                if(active||held.target?.hasPointerCapture?.(id)){
                    held.active||=active;held.at=now;continue;
                }
                if(dragAt===null&&(held.active||now-held.at>=idle)){
                    // Preserve the user's grace period after a long hold whose release was swallowed.
                    engine.manual.until=Math.max(engine.manual.until,held.at+engine.settings.resumeSeconds*1000);
                    pointers.delete(id);
                }
            }
            for(const [code,key] of keys){
                // Repeating keydowns and fresh modifier snapshots renew only the relevant key.
                const silence=key.modifier?Math.max(60000,idle):idle;
                if(now-key.at>=silence)keys.delete(code);
            }
            updateHeld();
        };
    }
