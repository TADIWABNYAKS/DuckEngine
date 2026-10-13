// TADIWA EDIT START: event counters, active brain versions and experiment timeline
const S = require('./LineageSnapshot');
const Hyper = require('../Hyperparameters');
const Config = require('../WorldConfig');
const CAUSES = ['age-limit','lethal-damage','manual-removal','unknown'];
const EVENT_TYPES = ['start','body-mutation','brain-version','brain-change','form-extinction','form-revival','line-extinction','intervention','settings','stop','upgrade'];
function activeBrain(org) { return org.anatomy.cells.some(c=>c.state.name==='mover') && org.anatomy.cells.some(c=>c.state.name==='eye'); }
function brainKey(org) {
    return S.canonical({brain:{decisions:org.brain.decisions,independent_eye_decisions:org.brain.independent_eye_decisions},
        eyes:org.anatomy.cells.filter(c=>c.state.name==='eye').map(c=>[c.loc_col,c.loc_row,c.direction])});
}
function settings() {
    const result={};
    for (const [prefix,source] of [['world',Hyper],['config',Config]]) for (const [key,value] of Object.entries(source)) {
        if (['boolean','number','string'].includes(typeof value)) result[prefix+'.'+key]=value;
    }
    return result;
}
class LineageResearch {
    constructor(tracker) {
        this.tracker=tracker; this.fromTick=null; this.events=[]; this.variants=[]; this.metrics=[];
        this.metricMap=new Map(); this.variantKeys=new Map(); this.byVariant=new Map(); this.members=new WeakMap();
        this.eventTick=null; this.eventKeys=new Map(); this.controls={}; this.formVariants=new Map(); this.eventRevision=0;
    }
    begin(upgrade=false) {
        this.fromTick=this.tracker.tick(); this.controls=settings(); this.metric(0);
        this.event(upgrade?'upgrade':'start',null,upgrade?'Rates and active-brain recording begin here; earlier data unavailable.':'Species recording started');
    }
    metric(id) {
        if (!this.metricMap.has(id)) {
            const m={id,births:0,deaths:0,causes:Object.fromEntries(CAUSES.map(c=>[c,0])),buckets:[]};
            this.metrics.push(m);this.metricMap.set(id,m);m.index=new Map();
        }
        return this.metricMap.get(id);
    }
    event(type,nodeId,detail,extra={}) {
        if (this.fromTick===null) return;
        const tick=this.tracker.tick();
        if (this.eventTick!==tick) {this.eventTick=tick;this.eventKeys.clear();}
        const key=S.canonical([type,nodeId,detail,extra]);
        const previous=this.eventKeys.get(key);
        if (previous) previous.count++;
        else {
            const e={id:this.events.length+1,tick,type,nodeId,detail,count:1,...extra};
            this.events.push(e);this.eventKeys.set(key,e);
        }
        this.eventRevision++; this.tracker.revision++;
    }
    observeSettings() {
        if (!this.tracker.active||this.fromTick===null) return;
        const next=settings(),changes=[];
        for (const key of Object.keys(next)) if (String(this.controls[key])!==String(next[key])) changes.push(`${key}: ${this.controls[key]} → ${next[key]}`);
        if (changes.length) {this.event('settings',null,changes.join('; '));this.controls=next;}
    }
    count(nodeId,kind,cause) {
        const bucket=Math.max(0,Math.ceil((this.tracker.tick()-this.fromTick)/100)-1);
        for (const id of [0,nodeId]) {
            const m=this.metric(id);m[kind]++;
            if (cause) m.causes[cause]++;
            let b=m.index.get(bucket);
            if (!b) {b={index:bucket,births:0,deaths:0};m.index.set(bucket,b);m.buckets.push(b);}
            b[kind]++;
        }
    }
    rates(id=0) {
        const now=this.tracker.active?this.tracker.tick():this.tracker.endedAtTick;
        if (this.fromTick===null||now===null) return null;
        const elapsed=Math.max(0,now-this.fromTick),duration=Math.min(100,elapsed);
        const index=elapsed>=100?Math.floor(elapsed/100)-1:0;
        const b=this.metricMap.get(id)?.index.get(index)||{births:0,deaths:0};
        return {from:this.fromTick+index*100,to:this.fromTick+index*100+duration,duration,
            births:b.births,deaths:b.deaths,birthRate:duration?b.births*100/duration:null,deathRate:duration?b.deaths*100/duration:null};
    }
    join(org,node,parent=null,knownInherited=false,founder=false) {
        this.metric(node.id);
        if (!founder) this.count(node.id,'births');
        if (!activeBrain(org)) return;
        const parentVersion=parent&&this.members.get(parent);
        let v=knownInherited && parentVersion && parentVersion.nodeId===node.id ? parentVersion : null;
        if (!v) {
            const key=brainKey(org),lookup=node.id+':'+key;
            v=this.variantKeys.get(lookup);
            if (!v) {
                v={id:this.variants.length+1,nodeId:node.id,key,firstSeenTick:this.tracker.tick(),
                    parentVariantId:parentVersion?parentVersion.id:null,population:0,founders:0,births:0,deaths:0,snapshot:S.capture(org)};
                this.variants.push(v);this.byVariant.set(v.id,v);this.variantKeys.set(lookup,v);
                if(!this.formVariants.has(node.id))this.formVariants.set(node.id,[]);this.formVariants.get(node.id).push(v);
                this.event('brain-version',node.id,`Active brain version B${v.id} first observed`,{variantId:v.id});
            }
            if (parentVersion && parentVersion.key!==key) this.event('brain-change',node.id,
                `B${parentVersion.id} → B${v.id}`,{variantId:v.id,fromVariantId:parentVersion.id});
        }
        this.members.set(org,v);v.population++;if(founder)v.founders++;else v.births++;
    }
    death(org,node,reason) {
        const cause=CAUSES.includes(reason)?reason:(reason==='manual intervention'||reason==='removed from world'?'manual-removal':'unknown');
        this.count(node.id,'deaths',cause);
        const v=this.members.get(org);if(v){v.population--;v.deaths++;this.members.delete(org);}
        if(cause==='manual-removal')this.event('intervention',node.id,'Manual removal of tracked organisms');
    }
    exportVariant(id) {
        const v=this.byVariant.get(id);if(!v)throw new Error('Unknown brain version');
        return S.exportOrganism(v.snapshot,this.tracker.byId.get(v.nodeId).species);
    }
    serialize() {
        return S.copy({fromTick:this.fromTick,events:this.events,variants:this.variants,controls:this.controls,
            metrics:this.metrics.map(({index,...m})=>m)});
    }
    load(raw,tags) {
        const t=this.tracker;
        if (!raw) {
            if (!t.nodes.length) return;
            this.begin(true);
            for(const n of t.nodes)this.metric(n.id);
            if(t.active)for(const org of t.env.organisms){const n=t.nodeFor(org);if(n)this.join(org,n,null,false,true);}
            return;
        }
        const d=S.copy(raw),fail=()=>{throw new Error('Invalid research archive');},uint=n=>Number.isSafeInteger(n)&&n>=0;
        if(d.fromTick!==null&&!uint(d.fromTick)||!Array.isArray(d.events)||!Array.isArray(d.variants)||!Array.isArray(d.metrics)||!d.controls||typeof d.controls!=='object')fail();
        if(d.fromTick===null&&(d.events.length||d.variants.length||d.metrics.length))fail();
        this.fromTick=d.fromTick;this.controls=d.controls;
        for(const m of d.metrics){
            if(!uint(m.id)||m.id!==0&&!t.byId.has(m.id)||this.metricMap.has(m.id)||!uint(m.births)||!uint(m.deaths)||!m.causes||!Array.isArray(m.buckets))fail();
            if(CAUSES.some(c=>!uint(m.causes[c]))||CAUSES.reduce((sum,c)=>sum+m.causes[c],0)!==m.deaths)fail();
            m.index=new Map();let previous=-1,births=0,deaths=0;
            for(const b of m.buckets){if(!uint(b.index)||b.index<=previous||!uint(b.births)||!uint(b.deaths))fail();previous=b.index;m.index.set(b.index,b);births+=b.births;deaths+=b.deaths;}
            if(births!==m.births||deaths!==m.deaths)fail();
            this.metrics.push(m);this.metricMap.set(m.id,m);
        }
        if(d.fromTick!==null){
            const global=this.metricMap.get(0);if(!global||t.nodes.some(n=>!this.metricMap.has(n.id)))fail();
            for(const key of ['births','deaths'])if(global[key]!==this.metrics.filter(m=>m.id!==0).reduce((sum,m)=>sum+m[key],0))fail();
            if(global.births>t.totalBirths||global.deaths>t.initialPopulation+t.totalBirths-t.living)fail();
        }
        for(const v of d.variants){
            const n=t.byId.get(v.nodeId);S.validate(v.snapshot);
            if(v.id!==this.variants.length+1||!n||!uint(v.firstSeenTick)||v.firstSeenTick<d.fromTick||!activeBrain(v.snapshot)||S.bodyKey(v.snapshot)!==n.shapeKey||brainKey(v.snapshot)!==v.key)fail();
            if(v.parentVariantId!==null&&!this.byVariant.has(v.parentVariantId))fail();
            for(const key of ['population','founders','births','deaths'])if(!uint(v[key]))fail();
            if(v.founders+v.births-v.deaths!==v.population||this.variantKeys.has(v.nodeId+':'+v.key))fail();
            this.variants.push(v);this.byVariant.set(v.id,v);this.variantKeys.set(v.nodeId+':'+v.key,v);
            if(!this.formVariants.has(v.nodeId))this.formVariants.set(v.nodeId,[]);this.formVariants.get(v.nodeId).push(v);
        }
        let last=-1;
        for(const e of d.events){
            if(e.id!==this.events.length+1||!uint(e.tick)||e.tick<last||e.tick<d.fromTick||!EVENT_TYPES.includes(e.type)||typeof e.detail!=='string'||!uint(e.count)||!e.count||e.nodeId!==null&&!t.byId.has(e.nodeId))fail();
            for(const key of ['variantId','fromVariantId'])if(e[key]!=null&&!this.byVariant.has(e[key]))fail();
            last=e.tick;this.events.push(e);
        }
        const counts=new Map();
        if(t.active)for(const org of t.env.organisms){
            const n=t.nodeFor(org),tag=tags.get(org);if(!n)continue;
            if(activeBrain(org)){
                const v=this.byVariant.get(tag&&tag.brain);
                if(!v||v.nodeId!==n.id||v.key!==brainKey(org))fail();
                this.members.set(org,v);counts.set(v.id,(counts.get(v.id)||0)+1);
            }else if(tag&&tag.brain!=null)fail();
        }
        if(t.active)for(const v of this.variants)if((counts.get(v.id)||0)!==v.population)fail();
    }
}
LineageResearch.activeBrain=activeBrain;
module.exports=LineageResearch;
// TADIWA EDIT END: event counters, active brain versions and experiment timeline
