    const PANEL_STYLE = `
            .trainee-list{min-width:0;margin:8px 0;padding:8px;border:1px solid currentColor;border-radius:8px}.trainee-list legend{padding:0 4px;font-weight:600}.trainee-list details{margin:6px 0}.trainee-list input[type="search"]{width:100%;margin:5px 0}.trainee-list #train-pc{max-height:166px;overflow:auto;overscroll-behavior:contain}.trainee-list label{overflow-wrap:anywhere}.trainee-list small{display:block}
:host{font:13px/1.5 system-ui,"Microsoft YaHei",sans-serif;color:#e6edf8;color-scheme:dark}
            *{box-sizing:border-box}button,input,select{font:inherit}button,select,summary{cursor:pointer}button:disabled{opacity:.4;cursor:default}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid #79dcba;outline-offset:2px}
            .panel{width:406px;max-width:calc(100vw - 20px);border:1px solid #39465c;border-radius:18px;background:#111a29f5;box-shadow:0 16px 55px #0007;overflow:hidden;backdrop-filter:blur(18px)}
            header{display:flex;align-items:center;gap:7px;padding:13px 14px;background:linear-gradient(115deg,#21364a,#1b263d);cursor:move;touch-action:none;user-select:none}header b{font-size:13px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}header small{display:block;font-size:8px;font-weight:400;letter-spacing:.6px;color:#90a8bd}.logo{background:#79dcba;color:#102d29;border-radius:10px;padding:5px 9px;font-weight:900;font-size:19px}.tag{font:10px ui-monospace,monospace;color:#9aaec4}header button{padding:3px 10px}
            #check-update{font-size:10px;padding:5px 7px;white-space:nowrap}#check-update.available{border-color:#79dcba;color:#a3f0d3}.update-notice{padding:8px 10px;margin-bottom:8px;border:1px solid #45627b;border-radius:9px;background:#192c40;font-size:11px;overflow-wrap:anywhere}.update-notice.available{border-color:#79dcba;color:#a3f0d3}.update-source a{color:#9cded1}.update-source-row{display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid #2b3e51;font-size:11px}.update-source-row span:last-child{min-width:0;text-align:right;overflow-wrap:anywhere}.update-source-row[data-state=error]{color:#e9b9a3}#update-tools .row{margin:7px 0}#update-tools .hint{margin-bottom:8px}
            button{border:1px solid #3d4b62;border-radius:9px;padding:7px 10px;background:#223048;color:#e8f0fb}button:hover:enabled{background:#304361}button.primary{background:#79dcba;border-color:#79dcba;color:#102d29;font-weight:750}button.primary:hover:enabled{background:#9be9ce}.danger{border-color:#754350;color:#ffc5cf;background:#422a39}
            .content{padding:12px;overflow:auto;scrollbar-width:thin;scrollbar-color:#465971 transparent}.status{padding:11px 12px;border:1px solid #33435b;background:#0b1423;border-radius:12px;overflow-wrap:anywhere}.live{display:flex;align-items:center;gap:6px;color:#93a8c2;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px}.dot{width:6px;height:6px;border-radius:50%;background:#8191a8}.running .dot{background:#79dcba;box-shadow:0 0 9px #79dcba80}.running .live{color:#79dcba}#status{font-size:12px}.sub{font-size:11px;color:#95a9c2;margin-top:4px}#action{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
            .metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:9px 0 12px}.metric{padding:9px 4px;text-align:center;background:#1b293d;border:1px solid #2b3b53;border-radius:10px;font-size:10px;color:#99aec7}.metric b{display:block;font-size:18px;letter-spacing:-.5px;color:#d7e7f9;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.metric:first-child b{color:#87e3c3}
            .caption{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#91a8c1;margin:9px 0 6px}.modes{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.modes button{text-align:left;padding:9px;font-size:11px;background:#182438;line-height:1.4}.modes button span{display:block;font-size:15px;margin-bottom:3px;color:#a9bfd8}.modes button.on{background:#203d3e;border-color:#79dcba;color:#b5f5de}.modes button.on span{color:#79dcba}
            .target{padding:10px;border:1px solid #33455c;border-radius:11px;background:#162236;margin:9px 0}.field{display:flex;gap:9px;align-items:center;margin:6px 0}.field>span,.field>label{flex:0 0 82px;color:#b6c8df;font-size:12px}.field select{flex:1;width:0}.field input{flex:1;width:0}select,input[type=number],input[type=search]{min-width:0;width:100%;border:1px solid #3d506a;background:#0e192a;color:#edf4ff;border-radius:7px;padding:7px}input[type=number]{font-variant-numeric:tabular-nums}.hint{font-size:11px;color:#8fa7c2;line-height:1.65;margin:6px 0 0}.warn{color:#e6be7a}.goal{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:#b9cde4;margin-top:9px}.bar{height:4px;overflow:hidden;border-radius:3px;background:#30415a;margin-top:5px}.bar i{display:block;height:100%;width:0;background:#79dcba;transition:width .3s ease}.row{display:flex;gap:7px;margin:10px 0}.row button{flex:1;padding:10px}.checks{display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:11px}.checks label{display:flex;align-items:flex-start;gap:5px;color:#becce0}input[type=checkbox]{accent-color:#79dcba;margin:3px 0 0}
            details{margin:10px 0;border-top:1px solid #2c3b51;padding-top:8px}summary{font-size:11px;color:#9fb7d4}.setting{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:8px 0;font-size:11px}.setting input[type=number],.setting select{width:125px}.setting input[type=checkbox]{margin-right:5px}.tabs{display:flex;border-bottom:1px solid #34465c;gap:4px;margin:12px 0 0}.tabs button{flex:1;border:none;border-radius:7px 7px 0 0;background:transparent;color:#8da7c6;font-size:11px;padding:8px 4px}.tabs button.on{background:#22334a;color:#a3f0d3;box-shadow:inset 0 -2px #79dcba}.list{max-height:185px;overflow:auto;scrollbar-width:thin;min-height:44px;padding:4px 0}table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:7px 4px;border-bottom:1px solid #28394f;text-align:left}th{font-weight:400;color:#8ca4c0;position:sticky;top:0;background:#111a29}td:last-child,th:last-child{text-align:right}tr.active td{color:#8ce8c7}.missing{display:flex;gap:5px;flex-wrap:wrap;padding:6px 0}.chip{padding:3px 6px;background:#23344b;border-radius:6px;font-size:11px}.log{font-size:11px;padding:5px 0;border-bottom:1px solid #25364b;overflow-wrap:anywhere}.log time{color:#859dbb;margin-right:6px}.empty{padding:15px 8px;color:#93abc7;font-size:11px}.actions{display:flex;gap:5px;padding-top:8px;border-top:1px solid #2e3f55}.actions button{flex:1;font-size:10px;padding:5px}.mini{border-radius:30px;box-shadow:0 4px 24px #0008;background:#1e3346;padding:10px 15px;border-color:#79dcba;display:flex;align-items:center;gap:8px}.mini.running::before{content:'';width:6px;height:6px;border-radius:50%;background:#79dcba}.hidden{display:none!important}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
            .mini{touch-action:none;user-select:none;cursor:grab;max-width:calc(100vw - 20px)}.mini:active{cursor:grabbing}#mini-state{min-width:0;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.status.manual{border-color:#8b713f}.manual .dot{background:#e6be7a;box-shadow:none}.manual .live{color:#e6be7a}.mini.manual{border-color:#e6be7a}.mini.manual::before{background:#e6be7a}
            .execution-card{padding:10px;border:1px solid #344b5c;border-radius:11px;background:#142431;margin:10px 0}.execution-top{display:flex;justify-content:space-between;gap:8px;font-size:10px;color:#9ab8c7;margin-bottom:5px}#ui-owner{max-width:68%;text-align:right;overflow-wrap:anywhere;color:#9bd9c4}#foreground-task{font-size:12px;color:#e1f2f3}#foreground-detail{font-size:10px;color:#9bb3c4;line-height:1.5;margin:3px 0 7px;overflow-wrap:anywhere}.service-row{display:grid;grid-template-columns:78px auto 1fr;gap:6px;align-items:start;margin:5px 0;font-size:10px}.service-label{color:#bed2de}.service-state{white-space:nowrap;padding:1px 5px;border-radius:4px;background:#283b4a;color:#b7c8d6}.service-detail{min-width:0;color:#91aabd;overflow-wrap:anywhere}.service-row[data-state=ready] .service-state,.service-row[data-state=running] .service-state{color:#b6f0d7;background:#235045}.service-row[data-state=waiting] .service-state,.service-row[data-state=blocked] .service-state{color:#f0d29d;background:#4d4030}#concurrency-note{border-top:1px solid #2d4655;padding-top:6px;margin-top:7px;font-size:10px;color:#8faeba;line-height:1.5}#parallel-rules{margin:6px 0 10px}#parallel-rules table{font-size:10px}#parallel-rules td:first-child{width:48%}#parallel-rules td:last-child{text-align:left;color:#a8d3c1}.background-toggles{margin:7px 0;font-size:11px}.background-toggles label{align-items:flex-start}
            @media(max-width:450px){.panel{width:360px;border-radius:14px}.content{padding:10px}header{padding:10px 12px}.metric b{font-size:16px}.list{max-height:155px}.modes button{padding:7px}.field>span,.field>label{flex-basis:74px}}
            @media(prefers-reduced-motion:reduce){*{transition:none!important}}
            .categories{display:flex;gap:4px;padding:3px;background:#0b1423;border-radius:9px;margin-bottom:7px}.categories button{flex:1;border:0;background:transparent;color:#93abc7;font-size:11px;padding:6px 3px}.categories .on{color:#b5f5de;background:#23403e}.modes{grid-template-columns:repeat(2,1fr)}.modes button span{display:inline-block;width:22px;margin:0 4px 0 0;vertical-align:middle}.queue-tools{display:flex;gap:6px;margin:8px 0}.queue-tools button{flex:1;font-size:11px;padding:7px}.queue-tools #queue-count{display:inline-block;min-width:17px;background:#102138;border-radius:10px;margin-left:3px}#budget-summary{float:right;color:#91d2ba;font-size:10px}.wait-time{color:#e6be7a;font-variant-numeric:tabular-nums}.flow-list{display:grid;gap:6px;padding:6px 0}.flow-list .step{padding:8px;background:#1a293c;border-radius:8px;font-size:11px;color:#b8cce3}.flow-list .step b{color:#87e3c3;margin-right:7px}
            .commandbar{padding:9px 12px;background:#172337;border-top:1px solid #34465c}.commandbar .row{margin:0}.commandbar .queue-tools{margin:6px 0 0}@media(max-width:450px){.commandbar{padding:8px 10px}}

    .purchase-card {
        margin:10px 0; padding:10px 12px; background:#162739;
        border:1px solid #3b586d; border-radius:10px; overflow-wrap:anywhere;
    }
    .purchase-card[hidden] { display:none }
    .purchase-toggle {
        display:flex; align-items:center; gap:8px; min-height:32px; cursor:pointer;
    }
    .purchase-toggle strong { flex:1; color:#e3edf7; font-size:13px }
    [data-purchase-state] { color:#adc0d2; font-size:11px }
    .purchase-toggle input[type=checkbox] {
        appearance:none; flex:none; position:relative; width:38px; height:22px;
        margin:0; padding:0; border:1px solid #697f93; border-radius:20px;
        background:#263a4c; cursor:pointer;
    }
    .purchase-toggle input::after {
        content:''; display:block; width:14px; height:14px; margin:3px;
        border-radius:50%; background:#cad7e3;
    }
    .purchase-toggle input:checked { background:#79dcba; border-color:#79dcba }
    .purchase-toggle input:checked::after { transform:translateX(16px); background:#133b31 }
    .purchase-toggle input:disabled { opacity:.55; cursor:default }
    #budget-details input[aria-invalid="true"] { outline:2px solid #edac61; outline-offset:1px }
    .purchase-budget {
        display:flex; flex-wrap:wrap; align-items:center; gap:5px 10px; margin-top:7px;
        color:#bbdfd8; font-size:11px; font-variant-numeric:tabular-nums;
    }
    .purchase-budget span { flex:1; min-width:9em }
    #purchase-edit-budget { font-size:11px; padding:5px 9px }
    #budget-details { margin-bottom:0 }
    #purchase-limits { margin:8px 0; font-variant-numeric:tabular-nums }
    .panel {
        display:flex; flex-direction:column;
        max-height:calc(100dvh - 100px); background:#101a26;
        border:1px solid #405467; border-radius:15px;
        box-shadow:0 16px 48px #040c1873;
    }
    header,.commandbar,.workspace-nav { flex:none }
    header { padding:10px 13px; background:#1b2c3a }
    header b { font-size:15px }
    .logo { padding:2px 8px; border-radius:7px }
    .workspace-nav { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.45fr) repeat(3,minmax(0,1fr)) minmax(0,1.45fr) minmax(0,1fr); border-bottom:1px solid #324858 }
    .workspace-nav button {
        min-height:42px; padding:4px 2px; white-space:nowrap; border:0; border-radius:0; background:transparent;
        color:#acbecb; font-weight:600;
    }
    .workspace-nav button[aria-pressed=true] { color:#a5f1d8; box-shadow:inset 0 -3px #72d9b8; background:#1a302f }
    .workspace-nav button:focus-visible { outline-offset:-4px }
    .content { min-height:0; overflow:auto; overscroll-behavior:contain; padding:11px 13px }
    .content section[hidden] { display:none }
    .lookup-page .content > .status, .lookup-page .metrics, .lookup-page #prepare-info,
    .lookup-page #support-info, .lookup-page #season-calendar { display:none }
    .commandbar .lookup-task, .lookup-page .commandbar:not(.has-task),
    .lookup-page .commandbar .queue-tools, .lookup-page .commandbar #start { display:none }
    .panel:not(.queue-page) #start-queue,
    .queue-page .commandbar .queue-tools, .queue-page #start,
    .queue-page .content > .status, .queue-page .metrics, .queue-page #prepare-info,
    .queue-page #support-info, .queue-page #season-calendar, .queue-page #spirit-conditions { display:none }
    .queue-page .content { padding-block:12px }
    .queue-heading { display:flex; align-items:center; justify-content:space-between; gap:10px; margin:0 0 10px }
    .queue-heading h2 { font-size:16px; margin:0 0 3px; color:#edf7f6 }
    .queue-heading p, .queue-notice, .queue-job-detail { margin:0; color:#b1c7d9; font-size:12px; overflow-wrap:anywhere }
    .queue-heading button { font-size:12px; min-height:36px; flex:none }
    .queue-notice:not([hidden]) { padding:8px 10px; margin:0 0 9px; border:1px solid #375669; border-radius:8px; background:#192d3b }
    .queue-list { display:grid; gap:7px; list-style:none; margin:0; padding:0 }
    .queue-job, .queue-empty { border:1px solid #33495d; border-radius:10px; padding:9px; background:#152232 }
    .queue-empty { border-style:dashed; padding:16px 12px; color:#a9bfd1; font-size:12px }
    .queue-job[aria-current=step] { border-color:#6db79f; background:#1a3338 }
    .queue-job-head { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:start; gap:7px }
    .queue-job-head strong { font-size:13px; line-height:1.35; overflow-wrap:anywhere }
    .queue-position, .queue-state { padding:2px 5px; border-radius:5px; background:#24384d; font-size:10px; font-variant-numeric:tabular-nums; white-space:nowrap }
    .queue-state[data-state=running], .queue-state[data-state=done] { color:#a2e5d0; background:#21443e }
    .queue-state[data-state=paused], .queue-state[data-state=failed] { color:#f2cf93; background:#473924 }
    .queue-job-detail { margin-top:6px }
    .queue-item-counts { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:7px 0 0 }
    .queue-item-counts dt {font-size:11px}
    .queue-item-counts dd {margin:2px 0 0;font-size:14px;font-weight:650;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
    .queue-job-actions { display:flex; flex-wrap:wrap; gap:4px; margin-top:7px }
    .queue-job-actions button { min-height:32px; padding:5px 7px; font-size:11px }
    .queue-job-actions button[data-job-action=remove] { color:#f1b3bc }
    .lookup-page .commandbar .lookup-task { display:block; flex:1; color:#b4cbd4; font-size:12px; overflow-wrap:anywhere }
    .lookup-page .commandbar .row button { flex:0 1 auto; min-height:36px }
    .dex-searchbar { display:flex; align-items:center; gap:6px; margin:2px 0 12px }
    .dex-searchbar input { flex:1; min-width:0; min-height:38px; padding:7px 10px; border:1px solid #465b70; border-radius:8px; background:#0f1927; color:#edf4f8 }
    #pane-dex #dex-results { max-height:min(54dvh,520px) }
    .insight-nav { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:3px; margin:0 0 12px; padding:3px; border:1px solid #36485c; border-radius:11px; background:#101a29 }
    .insight-nav button { min-width:0; min-height:36px; padding:4px 2px; border:1px solid transparent; background:transparent; color:#b7c8d7; font-weight:600; border-radius:8px }
    .insight-nav button[aria-pressed=true] { background:#213d42; color:#b4f3df; border-color:#47716b }
    #dex-panel [hidden] { display:none!important }
    #game-insights { min-width:0; color:#dce7ef; font-size:13px }
    .insight-controls,.dex-owned-tools { display:grid; gap:8px; padding:10px; border:1px solid #35485c; border-radius:11px; background:#172536 }
    .insight-field { display:grid; gap:3px; min-width:0; color:#c0d1de; font-size:12px }
    .insight-field select,.insight-field input,.dex-owned-tools select { width:100%; min-width:0; max-width:100%; min-height:35px; padding:5px 7px; border:1px solid #4a6072; border-radius:7px; background:#111e2d; color:#edf4f8; font-size:13px; text-overflow:ellipsis }
    .insight-picks { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(130px,100%),1fr)); gap:8px }
    .insight-pages,.insight-actions,.dex-owned-actions { display:flex; flex-wrap:wrap; align-items:center; gap:6px }
    .insight-pages { justify-content:space-between; font-size:12px; color:#b4c6d4 }
    .insight-pages button,.insight-actions button,.dex-owned-actions button { min-height:32px; padding:4px 9px; font-size:12px }
    .dex-owned-tools { margin:8px 0 10px }
    #game-insights .insight-title { margin:13px 0 2px; font-size:16px; line-height:1.4; overflow-wrap:anywhere; color:#e2edea }
    .insight-context,.insight-note,.insight-notice { margin:2px 0 9px; line-height:1.5; color:#afc3d1; font-size:12px; overflow-wrap:anywhere }
    .insight-notice { color:#eacc91; padding:6px 9px; border-left:3px solid #bda162; background:#2a2c29 }
    #game-insights .insight-metrics { width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; border:1px solid #3b4f60; border-radius:10px; overflow:hidden; margin:6px 0 }
    .insight-metrics th,.insight-metrics td { position:static; padding:7px 6px; background:transparent; color:#dce7ef; overflow-wrap:anywhere; border:0; border-bottom:1px solid #344657; vertical-align:middle; font-variant-numeric:tabular-nums }
    .insight-metrics thead th { font-size:11px; font-weight:650; background:#203142; text-align:right; color:#c5d5df }
    .insight-metrics thead th span,.insight-metrics tbody th small { display:block; line-height:1.35 }
    .insight-metrics thead th:first-child,.insight-metrics tbody th { text-align:left; width:32%; }
    .insight-metrics tbody th { font-size:12px; font-weight:600 }
    .insight-metrics tbody th small { margin-top:2px; color:#a4bbca; font-size:10px; font-weight:400 }
    .insight-metrics tbody td { font-size:15px; font-weight:650; text-align:right }
    .insight-metrics tbody td.insight-leading { color:#a2efd2; background:#1b3437 }
    .insight-metrics tbody tr:last-child>* { border-bottom:0 }
    #game-insights .insight-detail,#game-insights .insight-move-group { padding:0; margin:7px 0; border:1px solid #35485c; border-radius:9px; background:#152231; overflow:hidden }
    #game-insights details>summary { min-height:34px; padding:7px 9px; color:#c3d9e3; font-size:12px; font-weight:600; cursor:pointer }
    #game-insights details>summary:focus-visible { outline-offset:-3px }
    .insight-detail .insight-note,.insight-breakdown { margin:0; padding:7px 10px; border-top:1px solid #334456 }
    .insight-breakdown p { margin:2px 0; color:#b5c9d5; font-size:12px }
    .insight-move-group[data-move-group=consider]>summary { color:#f0cf91!important }
    .insight-count { margin-left:6px; border-radius:8px; padding:0 6px; color:#d6e3eb; background:#304457; font-variant-numeric:tabular-nums }
    .insight-move-group ul { list-style:none; margin:0; padding:0 }
    .insight-move-group li { padding:7px 10px; border-top:1px solid #344657; overflow-wrap:anywhere }
    .insight-move-line { display:flex; justify-content:space-between; gap:8px; align-items:baseline }
    .insight-move-line span,.insight-move-group small { color:#afc5d3; font-size:11px }
    .insight-move-group p { margin:3px 0 0; color:#c4d4dd; font-size:12px }
    @media(pointer:coarse) {
        .insight-nav button,.insight-field select,.insight-field input,.insight-actions button,.insight-pages button,.dex-owned-actions button,.dex-owned-tools select,#game-insights details>summary { min-height:44px }
    }
    #pane-eggs h3 { margin:14px 0 6px; font-size:13px; color:#def1eb }
    .roam-ball-control:not([hidden]) { display:flex; flex-wrap:wrap; align-items:center; gap:4px 8px; margin:8px 0; padding:7px 8px; border:1px solid #3b4e63; border-radius:8px }
    .roam-ball-control > strong { margin-inline-start:auto; color:#b1e6d6; font-size:11px; font-variant-numeric:tabular-nums }
    .roam-ball-control > .hint { flex-basis:100%; margin:0 }
    .nursery-card { background:#172335; border:1px solid #3b4e63; border-radius:12px; padding:10px }
    .nursery-heading, .nursery-tools, .nursery-section-heading { display:flex; align-items:center; justify-content:space-between; gap:6px 10px; flex-wrap:wrap }
    .nursery-heading h3 { margin:0!important; font-size:15px!important }
    .nursery-title { display:flex; flex-wrap:wrap; align-items:center; gap:4px 7px }
    #nursery-rule-notice { color:#efc47c; font-size:11px }
    .nursery-section-heading { margin:14px 0 6px }
    .nursery-section-heading h3 { margin:0!important }
    #nursery-summary, #nursery-parent-summary { color:#aac2cc; font-size:11px; font-variant-numeric:tabular-nums }
    .nursery-metrics { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:4px; margin:8px 0; padding:6px 0; text-align:center; font-size:11px; color:#b7c8d7; background:#111c2d; border-radius:8px }
    .nursery-metrics b { display:block; color:#e0f1ed; font-size:16px; font-variant-numeric:tabular-nums }
    #nursery-estimated:not(:empty) { display:block; color:#efc47c; font-size:10px }
    .nursery-metrics > div + div { border-left:1px solid #334655 }
    .nursery-egg { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:7px; align-items:start; padding:7px 0; border-bottom:1px solid #344459 }
    .nursery-egg > div { min-width:0; overflow-wrap:anywhere }
    .nursery-egg > span { color:#b6c7d5; font-size:11px; font-variant-numeric:tabular-nums }
    .nursery-egg[data-shiny=true] > div { color:#ffe1a3 }
    #nursery-eggs:empty, #nursery-feed:empty, #nursery-forecast:empty { display:none }
    .nursery-tools { margin-top:10px; padding:8px 0; border-block:1px solid #34495d }
    #nursery-parents { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(130px,100%),1fr)); gap:5px }
    .nursery-parent { display:grid; grid-template-columns:auto minmax(0,1fr); align-content:start; gap:1px 5px; padding:5px 6px; border:1px solid #344459; border-radius:7px; background:#111c2d; overflow-wrap:anywhere }
    .nursery-parent small { grid-column:2; color:#aebed2; font-size:11px }
    .nursery-slot, #nursery-prediction-state { align-self:start; border-radius:4px; padding:1px 4px; color:#b1e6d6; background:#24433f; font-size:10px }
    .nursery-laying { padding-top:7px }
    .nursery-laying > div { display:flex; justify-content:space-between; flex-wrap:wrap; gap:2px 8px; color:#b7c8d7; font-size:11px }
    .nursery-card progress { display:block; width:100%; height:5px; margin:4px 0; accent-color:#79dcba }
    .nursery-next-card { background:#101b2b; border-left:2px solid #79dcba; border-radius:7px; padding:8px; overflow-wrap:anywhere }
    .nursery-next-card .sub { margin-top:3px }
    #nursery-berry-plan:not([hidden]) { display:grid; grid-template-columns:auto minmax(0,1fr); gap:6px 10px; background:#10282b; border-left:3px solid #69cbb0; padding:9px; border-radius:6px }
    #nursery-berry-plan dt { color:#a2ddc9; font-size:11px }
    #nursery-berry-plan dd { margin:0; overflow-wrap:anywhere; font-size:12px }
    #nursery-comparison { padding:7px 9px; border:1px solid #3b4e63; border-radius:8px }
    #nursery-comparison > summary { padding:2px 0; font-weight:650 }
    #nursery-comparison-grid { display:grid; gap:6px; margin-top:7px }
    .nursery-scenario { min-width:0; background:#111c2d; border:1px solid #344459; border-radius:7px; padding:6px 8px }
    .nursery-scenario-heading { display:flex; align-items:center; flex-wrap:wrap; gap:4px 8px; font-size:12px }
    .nursery-rate { color:#aac2cc; font-variant-numeric:tabular-nums }
    .nursery-scenario[data-berry=true] .nursery-rate { color:#d6b8f8 }
    .nursery-predictions { list-style:none; padding:0; margin:5px 0 0 }
    .nursery-predictions li { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:6px; padding:3px 0; border-top:1px solid #2f4052; font-size:11px }
    .nursery-predictions li > span { display:flex; align-items:baseline; flex-wrap:wrap; gap:0 6px; min-width:0 }
    .nursery-predictions li b { color:#e1eaf1 }
    .nursery-predictions small { color:#b2c3d4; font-size:inherit; overflow-wrap:anywhere }
    .nursery-predictions code { color:#a9d5c9; font-variant-numeric:tabular-nums }
    .nursery-preference { margin-top:10px }
    .nursery-feed-permission { margin:4px 0 8px 9px; padding-left:10px; border-left:2px solid #3b536b }
    .nursery-feed-permission .setting { margin:0 }
    .nursery-feed-permission .hint { margin:0 0 4px }
    #nursery-eggs .nursery-egg[data-ready=true] > span { color:#99e6bd }
    .metrics { gap:0; margin:6px 0 12px; padding:7px 0; background:#172637; border-radius:9px }
    .metric { background:transparent; border:0; border-radius:0; padding:2px 4px; line-height:1.45 }
    .metric + .metric { border-left:1px solid #334655 }
    .metric b { font-size:17px }
    .status { border-radius:9px; padding:9px 11px }
    #action { white-space:normal }
    .categories { margin-bottom:9px }
    .categories button { padding:7px 2px }
    .caption, #pane-settings h3 { font-size:12px; font-weight:650; letter-spacing:normal; color:#cbdae6; margin:10px 0 7px }
    #pane-settings > details, #pane-activity > details {
        border:1px solid #34495d; background:#152232; border-radius:9px; padding:8px 10px;
    }
    summary { font-size:12px; color:#c2d3df }
    .field,.setting { min-height:28px }
    .list { max-height:min(38dvh,330px) }
    .legend-picker { margin:0 0 10px; border:1px solid #38536a; border-radius:10px; background:#111f2e }
    .legend-picker > summary { display:grid; grid-template-columns:auto minmax(0,1fr) 8px; align-items:center; gap:10px; min-height:44px; padding:8px 11px; border-radius:9px; list-style:none }
    .legend-picker > summary::-webkit-details-marker { display:none }
    .legend-picker > summary::after { content:''; width:6px; height:6px; border:solid #9fb7c8; border-width:0 1.5px 1.5px 0; transform:rotate(45deg) }
    .legend-picker[open] > summary::after { transform:rotate(225deg) }
    .legend-picker > summary strong { color:#e4eff9 }
    #legend-selection { color:#a8e5d4; text-align:right; overflow-wrap:anywhere }
    .legend-tools { display:flex; gap:6px; padding:8px; border-top:1px solid #30485d }
    .legend-tools input { flex:1; min-width:0; min-height:40px }
    .legend-tools button { flex:none; min-width:52px }
    .legend-list { max-height:min(36dvh,300px); overflow:auto; padding:0 8px; scrollbar-width:thin }
    .legend-list[hidden] { display:none }
    #legend-order { margin:0 8px 6px; border-block:1px solid #52677866 }
    #legend-order > summary { cursor:pointer; padding:7px 2px; font-weight:600 }
    #legend-order ol { margin:0 0 6px; padding:0 3px 0 30px; max-height:165px; overflow:auto }
    #legend-order li { padding:3px 0; font-variant-numeric:tabular-nums }
    #legend-order li span { display:inline-block; width:calc(100% - 92px); vertical-align:middle; overflow-wrap:anywhere }
    #legend-order li button { min-height:30px; padding:3px 6px; margin-left:3px }
    .legend-list fieldset { min-width:0; margin:0 0 8px; padding:0; border:0 }
    .legend-list legend { padding:0 1px 3px; color:#9db6c9; font-size:11px }
    .legend-option { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; margin:0 0 3px; border:1px solid transparent; border-radius:7px; background:#1a2a3d }
    .legend-option[hidden] { display:none }
    .legend-option.selected { border-color:#436f69; background:#1c3a3a }
    .legend-option label { display:flex; align-items:center; gap:9px; min-width:0; min-height:44px; padding:4px 8px; cursor:pointer }
    .legend-option label input { flex:none; margin:0; width:16px; height:16px; accent-color:#79dcba }
    .legend-option label span { min-width:0; overflow-wrap:anywhere }
    .legend-option label strong,.legend-option label small { display:block; line-height:1.25 }
    .legend-option label small { margin-top:2px; color:#b2c4d5; font-size:11px }
    .legend-option button { min-height:40px; min-width:44px; margin:2px; padding:4px 7px; border-color:transparent; background:transparent; color:#a6ddd3; font-size:11px }
    #legend-empty { margin:4px 9px 8px }
    .legend-footer { display:flex; flex-wrap:wrap; justify-content:space-between; gap:3px 10px; padding:7px 9px; border-top:1px solid #30485d; color:#9eb4c8; font-size:11px }
    #legend-count { color:#cae7e4; font-variant-numeric:tabular-nums }
    #dex-clear { flex:none; min-height:38px; padding:5px 8px; font-size:12px }
    .dex-list-title, .dex-heading { margin:0 0 8px; line-height:1.5 }
    .dex-list-title { font-size:13px; color:#cedeeb }
    .dex-targets, .dex-compact { display:grid; gap:5px; padding:2px }
    .dex-target { display:grid; grid-template-columns:4ch minmax(0,1fr) auto 7px; gap:10px; align-items:center; min-height:46px; padding:8px 10px; text-align:left; background:#19283a; border-color:#33485b }
    .dex-target::after { content:''; width:6px; height:6px; border-top:1.5px solid #91aaba; border-right:1.5px solid #91aaba; transform:rotate(45deg) }
    .dex-number { font:11px ui-monospace,monospace; color:#a4b7c6 }
    .dex-target-body { min-width:0; display:grid; gap:2px }
    .dex-target-body strong { font-size:14px; color:#e1ebef }
    .dex-target-body small { color:#a7b7c6; font-size:12px }
    .dex-method { color:#bfcfda; font-size:11px }
    .dex-target[data-planned=true] .dex-method { color:#93e2bf }
    .dex-compact { grid-template-columns:repeat(auto-fit,minmax(min(145px,100%),1fr)) }
    #dex-results .dex-compact button { min-height:35px; text-align:left }
    #dex-results button:focus-visible { outline-offset:-2px }
    #dex-results, .dex-routes { overflow-wrap:anywhere }
    .dex-heading { display:block; font-size:13px; color:#d8ede7 }
    .dex-section { font-size:11px; font-weight:650; color:#a9c2d8; margin:12px 0 2px }
    .gate-guide:not([hidden]) {display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;margin:7px 0;border-left:3px solid #6dcfb5;background:#192b38;border-radius:7px}
    .gate-guide button {flex:none}
    .gate-more{flex-basis:100%;margin:2px 0}.gate-more summary{cursor:pointer}.gate-more .missing{margin-top:6px}
    .gate-guide>div{min-width:0}.gate-guide .sub{overflow-wrap:anywhere}
    .gate-checks {margin:8px 0;padding:6px 10px;background:#182738;border-radius:8px}
    .gate-checks summary {cursor:pointer;padding:4px 0}
    .gate-checks li {margin:5px 0;overflow-wrap:anywhere}
    .gate-checks ul {padding-left:18px;margin:5px 0}
    .dex-source { padding:7px 0; border-top:1px solid #304157; font-size:12px }
    .dex-source .hint { margin:2px 0 }
    .dex-routes details { padding:0; margin:0; border-top:0; border-bottom:1px solid #304157 }
    .dex-routes summary { padding:7px 4px; color:#d8e8f1; font-weight:600; min-height:32px }
    .dex-routes summary:focus-visible, .tabs button:focus-visible { outline-offset:-3px }
    #yield-metric:not([hidden]) { display:inline-flex; gap:2px; margin:8px 0 3px; padding:2px; border-radius:7px; background:#101a29 }
    #yield-metric button { min-height:32px; padding:4px 12px; border:0; border-radius:5px; color:#a9bed2; background:transparent }
    #yield-metric button[aria-pressed="true"] { color:#9af1d4; background:#24413f; font-weight:650 }
    #yield-metric button:focus-visible { outline-offset:-2px }
    .dex-route-count { float:right; margin-left:6px; color:#a1c8b8; font-size:11px; font-weight:400 }
    .dex-routes .missing { padding:0 4px 8px }
    .dex-routes .chip, #dex-results .chip { min-height:27px }
    #hunt-forecast { padding:5px 9px; color:#a5ecd6; font-size:12px }
    .season-calendar { --season:#a1deaf; border-block:1px solid #344757; margin:6px 0 10px; font-size:12px }
    .season-calendar[data-season=summer] { --season:#f4cf74 }
    .season-calendar[data-season=autumn] { --season:#efa781 }
    .season-calendar[data-season=winter] { --season:#a2d9f2 }
    .season-calendar summary { padding:6px 2px; color:#a7bdc9 }
    .season-calendar strong { color:var(--season); margin-inline:7px }
    .season-remaining { font-variant-numeric:tabular-nums; white-space:nowrap }
    .season-period,.season-next { color:#b9cbd7; padding:2px 8px; overflow-wrap:anywhere }
    .season-next { padding-bottom:7px }
    .season-forms { display:flex; flex-wrap:wrap; gap:4px; padding:0; margin:5px 0; list-style:none }
    .season-forms li { padding:2px 6px; border:1px solid #3c5263; border-radius:5px; color:#b1c1d0; font-size:11px }
    .season-forms [data-seen=true] { border-color:#49776a; color:#9be7c7 }
    .forecast-filters { border:0; padding:0; margin:12px 0 8px }
    .forecast-filters legend { color:#d8e8f1; margin-bottom:6px; font-weight:650 }
    .forecast-skies { display:flex; flex-wrap:wrap; gap:5px }
    .forecast-skies button { padding:4px 9px; border-radius:18px; font-size:12px }
    .forecast-skies button[aria-pressed=true] { color:#c1ffe8; border-color:#72cdb1; background:#20443c }
    .forecast-options { display:flex; flex-wrap:wrap; gap:7px 12px; align-items:center; font-size:12px }
    .forecast-results { margin-top:10px; font-size:12px; color:#bdd0df }
    .forecast-results details { margin:5px 0; border:1px solid #37495e; border-radius:8px; background:#172637; padding:6px 9px }
    .forecast-results summary { min-height:26px; overflow-wrap:anywhere }
    .forecast-results summary strong { color:#e0edf5; font-variant-numeric:tabular-nums }
    .forecast-results summary span { margin-left:8px; color:#a7c8bb }
    .forecast-region { padding:6px 0; border-top:1px solid #324354; overflow-wrap:anywhere }
    .forecast-region div { display:grid; grid-template-columns:4em 1fr; padding-top:3px }
    .forecast-region span { color:#91dfc4 }
    .actions { flex-wrap:wrap }
    .actions button { flex:1 1 26%; min-height:30px; font-size:11px }
    .commandbar { padding:8px 12px; background:#192b39 }
    .commandbar .queue-tools button { padding:5px 8px }
    @media(max-width:450px), (max-height:560px) {
        .panel { max-height:calc(100dvh - 24px) }
        .content { padding:8px 10px }
        .workspace-nav button { min-height:32px }
        .workspace-nav button { font-size:11px }
        .queue-job-actions button { min-height:34px }
        .commandbar { padding:6px 10px }
    }
    @media(max-width:360px) {
        .service-row { grid-template-columns:minmax(0,1fr) auto }
        .service-label { font-weight:600 }
        .service-detail { grid-column:1/-1 }
        .setting input[type=number],.setting select { width:40% }
    }
    :host(.pc-full-panel) {
        top:0!important; left:0!important; right:0!important; bottom:0!important;
        width:100%!important; max-width:none!important; height:100dvh!important;
    }
    :host(.pc-full-panel) .panel {
        width:100%; height:100%; max-width:none; max-height:none; border-radius:0;
        padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
    }
    :host(.pc-full-panel) .content { width:min(100%,860px); margin-inline:auto; flex:auto }
    .mini-bar { display:grid; grid-template-columns:minmax(0,1fr); gap:4px; max-width:min(480px,calc(100vw - 24px)); width:max-content }
    .mini-bar .mini { min-width:0; overflow:hidden; max-width:100% }
    .mini-links { display:flex; flex-wrap:wrap; gap:3px; max-width:100% }
    .mini-links:not(:has(button:not([hidden]))) { display:none }
    .mini-links button { border-radius:12px; font-size:11px; padding:4px 7px; background:#162839; color:#b1e6d6 }
    .mini-links button[hidden],#log-tools[hidden],.decision-list[hidden] { display:none!important }
    .decision-list { display:grid; grid-template-columns:max-content minmax(0,1fr); gap:5px 9px; margin:7px 0; font-size:12px }
    .decision-list dt { color:#a7bdc9 }
    .decision-list dd { margin:0; overflow-wrap:anywhere }
    .log-controls { display:flex; flex-wrap:wrap; gap:6px; align-items:end; margin:8px 0 }
    .log-controls label { display:grid; gap:3px; font-size:11px; flex:1 }
    .log-controls select { width:100%; min-width:0 }
    #log-tools textarea { width:100%; min-height:6em }
    #copy-stop-result { font-size:11px }
    .log-source { margin-right:7px; color:#9fb7c8 }
    .game-item-icon { width:20px; height:20px; vertical-align:middle; object-fit:contain; margin-inline-end:5px; image-rendering:pixelated }
    #under-field-insight label { display:inline-flex; align-items:center; flex-wrap:wrap; gap:4px; margin:4px 8px 4px 0 }
    #under-field-insight ol { max-height:18em; overflow:auto; padding-inline-start:2em }
    #under-field-insight li { padding:2px 0 }
    #under-field-insight .reached { color:#a8ddca }
    #under-field-insight .upcoming { color:#c3cfde }
    .log[data-level=warn] .log-source { color:#efc47c }
    .log[data-level=error] .log-source { color:#ef9999 }
    @media(pointer:coarse) {
        .workspace-nav { display:flex; overflow-x:auto; scrollbar-width:thin }
        .workspace-nav button { flex:1 0 auto; min-width:44px; min-height:44px; padding:4px 7px; font-size:12px }
        header button,.mini-bar button,.commandbar .row button,.queue-job-actions button,.log-controls button,.categories button,.modes button { min-height:44px }
        header button,.mini-links button { min-width:44px }
        .setting,.checks label { min-height:40px; align-items:center }
        .log-controls select, #panel-theme { min-height:40px }
    }
    `;

    // The existing sections share a dark palette. Reverse the luminance of their
    // paint colors while keeping the hue of success, error and selection states.
    // Render a separate stylesheet so game sprites and native inputs are untouched.
    function lightPanelStyles(dark){
        const palette=new Map();
        function paint(value){
            if(palette.has(value))return palette.get(value);
            let hex=value.slice(1);
            if(hex.length<=4)hex=Array.from(hex,digit=>digit+digit).join('');
            const [r,g,b]=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255);
            const high=Math.max(r,g,b),low=Math.min(r,g,b),delta=high-low,l=(high+low)/2;
            const saturation=delta?delta/(1-Math.abs(2*l-1)):0;
            let hue=delta===0?0:high===r?(g-b)/delta:high===g?(b-r)/delta+2:(r-g)/delta+4;
            hue=(hue*60+360)%360;
            const light=Math.max(10,Math.min(99,104-1.12*l*100));
            const alpha=hex.length===8?parseInt(hex.slice(6),16)/255:1;
            const color=alpha<1&&l<0.09?'rgba(25,40,55,'+(alpha*0.38).toFixed(3)+')':
                'hsla('+Math.round(hue)+','+Math.round(Math.min(saturation,0.7)*100)+'%,'+light.toFixed(1)+'%,'+alpha.toFixed(3)+')';
            palette.set(value,color);return color;
        }
        return dark.replace(/#[a-f\d]{8}(?![\w-])|#[a-f\d]{6}(?![\w-])|#[a-f\d]{4}(?![\w-])|#[a-f\d]{3}(?![\w-])/gi,paint)
            .replace('color-scheme:dark','color-scheme:light');
    }
