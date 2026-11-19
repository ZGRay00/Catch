    const PANEL_STYLE = `
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
            .execution-card{padding:10px;border:1px solid #344b5c;border-radius:11px;background:#142431;margin:10px 0}.execution-top{display:flex;justify-content:space-between;gap:8px;font-size:10px;color:#9ab8c7;margin-bottom:5px}#ui-owner{max-width:68%;text-align:right;overflow-wrap:anywhere;color:#9bd9c4}#foreground-task{font-size:12px;color:#e1f2f3}#foreground-detail{font-size:10px;color:#9bb3c4;line-height:1.5;margin:3px 0 7px;overflow-wrap:anywhere}.service-row{display:grid;grid-template-columns:78px auto 1fr;gap:6px;align-items:start;margin:5px 0;font-size:10px}.service-label{color:#bed2de}.service-state{white-space:nowrap;padding:1px 5px;border-radius:4px;background:#283b4a;color:#b7c8d6}.service-detail{min-width:0;color:#91aabd;overflow-wrap:anywhere}.service-row[data-state=ready] .service-state,.service-row[data-state=running] .service-state{color:#b6f0d7;background:#235045}.service-row[data-state=waiting] .service-state,.service-row[data-state=blocked] .service-state{color:#f0d29d;background:#4d4030}#concurrency-note{border-top:1px solid #2d4655;padding-top:6px;margin-top:7px;font-size:10px;color:#8faeba;line-height:1.5}#parallel-rules{margin:6px 0 10px}#parallel-rules table{font-size:10px}#parallel-rules td:first-child{width:48%}#parallel-rules td:last-child{text-align:left;color:#a8d3c1}.background-toggles{margin:7px 0;font-size:11px}.background-toggles label{align-items:flex-start}.queue-note{padding:6px 3px;font-size:10px;line-height:1.5;color:#94aebb}
            @media(max-width:450px){.panel{width:360px;border-radius:14px}.content{padding:10px}header{padding:10px 12px}.metric b{font-size:16px}.list{max-height:155px}.modes button{padding:7px}.field>span,.field>label{flex-basis:74px}}
            @media(prefers-reduced-motion:reduce){*{transition:none!important}}
            .categories{display:flex;gap:4px;padding:3px;background:#0b1423;border-radius:9px;margin-bottom:7px}.categories button{flex:1;border:0;background:transparent;color:#93abc7;font-size:11px;padding:6px 3px}.categories .on{color:#b5f5de;background:#23403e}.modes{grid-template-columns:repeat(2,1fr)}.modes button span{display:inline-block;width:22px;margin:0 4px 0 0;vertical-align:middle}.queue-tools{display:flex;gap:6px;margin:8px 0}.queue-tools button{flex:1;font-size:11px;padding:7px}.queue-tools #queue-count{display:inline-block;min-width:17px;background:#102138;border-radius:10px;margin-left:3px}.job{padding:9px 7px;border-bottom:1px solid #2d4058}.job.active{border-left:2px solid #79dcba;background:#1c303a}.job-head{display:flex;justify-content:space-between;gap:8px;font-size:12px}.job-state{color:#8be5c3;font-size:10px;white-space:nowrap}.job-actions{display:flex;gap:4px;margin-top:6px}.job-actions button{font-size:10px;padding:3px 6px}.job .sub{white-space:normal}#budget-summary{float:right;color:#91d2ba;font-size:10px}.wait-time{color:#e6be7a;font-variant-numeric:tabular-nums}.flow-list{display:grid;gap:6px;padding:6px 0}.flow-list .step{padding:8px;background:#1a293c;border-radius:8px;font-size:11px;color:#b8cce3}.flow-list .step b{color:#87e3c3;margin-right:7px}
            .commandbar{padding:9px 12px;background:#172337;border-top:1px solid #34465c}.commandbar .row{margin:0}.commandbar .queue-tools{margin:6px 0 0}.job-head>span:first-child{min-width:0;overflow-wrap:anywhere}@media(max-width:450px){.commandbar{padding:8px 10px}}

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
    .workspace-nav { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)) minmax(0,1.45fr) minmax(0,1fr); border-bottom:1px solid #324858 }
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
    #pane-dex .field input[type=search] { min-width:0; flex:1 }
    #pane-dex #dex-results { max-height:min(54dvh,520px) }
    #pane-eggs h3 { margin:14px 0 6px; font-size:13px; color:#def1eb }
    .nursery-heading, .nursery-tools { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap }
    .nursery-heading h3 { margin:0!important; font-size:15px!important }
    #nursery-summary { color:#aac2cc; font-variant-numeric:tabular-nums }
    .nursery-tools { margin-top:10px; padding:8px 0; border-block:1px solid #34495d }
    #nursery-berry-plan:not([hidden]) { display:grid; grid-template-columns:auto minmax(0,1fr); gap:6px 10px; background:#10282b; border-left:3px solid #69cbb0; padding:9px; border-radius:6px }
    #nursery-berry-plan dt { color:#a2ddc9; font-size:11px }
    #nursery-berry-plan dd { margin:0; overflow-wrap:anywhere; font-size:12px }
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
    #dex-panel .field { margin-top:10px }
    #dex-clear { flex:none; padding:6px; font-size:11px }
    #dex-results, .dex-routes { overflow-wrap:anywhere }
    .dex-heading { display:block; font-size:13px; color:#d8ede7 }
    .dex-section { font-size:11px; font-weight:650; color:#a9c2d8; margin:12px 0 2px }
    .dex-source { padding:7px 0; border-top:1px solid #304157; font-size:12px }
    .dex-source .hint { margin:2px 0 }
    .dex-routes details { padding:0; margin:0; border-top:0; border-bottom:1px solid #304157 }
    .dex-routes summary { padding:7px 4px; color:#d8e8f1; font-weight:600; min-height:32px }
    .dex-routes summary:focus-visible, .tabs button:focus-visible { outline-offset:-3px }
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
        .commandbar { padding:6px 10px }
    }
    @media(max-width:360px) {
        #dex-panel .field { flex-wrap:wrap; gap:5px }
        #dex-panel .field label { flex:0 0 100% }
        .service-row { grid-template-columns:minmax(0,1fr) auto }
        .service-label { font-weight:600 }
        .service-detail { grid-column:1/-1 }
        .setting input[type=number],.setting select { width:40% }
    }
    `;
