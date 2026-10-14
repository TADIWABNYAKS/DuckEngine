// TADIWA EDIT START: observational species populations and visible mutation branches
const Snapshot = require('./LineageSnapshot');
const migrate = require('./LineageMigration');
const Research = require('./LineageResearch');
const Pollen = require('./LineagePollen');
const fields = ['session','scope','nodes','genomes','history','interventions','nextId','rootId','active','complete','initialPopulation','totalBirths','living','peak','peakTick','extinctionTick','endedAtTick','endReason','error','migrationMessage'];
class LineageTracker {
    constructor(env) { this.env = env; this.session = 0; this.clear(); }
    clear() {
        this.session++;
        this.scope = 'species'; this.nodes = []; this.genomes = []; this.history = []; this.interventions = [];
        this.byId = new Map(); this.children = new Map(); this.branches = new Map();
        this.members = new WeakMap(); this.liveForms = new Set();
        this.nextId = 1; this.rootId = null; this.active = false; this.complete = true;
        this.initialPopulation = this.totalBirths = this.living = this.peak = 0;
        this.peakTick = this.extinctionTick = this.endedAtTick = this.endReason = this.error = this.migrationMessage = null;
        this.revision = 0;
        this.research = new Research(this); this.pollen = new Pollen(this);
    }
    tick() { return this.env.lineage_event_tick == null ? this.env.total_ticks : this.env.lineage_event_tick; }
    start(org) {
        if (!org || !org.living || !this.env.organisms.includes(org)) throw new Error('Select a living creature in this world first.');
        this.clear(); this.active = true; this.research.begin();
        const root = this.record(org, null); this.rootId = root.id;
        for (const member of this.env.organisms) if (member.living && member.species === org.species) {
            this.join(member, root, true);
        }
        this.pollen.rebuild(true);
        this.sample(this.tick(), true); this.research.environment.sample(this.tick());
    }
    record(org, parent) {
        const form = Snapshot.capture(org), shapeKey = Snapshot.bodyKey(form);
        const node = {id:this.nextId++, parentId:parent ? parent.id : null,
            mutationDepth:parent ? parent.mutationDepth + 1 : 0, firstSeenTick:this.tick(),
            genomeId:this.genomes.length, species:org.species ? org.species.name : '', shapeKey,
            population:0, founders:0, totalBirths:0, totalDeaths:0, peak:0, peakTick:this.tick(),
            extinctionTick:null, extinctionReason:null, extinctionCount:0, history:[]};
        this.genomes.push(form); this.nodes.push(node); this.byId.set(node.id,node); this.children.set(node.id,[]);
        if (parent) { this.children.get(parent.id).push(node.id); this.branches.set(parent.id + ':' + shapeKey,node); }
        this.research.metric(node.id);
        if (parent) this.research.event('body-mutation',node.id,`Body form #${node.id} from #${parent.id}`);
        return node;
    }
    join(org, node, founder = false, parent = null, knownInherited = false) {
        if (!this.living && (this.extinctionTick!==null || this.pollen.dormant)) this.research.event('line-revival',null,'Tracked line resumed through biological reproduction');
        this.pollen.dormant=false; this.members.set(org,node); this.liveForms.add(node.id);
        if (!node.population && node.extinctionTick!==null) this.research.event('form-revival',node.id,'Body form reappeared');
        node.population++; this.living++;
        if (founder) { node.founders++; this.initialPopulation++; }
        else { node.totalBirths++; this.totalBirths++; }
        node.extinctionTick = node.extinctionReason = null; this.extinctionTick = null;
        if (node.population > node.peak) { node.peak = node.population; node.peakTick = this.tick(); }
        if (this.living > this.peak) { this.peak = this.living; this.peakTick = this.tick(); }
        if (node.population === 1) this.point(node.history,this.tick(),1);
        this.research.join(org,node,parent,knownInherited,founder);
        this.revision++;
    }
    nodeFor(org) { return this.members.get(org); }
    birth(parent, child, knownInherited = false, pollenOrigin = null) {
        if (!this.active || this.members.has(child)) return;
        const node = this.nodeFor(parent) || this.pollen.nodeFor(pollenOrigin,parent); if (!node) return;
        try {
            let form = node;
            // Engine species identity is retained for unchanged bodies, including brain/rate drift.
            // Only anatomical mutations require a body key; never serialize ordinary births.
            if (child.species !== parent.species) {
                const key = Snapshot.bodyKey(child);
                if (key !== node.shapeKey) form = this.branches.get(node.id + ':' + key) || this.record(child,node);
            }
            this.join(child,form,false,parent,knownInherited);
        } catch (e) { this.complete = false; this.error = 'Recording incomplete: ' + e.message; this.stop('recording error'); }
    }
    death(org, reason = null) {
        if (!this.active) return;
        const node = this.nodeFor(org); if (!node) return;
        const deathReason=['age-limit','lethal-damage'].includes(reason)?reason:null;
        this.research.death(org,node,deathReason);
        this.members.delete(org); node.population--; node.totalDeaths++; this.living--; this.revision++;
        if (!node.population) {
            node.extinctionTick = this.tick(); node.extinctionCount++;
            node.extinctionReason = deathReason;
            this.research.event('form-extinction',node.id,'Body form population reached zero'+(deathReason?' ('+deathReason+')':''));
            this.liveForms.delete(node.id); this.point(node.history,this.tick(),0);
        }
        if (!this.living) this.updateFate();
    }
    updateFate() {
        if(!this.active||!this.nodes.length)return;
        if(this.living){this.extinctionTick=null;this.pollen.dormant=false;return;}
        if(this.pollen.pending){
            this.extinctionTick=null;
            if(!this.pollen.dormant)this.research.event('line-dormant',null,'No living members; tracked pollen remains');
            this.pollen.dormant=true;
        }else{
            if(this.extinctionTick===null){this.extinctionTick=this.tick();this.research.event('line-extinction',null,'No living members or tracked pollen remain');this.sample(this.tick(),true);}
            this.pollen.dormant=false;
        }
    }
    point(history,tick,living) {
        const last = history[history.length-1];
        if (last && last.tick === tick) last.living = living;
        else history.push({tick,living});
    }
    sample(tick, force = false) {
        if (!this.active || (!force && tick % 100 !== 0)) return;
        this.research.observeSettings();
        if (!force) this.research.environment.sample(tick);
        this.point(this.history,tick,this.living);
        for (const id of this.liveForms) { const n=this.byId.get(id); this.point(n.history,tick,n.population); }
        this.revision++;
    }
    stop(reason = 'stopped by user') {
        if (!this.active) return;
        this.sample(this.tick(),true); this.research.environment.sample(this.tick()); this.research.event('stop',null,reason); this.active=false; this.endedAtTick=this.tick(); this.endReason=reason; this.revision++;
    }
    intervene(reason) { if (this.active) {this.interventions.push({tick:this.tick(),reason});this.research.event('intervention',null,reason);} }
    exportNode(id) {
        const node=this.byId.get(id); if (!node) throw new Error('Unknown form ID');
        return Snapshot.exportOrganism(this.genomes[node.genomeId],node.species);
    }
    serialize() {
        const archive={version:4,pollen:this.pollen.serialize()}; for (const key of fields) archive[key]=this[key]; archive.research=this.research.serialize(); return Snapshot.copy(archive);
    }
    load(raw, tags = new Map()) {
        this.clear(); if (!raw) return;
        try {
            const data = raw.version === 1 ? migrate(raw,this.tick()) : Snapshot.copy(raw);
            const fail=()=>{throw new Error('Invalid species lineage archive');};
            const uint=v=>Number.isSafeInteger(v)&&v>=0;
            const history=h=>{
                if (!Array.isArray(h)) fail(); let last=-1;
                for (const p of h) { if (!uint(p.tick)||p.tick<=last||!uint(p.living)) fail(); last=p.tick; }
            };
            if (![2,3,4].includes(data.version) || !['species','legacy-subset'].includes(data.scope) || !Array.isArray(data.nodes) || !Array.isArray(data.genomes) || !Array.isArray(data.interventions)) fail();
            for (const k of ['session','nextId','initialPopulation','totalBirths','living','peak']) if (!uint(data[k])) fail();
            if (!data.session || !data.nextId || data.peak<data.living || data.peak>data.initialPopulation+data.totalBirths || typeof data.active!=='boolean' || typeof data.complete!=='boolean') fail();
            for (const k of ['peakTick','extinctionTick','endedAtTick']) if (data[k]!==null&&!uint(data[k])) fail();
            if (data.active && data.endedAtTick!==null) fail();
            for (const i of data.interventions) if (!uint(i.tick)||typeof i.reason!=='string') fail();
            data.genomes.forEach(Snapshot.validate); history(data.history);
            const ids=new Map(), branches=new Map(); let living=0, births=0, founders=0;
            for (const n of data.nodes) {
                for (const k of ['id','mutationDepth','firstSeenTick','genomeId','population','founders','totalBirths','totalDeaths','peak','peakTick','extinctionCount']) if (!uint(n[k])) fail();
                if (!n.id||ids.has(n.id)||!data.genomes[n.genomeId]||n.shapeKey!==Snapshot.bodyKey(data.genomes[n.genomeId])||n.peak<n.population||n.peak>n.founders+n.totalBirths||n.founders+n.totalBirths-n.totalDeaths!==n.population) fail();
                if (n.extinctionTick!==null && (!uint(n.extinctionTick)||n.extinctionTick<n.firstSeenTick||n.population!==0)) fail();
                if (n.parentId===null) { if (n.id!==data.rootId||n.mutationDepth!==0||ids.size) fail(); }
                else {
                    const p=ids.get(n.parentId), key=n.parentId+':'+n.shapeKey;
                    if (!p||n.mutationDepth!==p.mutationDepth+1||n.firstSeenTick<p.firstSeenTick||p.shapeKey===n.shapeKey||branches.has(key)||n.founders) fail();
                    branches.set(key,n);
                }
                if ((n.population===0)!==(n.extinctionTick!==null)) fail();
                history(n.history); ids.set(n.id,n); living+=n.population; births+=n.totalBirths; founders+=n.founders;
            }
            if (living!==data.living||births!==data.totalBirths||founders!==data.initialPopulation||data.nextId<=data.nodes.reduce((max,n)=>Math.max(max,n.id),0)) fail();
            if (data.nodes.length ? !ids.has(data.rootId) : (data.rootId!==null||data.active||data.genomes.length||data.history.length)) fail();
            const pollen=data.pollen||{food:0,carriers:0};
            if(!uint(pollen.food)||!uint(pollen.carriers)||data.version===4&&!data.pollen)fail();
            const pending=pollen.food+pollen.carriers;
            if (data.extinctionTick!==null && (living!==0||pending||!data.nodes.length)) fail();
            if (data.nodes.length && (!living && !pending && data.extinctionTick===null || data.peakTick===null || !data.active && data.endedAtTick===null)) fail();
            const members=new WeakMap(), counts=new Map();
            if (data.active) for (const org of this.env.organisms) {
                const tag=tags.get(org); if (!tag||tag.id==null) continue;
                const n=ids.get(tag.id);
                if (tag.session!==data.session||!n||!org.living||Snapshot.bodyKey(org)!==n.shapeKey) fail();
                members.set(org,n); counts.set(n.id,(counts.get(n.id)||0)+1);
            }
            if (data.active) for (const n of data.nodes) if ((counts.get(n.id)||0)!==n.population) fail();
            for (const key of fields) this[key]=data[key];
            this.byId=ids; this.branches=branches; this.members=members;
            this.children=new Map(this.nodes.map(n=>[n.id,[]]));
            this.liveForms=new Set(this.nodes.filter(n=>n.population>0).map(n=>n.id));
            for (const n of this.nodes) if (n.parentId!==null) this.children.get(n.parentId).push(n.id);
            if (data.version>=3 && !data.research) fail();
            this.pollen.load(data.pollen);
            if(data.version<4 && this.pollen.pending && !this.living)this.extinctionTick=null;
            this.research.load(data.research,tags);
            this.revision++;
        } catch(e) {
            this.clear(); this.complete=false; this.error='Lineage archive rejected; world loaded without tracking. '+e.message;
        }
    }
}
module.exports=LineageTracker;
// TADIWA EDIT END: observational species populations and visible mutation branches
