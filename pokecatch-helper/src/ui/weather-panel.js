    function localCalendarTime(at){
        const date=new Date(at),pad=n=>String(n).padStart(2,'0');
        return (date.getMonth()+1)+'月'+date.getDate()+'日 '+pad(date.getHours())+':'+pad(date.getMinutes());
    }
    function mountSeasonCalendar(panel){
        const title=panel.querySelector('strong'),remaining=panel.querySelector('.season-remaining');
        const period=panel.querySelector('.season-period'),next=panel.querySelector('.season-next');
        let previousMinute,previousOffset,previousStart;
        return now=>{
            const minute=Math.floor(now/60000),offset=new Date(now).getTimezoneOffset();
            if(minute===previousMinute&&offset===previousOffset)return;
            previousMinute=minute;
            const season=seasonWindow(now);
            if(season.startsAt!==previousStart||offset!==previousOffset){
                previousStart=season.startsAt;previousOffset=offset;
                panel.dataset.season=season.key;title.textContent=season.name;
                const dateLabel=at=>{
                    const time=document.createElement('time');
                    time.dateTime=new Date(at).toISOString();time.textContent=localCalendarTime(at);
                    return time;
                };
                period.replaceChildren('本季（本地时间） ',dateLabel(season.startsAt),' 至 ',dateLabel(season.endsAt));
                next.textContent='下季为'+season.nextName+'。每季 3 个日历日，四季共 12 天。';
            }
            const minutes=Math.ceil((season.endsAt-now)/60000),hours=Math.floor(minutes/60);
            remaining.textContent='剩 '+(hours>=24?Math.floor(hours/24)+'天 '+hours%24+'小时':hours?hours+'小时 '+minutes%60+'分':minutes+'分钟');
        };
    }
    function mountWeatherPanel(panel,ui,save,refresh){
        panel.innerHTML=`<fieldset class="forecast-filters"><legend>筛选地图天气</legend><div class="forecast-skies"></div></fieldset>
            <div class="forecast-options"><label>预报范围 <select aria-label="预报范围"><option value="0">本时段</option><option value="6">本时段及随后 6 小时</option><option value="24">本时段及随后 24 小时</option></select></label>
            <label><input type="checkbox">只看已解锁地图</label></div>
            <div class="forecast-results"></div><p class="hint">时间按设备本地显示。预报计入已知游荡天气，新的游荡事件可能改变结果。</p>`;
        const select=panel.querySelector('select'),scope=panel.querySelector('.forecast-options input');
        const chips=panel.querySelector('.forecast-skies'),results=panel.querySelector('.forecast-results');
        const buttons=new Map(),names=new Map(DATA.regions.map(r=>[r.key,r.name]));
        let signature=null,validFrom=0,validUntil=0;
        select.value=String([0,6,24].includes(ui.forecastHours)?ui.forecastHours:6);
        scope.checked=ui.forecastUnlocked!==false;
        select.onchange=()=>{ui.forecastHours=Number(select.value);save();refresh();};
        scope.onchange=()=>{ui.forecastUnlocked=scope.checked;save();refresh();};
        function selectSkies(values){
            ui.forecastSkies=Object.keys(WEATHER_LABELS).filter(key=>values.includes(key));
            for(const [key,button] of buttons)button.setAttribute('aria-pressed',String(ui.forecastSkies.includes(key)));
        }
        for(const [key,name] of Object.entries(WEATHER_LABELS)){
            const button=document.createElement('button');
            button.type='button';button.dataset.sky=key;
            button.textContent=(WEATHER_DATA.types[key]?.icon||'☀️')+' '+name;
            button.onclick=()=>{
                const selected=new Set(ui.forecastSkies);
                if(selected.has(key))selected.delete(key);else selected.add(key);
                selectSkies([...selected]);save();refresh();
            };
            chips.append(button);buttons.set(key,button);
        }
        selectSkies(Array.isArray(ui.forecastSkies)?ui.forecastSkies:[]);
        const clockFormat=new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
        function time(at,today){
            const date=new Date(at),clock=clockFormat.format(date);
            return date.toDateString()===today?clock:`${date.getMonth()+1}/${date.getDate()} ${clock}`;
        }
        function fillRegionDetails(block,regions){
            for(const [id,skies] of regions){
                const group=document.createElement('div'),region=document.createElement('b');
                group.className='forecast-region';region.textContent=names.get(id);group.append(region);
                for(const [sky,maps] of skies){
                    const line=document.createElement('div'),label=document.createElement('span');
                    label.textContent=WEATHER_LABELS[sky];
                    line.append(label,maps.map(({chapter,locked})=>chapter.name+(locked?'（未解锁）':'')).join('、'));group.append(line);
                }
                block.append(group);
            }
        }
        function render(s,now){
            const key=JSON.stringify([ui.forecastSkies,select.value,scope.checked,s.adv.unlocked,currentRegion(s),s.travel?.to,s.roam?.at,s.roam?.caught]);
            if(key===signature&&now>=validFrom&&now<validUntil)return;
            signature=key;validFrom=now;
            const periods=regionalWeatherForecast(s,ui.forecastSkies,Number(select.value),scope.checked,now);
            validUntil=periods[0]?.until??Infinity;
            const midnight=new Date(now);midnight.setHours(24,0,0,0);
            validUntil=Math.min(validUntil,midnight.getTime());
            const expanded=new Set([...results.querySelectorAll('details[open]')].map(row=>row.dataset.at));
            results.replaceChildren();
            if(!periods.length){results.textContent='选择一种或多种天气，查看对应的地区和地图。';return;}
            const today=new Date(now).toDateString();
            for(const [index,period] of periods.entries()){
                if(index&&!period.regions.size)continue;
                const block=document.createElement('details'),head=document.createElement('summary'),title=document.createElement('strong'),summary=document.createElement('span');
                block.dataset.at=String(period.at);block.open=index===0||expanded.has(block.dataset.at);
                title.textContent=(index===0?'现在':time(period.at,today))+' – '+time(period.until,today);
                summary.textContent=[...period.regions.keys()].map(id=>names.get(id)).join('、')||'没有符合条件的地图';
                head.append(title,summary);block.append(head);
                if(block.open)fillRegionDetails(block,period.regions);
                else block.addEventListener('toggle',function expand(){
                    if(!block.open)return;
                    fillRegionDetails(block,period.regions);
                    block.removeEventListener('toggle',expand);
                });
                results.append(block);
            }
            if(Number(select.value)&&!periods.slice(1).some(period=>period.regions.size)){
                const note=document.createElement('p');note.textContent='随后预报时段内没有匹配地图。';results.append(note);
            }
        }
        return {render,selectSkies};
    }
