// TADIWA EDIT START: preserve older individual archives as stopped form populations
const S=require('./LineageSnapshot');
module.exports=function migrate(raw,worldTick) {
    const d=S.copy(raw), fail=()=>{throw new Error('Invalid legacy archive');};
    if (!Array.isArray(d.nodes)||!Array.isArray(d.genomes)||!Array.isArray(d.history)||!Array.isArray(d.interventions)) fail();
    d.genomes.forEach(S.validate);
    const old=new Map(), branches=new Map(), nodes=[], genomes=[], deltas=new Map();
    const uint=n=>Number.isSafeInteger(n)&&n>=0;
    const event=(n,tick,delta)=>{const events=deltas.get(n.id);events.set(tick,(events.get(tick)||0)+delta);};
    for (const n of d.nodes) {
        if (!uint(n.id)||!n.id||old.has(n.id)||!uint(n.genomeId)||!d.genomes[n.genomeId]||!uint(n.recordedAtTick)||(n.deathTick!==null&&(!uint(n.deathTick)||n.deathTick<n.recordedAtTick))) fail();
        const p=old.get(n.parentId), key=S.bodyKey(d.genomes[n.genomeId]);
        if (n.parentId===null ? (nodes.length||n.id!==d.rootId||n.generation!==0) : (!p||n.generation!==p.original.generation+1||n.recordedAtTick<p.original.recordedAtTick||(p.original.deathTick!==null&&n.recordedAtTick>p.original.deathTick))) fail();
        let form=p&&p.form.shapeKey===key?p.form:branches.get((p?p.form.id:0)+':'+key);
        if (!form) {
            form={id:nodes.length+1,parentId:p?p.form.id:null,mutationDepth:p?p.form.mutationDepth+1:0,
                firstSeenTick:n.recordedAtTick,genomeId:genomes.length,species:n.species,shapeKey:key,
                population:0,founders:0,totalBirths:0,totalDeaths:0,peak:0,peakTick:n.recordedAtTick,
                extinctionTick:null,extinctionReason:null,extinctionCount:0,history:[]};
            nodes.push(form);genomes.push(d.genomes[n.genomeId]);deltas.set(form.id,new Map());
            branches.set((p?p.form.id:0)+':'+key,form);
        }
        if (p) form.totalBirths++; else form.founders++;
        event(form,n.recordedAtTick,1);
        if (n.deathTick!==null) {form.totalDeaths++;event(form,n.deathTick,-1);}
        else form.population++;
        old.set(n.id,{original:n,form});
    }
    for (const n of nodes) {
        let living=0;
        for (const [tick,delta] of [...deltas.get(n.id)].sort((a,b)=>a[0]-b[0])) {
            living+=delta;n.history.push({tick,living});
            if (living>n.peak) {n.peak=living;n.peakTick=tick;}
            if (!living) {n.extinctionTick=tick;n.extinctionCount++;}
            else n.extinctionTick=null;
        }
        if (!n.population) n.extinctionReason='legacy archive; see original intervention log';
    }
    if (d.living!==nodes.reduce((sum,n)=>sum+n.population,0)) fail();
    const lastEvent=d.nodes.reduce((max,n)=>Math.max(max,n.recordedAtTick,n.deathTick||0),0);
    const end=d.endedAtTick==null?Math.max(worldTick||0,lastEvent,d.history.length?d.history[d.history.length-1].tick:0):d.endedAtTick;
    if (nodes.length) {
        const last=d.history[d.history.length-1];
        if (last && last.tick===end) last.living=d.living;
        else d.history.push({tick:end,living:d.living});
    }
    return {...d,version:2,scope:'legacy-subset',nodes,genomes,nextId:nodes.length+1,rootId:nodes.length?1:null,
        active:false,initialPopulation:nodes.length?1:0,totalBirths:Math.max(0,d.nodes.length-1),
        endedAtTick:end,
        endReason:'Legacy individual archive grouped into body forms; start a new species recording',
        migrationMessage:'Older single-family archive preserved as a stopped subset. Form peaks reconstructed at tick resolution; start species tracking to include all current members.'};
};
// TADIWA EDIT END: preserve older individual archives as stopped form populations
