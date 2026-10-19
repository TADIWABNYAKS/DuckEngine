// TADIWA EDIT START: event counters, active brain versions and experiment timeline
const S = require('./LineageSnapshot');
const Environment = require('./LineageEnvironment');
const Hyper = require('../Hyperparameters');
const Config = require('../WorldConfig');
const Seasons = require('../Environments/Seasons');
const CAUSES = ['age-limit','lethal-damage'];
const EVENT_TYPES = ['start','body-mutation','brain-version','brain-change','form-extinction','form-revival','line-extinction','intervention','settings','season','line-dormant','line-revival','stop','upgrade'];
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
function rejectArchive() { throw new Error('Invalid research archive'); }
function isCount(value) { return Number.isSafeInteger(value) && value >= 0; }

class LineageResearch {
    constructor(tracker) {
        this.environment=new Environment(tracker);
        this.tracker=tracker; this.fromTick=null; this.events=[]; this.variants=[]; this.metrics=[];
        this.metricMap=new Map(); this.variantKeys=new Map(); this.byVariant=new Map(); this.members=new WeakMap();
        this.season=null; this.eventTick=null; this.eventKeys=new Map(); this.controls={}; this.formVariants=new Map(); this.eventRevision=0;
    }
    begin(upgrade=false) {
        this.fromTick=this.tracker.tick(); this.controls=settings(); this.season=Seasons.name(this.tracker.env.total_ticks); this.metric(0);
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
    observeSeason(tick) {
        if(!this.tracker.active||this.fromTick===null)return;
        const next=Seasons.name(tick);
        if(this.season!==next){this.event('season',null,`Season: ${this.season||'not recorded'} → ${next}`);this.season=next;}
    }
    count(nodeId, kind, cause) {
        const bucket = Math.max(0, Math.ceil((this.tracker.tick() - this.fromTick) / 100) - 1);
        // Record each event for both the whole line (ID 0) and its body form.
        for (const id of [0, nodeId]) {
            const metric = this.metric(id);
            metric[kind]++;
            if (cause) metric.causes[cause]++;
            let counts = metric.index.get(bucket);
            if (!counts) {
                counts = {index: bucket, births: 0, deaths: 0};
                metric.index.set(bucket, counts);
                metric.buckets.push(counts);
            }
            counts[kind]++;
        }
    }
    rates(id = 0) {
        const now = this.tracker.active ? this.tracker.tick() : this.tracker.endedAtTick;
        if (this.fromTick === null || now === null) return null;
        const elapsed = Math.max(0, now - this.fromTick);
        const duration = Math.min(100, elapsed);
        // Use the last completed window, or the partial first window while starting up.
        const index = elapsed >= 100 ? Math.floor(elapsed / 100) - 1 : 0;
        const counts = this.metricMap.get(id)?.index.get(index) || {births: 0, deaths: 0};
        return {
            from: this.fromTick + index * 100,
            to: this.fromTick + index * 100 + duration,
            duration,
            births: counts.births,
            deaths: counts.deaths,
            birthRate: duration ? counts.births * 100 / duration : null,
            deathRate: duration ? counts.deaths * 100 / duration : null
        };
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
        const cause=CAUSES.includes(reason)?reason:null;
        this.count(node.id,'deaths',cause);
        const v=this.members.get(org);if(v){v.population--;v.deaths++;this.members.delete(org);}
    }
    exportVariant(id) {
        const v=this.byVariant.get(id);if(!v)throw new Error('Unknown brain version');
        return S.exportOrganism(v.snapshot,this.tracker.byId.get(v.nodeId).species);
    }
    serialize() {
        return S.copy({fromTick:this.fromTick,events:this.events,variants:this.variants,controls:this.controls,season:this.season,environment:this.environment.serialize(),
            metrics:this.metrics.map(({index,...m})=>m)});
    }
    load(raw, tags) {
        const tracker = this.tracker;
        if (!raw) {
            if (!tracker.nodes.length) {
                return;
            }
            this.begin(true);
            for (const node of tracker.nodes) {
                this.metric(node.id);
            }
            if (tracker.active) {
                for (const org of tracker.env.organisms) {
                    const node = tracker.nodeFor(org);
                    if (node) {
                        this.join(org, node, null, false, true);
                    }
                }
            }
            this.environment.load(null);
            return;
        }
        const data = S.copy(raw);
        if (
            (data.fromTick !== null && !isCount(data.fromTick)) ||
            !Array.isArray(data.events) ||
            !Array.isArray(data.variants) ||
            !Array.isArray(data.metrics) ||
            !data.controls ||
            typeof data.controls !== 'object'
        ) {
            rejectArchive();
        }
        if (data.fromTick === null && (data.events.length || data.variants.length || data.metrics.length)) {
            rejectArchive();
        }
        if (data.season != null && !['Off', 'Summer', 'Winter'].includes(data.season)) {
            rejectArchive();
        }
        this.fromTick = data.fromTick;
        this.controls = data.controls;
        this.season = data.season == null ? Seasons.name(tracker.env.total_ticks) : data.season;
        this.loadMetrics(data);
        this.loadVariants(data);
        this.loadEvents(data);
        this.restoreMembers(tags);
        this.environment.load(data.environment);
    }
    loadMetrics(data) {
        const tracker = this.tracker;
        for (const metric of data.metrics) {
            if (
                !isCount(metric.id) ||
                (metric.id !== 0 && !tracker.byId.has(metric.id)) ||
                this.metricMap.has(metric.id) ||
                !isCount(metric.births) ||
                !isCount(metric.deaths) ||
                !metric.causes ||
                !Array.isArray(metric.buckets)
            ) {
                rejectArchive();
            }
            if (
                CAUSES.some(c => !isCount(metric.causes[c])) ||
                Object.values(metric.causes).some(c => !isCount(c)) ||
                Object.values(metric.causes).reduce((sum, c) => sum + c, 0) > metric.deaths
            ) {
                rejectArchive();
            }
            metric.causes = Object.fromEntries(CAUSES.map(c => [c, metric.causes[c]]));
            metric.index = new Map();
            let previous = -1, births = 0, deaths = 0;
            for (const bucket of metric.buckets) {
                if (!isCount(bucket.index) || bucket.index <= previous || !isCount(bucket.births) || !isCount(bucket.deaths)) {
                    rejectArchive();
                }
                previous = bucket.index;
                metric.index.set(bucket.index, bucket);
                births += bucket.births;
                deaths += bucket.deaths;
            }
            if (births !== metric.births || deaths !== metric.deaths) {
                rejectArchive();
            }
            this.metrics.push(metric);
            this.metricMap.set(metric.id, metric);
        }
        if (data.fromTick !== null) {
            const totals = this.metricMap.get(0);
            if (!totals || tracker.nodes.some(node => !this.metricMap.has(node.id))) {
                rejectArchive();
            }
            for (const key of ['births', 'deaths']) {
                if (totals[key] !== this.metrics.filter(metric => metric.id !== 0).reduce((sum, metric) => sum + metric[key], 0)) {
                    rejectArchive();
                }
            }
            if (
                totals.births > tracker.totalBirths ||
                totals.deaths > tracker.initialPopulation + tracker.totalBirths - tracker.living
            ) {
                rejectArchive();
            }
        }
    }
    loadVariants(data) {
        const tracker = this.tracker;
        for (const variant of data.variants) {
            const node = tracker.byId.get(variant.nodeId);
            S.validate(variant.snapshot);
            if (
                variant.id !== this.variants.length + 1 ||
                !node ||
                !isCount(variant.firstSeenTick) ||
                variant.firstSeenTick < data.fromTick ||
                !activeBrain(variant.snapshot) ||
                S.bodyKey(variant.snapshot) !== node.shapeKey ||
                brainKey(variant.snapshot) !== variant.key
            ) {
                rejectArchive();
            }
            if (variant.parentVariantId !== null && !this.byVariant.has(variant.parentVariantId)) {
                rejectArchive();
            }
            for (const key of ['population', 'founders', 'births', 'deaths']) {
                if (!isCount(variant[key])) {
                    rejectArchive();
                }
            }
            if (
                variant.founders + variant.births - variant.deaths !== variant.population ||
                this.variantKeys.has(variant.nodeId + ':' + variant.key)
            ) {
                rejectArchive();
            }
            this.variants.push(variant);
            this.byVariant.set(variant.id, variant);
            this.variantKeys.set(variant.nodeId + ':' + variant.key, variant);
            if (!this.formVariants.has(variant.nodeId)) {
                this.formVariants.set(variant.nodeId, []);
            }
            this.formVariants.get(variant.nodeId).push(variant);
        }
    }
    loadEvents(data) {
        const tracker = this.tracker;
        let last = -1;
        for (const event of data.events) {
            if (
                event.id !== this.events.length + 1 ||
                !isCount(event.tick) ||
                event.tick < last ||
                event.tick < data.fromTick ||
                !EVENT_TYPES.includes(event.type) ||
                typeof event.detail !== 'string' ||
                !isCount(event.count) ||
                !event.count ||
                (event.nodeId !== null && !tracker.byId.has(event.nodeId))
            ) {
                rejectArchive();
            }
            for (const key of ['variantId', 'fromVariantId']) {
                if (event[key] != null && !this.byVariant.has(event[key])) {
                    rejectArchive();
                }
            }
            last = event.tick;
            this.events.push(event);
        }
    }
    restoreMembers(tags) {
        const tracker = this.tracker;
        const counts = new Map();
        if (tracker.active) {
            for (const org of tracker.env.organisms) {
                const node = tracker.nodeFor(org), tag = tags.get(org);
                if (!node) {
                    continue;
                }
                if (activeBrain(org)) {
                    const variant = this.byVariant.get(tag && tag.brain);
                    if (!variant || variant.nodeId !== node.id || variant.key !== brainKey(org)) {
                        rejectArchive();
                    }
                    this.members.set(org, variant);
                    counts.set(variant.id, (counts.get(variant.id) || 0) + 1);
                } else if (tag && tag.brain != null) {
                    rejectArchive();
                }
            }
        }
        if (tracker.active) {
            for (const variant of this.variants) {
                if ((counts.get(variant.id) || 0) !== variant.population) {
                    rejectArchive();
                }
            }
        }
    }

}
LineageResearch.activeBrain=activeBrain;
module.exports=LineageResearch;
// TADIWA EDIT END: event counters, active brain versions and experiment timeline
