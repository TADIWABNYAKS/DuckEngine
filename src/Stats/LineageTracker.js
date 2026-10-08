// TADIWA EDIT START: observational individual ancestry archive
const Snapshot = require('./LineageSnapshot');
class LineageTracker {
    constructor(env) {
        this.env = env;
        this.session = 0;
        this.clear();
    }
    clear() {
        for (const org of this.env.organisms || []) org.lineage_id = org.lineage_session = null;
        this.session++;
        this.nodes = [];
        this.genomes = [];
        this.byId = new Map();
        this.children = new Map();
        this.genomeKeys = new Map();
        this.history = [];
        this.interventions = [];
        this.nextId = 1;
        this.rootId = null;
        this.active = false;
        this.complete = true;
        this.living = 0;
        this.peak = 0;
        this.peakTick = null;
        this.extinctionTick = null;
        this.endedAtTick = null;
        this.endReason = null;
        this.error = null;
        this.revision = 0;
    }
    tick() { return this.env.lineage_event_tick == null ? this.env.total_ticks : this.env.lineage_event_tick; }
    start(org) {
        if (!org || !org.living || !this.env.organisms.includes(org)) throw new Error('Select a living creature in this world first.');
        this.clear();
        this.active = true;
        this.rootId = this.record(org, null).id;
        this.sample(this.tick(), true);
    }
    record(org, parent) {
        const form = Snapshot.capture(org);
        const key = Snapshot.canonical(form);
        let genomeId = this.genomeKeys.get(key);
        if (genomeId === undefined) {
            genomeId = this.genomes.length;
            this.genomes.push(form);
            this.genomeKeys.set(key, genomeId);
        }
        const node = {id: this.nextId++, parentId: parent ? parent.id : null,
            generation: parent ? parent.generation + 1 : 0,
            birthTick: parent ? this.tick() : null, recordedAtTick: this.tick(),
            deathTick: null, deathReason: null, genomeId, species: org.species ? org.species.name : ''};
        this.nodes.push(node);
        this.byId.set(node.id, node);
        this.children.set(node.id, []);
        if (parent) this.children.get(parent.id).push(node.id);
        org.lineage_id = node.id;
        org.lineage_session = this.session;
        this.living++;
        if (this.living > this.peak) { this.peak = this.living; this.peakTick = this.tick(); }
        this.revision++;
        return node;
    }
    nodeFor(org) { return org.lineage_session === this.session ? this.byId.get(org.lineage_id) : undefined; }
    birth(parent, child) {
        if (!this.active) return;
        const node = this.nodeFor(parent);
        if (!node || node.deathTick !== null || this.nodeFor(child)) return;
        try { this.record(child, node); }
        catch (e) { this.complete = false; this.error = 'Recording incomplete: ' + e.message; this.stop('recording error'); }
    }
    death(org, reason = null) {
        if (!this.active) return;
        const node = this.nodeFor(org);
        if (!node || node.deathTick !== null) return;
        node.deathTick = this.tick();
        node.deathReason = reason || (this.env.lineage_event_tick == null ? 'manual intervention' : 'simulation');
        this.living--;
        this.revision++;
        if (this.living === 0) { this.extinctionTick = this.tick(); this.sample(this.tick(), true); }
    }
    sample(tick, force = false) {
        if (!this.active || (!force && tick % 100 !== 0)) return;
        const value = {tick, living: this.living};
        if (this.history.length && this.history[this.history.length - 1].tick === tick) this.history[this.history.length - 1] = value;
        else this.history.push(value);
        this.revision++;
    }
    stop(reason = 'stopped by user') {
        if (!this.active) return;
        this.sample(this.tick(), true);
        this.active = false;
        this.endedAtTick = this.tick();
        this.endReason = reason;
        this.revision++;
    }
    intervene(reason) { if (this.active) this.interventions.push({tick: this.tick(), reason}); }
    exportNode(id) {
        const node = this.byId.get(id);
        if (!node) throw new Error('Unknown ancestor ID');
        return Snapshot.exportOrganism(this.genomes[node.genomeId], node.species);
    }
    serialize() {
        const archive = {version: 1};
        for (const key of ['session','nodes','genomes','history','interventions','nextId','rootId','active','complete','living','peak','peakTick','extinctionTick','endedAtTick','endReason','error']) archive[key] = this[key];
        return Snapshot.copy(archive);
    }
    load(raw) {
        this.clear();
        if (!raw) {
            for (const org of this.env.organisms) delete org._lineage_load_tag;
            return;
        }
        try {
            const data = Snapshot.copy(raw);
            const fail = () => { throw new Error('Invalid lineage archive'); };
            if (data.version !== 1 || !Array.isArray(data.nodes) || !Array.isArray(data.genomes) || !Array.isArray(data.history) || !Array.isArray(data.interventions)) fail();
            const tick = value => Number.isSafeInteger(value) && value >= 0;
            if (typeof data.active !== 'boolean' || typeof data.complete !== 'boolean' || !tick(data.living) || !tick(data.peak) || data.peak < data.living || data.peak > data.nodes.length) fail();
            for (const key of ['peakTick','extinctionTick','endedAtTick']) if (data[key] !== null && !tick(data[key])) fail();
            if (data.active && data.endedAtTick !== null) fail();
            if (!data.nodes.length && (data.rootId !== null || data.active || data.genomes.length || data.history.length || data.living)) fail();
            if (data.nodes.length && (data.peakTick === null || (!data.active && data.endedAtTick === null))) fail();
            for (const i of data.interventions) if (!tick(i.tick) || typeof i.reason !== 'string') fail();
            const ids = new Map();
            let living = 0;
            for (const n of data.nodes) {
                if (!Number.isSafeInteger(n.id) || n.id < 1 || ids.has(n.id) || !Number.isInteger(n.genomeId) || !data.genomes[n.genomeId]) fail();
                if (!Number.isSafeInteger(n.recordedAtTick) || n.recordedAtTick < 0 || (n.deathTick !== null && (!Number.isSafeInteger(n.deathTick) || n.deathTick < n.recordedAtTick))) fail();
                if (n.parentId === null) { if (n.id !== data.rootId || n.generation !== 0 || n.birthTick !== null) fail(); }
                else { const p = ids.get(n.parentId); if (!p || n.generation !== p.generation + 1 || n.birthTick !== n.recordedAtTick || n.birthTick < p.recordedAtTick || (p.deathTick !== null && n.birthTick > p.deathTick)) fail(); }
                ids.set(n.id, n);
                if (n.deathTick === null) living++;
            }
            if (data.nodes.length && !ids.has(data.rootId)) fail();
            if (!Number.isSafeInteger(data.session) || data.session < 1 || !Number.isSafeInteger(data.nextId) || data.nextId <= data.nodes.reduce((max, n) => Math.max(max, n.id), 0) || data.living !== living) fail();
            for (const form of data.genomes) {
                if (!form.anatomy || !Array.isArray(form.anatomy.cells) || !form.anatomy.cells.length || !form.brain || !Array.isArray(form.brain.decisions) || !Number.isFinite(form.move_range) || !Number.isFinite(form.mutability)) fail();
                for (const c of form.anatomy.cells) if (!c.state || !['mouth','producer','mover','killer','armor','eye'].includes(c.state.name) || !Number.isInteger(c.loc_col) || !Number.isInteger(c.loc_row) || (c.state.name === 'eye' && ![0,1,2,3].includes(c.direction))) fail();
                if (typeof form.brain.independent_eye_decisions !== 'boolean' || !form.brain.decisions.length) fail();
                const states = form.brain.decisions[0].length;
                if (!states) fail();
                for (const eye of form.brain.decisions) {
                    if (!Array.isArray(eye) || eye.length !== states) fail();
                    for (const map of eye) for (const type of ['empty','food','wall','mouth','producer','mover','killer','armor','eye']) {
                        const choice = map && map[type];
                        if (!choice || !Number.isInteger(choice.decision) || choice.decision < 0 || choice.decision > 7 || !Number.isInteger(choice.state) || choice.state < 0 || choice.state >= states) fail();
                    }
                }
            }
            let last = -1;
            for (const h of data.history) { if (!Number.isSafeInteger(h.tick) || h.tick <= last || !Number.isSafeInteger(h.living) || h.living < 0) fail(); last = h.tick; }
            const present = new Set();
            // World load restores tags explicitly after constructors; do not replay births.
            for (const org of this.env.organisms) {
                const tag = org._lineage_load_tag;
                if (!tag || tag.session !== data.session) continue;
                const n = ids.get(tag.id);
                if (!n || n.deathTick !== null || present.has(tag.id) || !org.living) fail();
                present.add(tag.id);
            }
            if (data.active && present.size !== living) fail();
            for (const key of Object.keys(this.serialize())) if (key !== 'version') this[key] = data[key];
            this.byId = ids;
            this.children = new Map(this.nodes.map(n => [n.id, []]));
            for (const n of this.nodes) if (n.parentId !== null) this.children.get(n.parentId).push(n.id);
            this.genomeKeys = new Map(this.genomes.map((g, i) => [Snapshot.canonical(g), i]));
            for (const org of this.env.organisms) {
                const tag = org._lineage_load_tag;
                if (tag && tag.session === this.session && present.has(tag.id)) { org.lineage_id = tag.id; org.lineage_session = tag.session; }
            }
            this.revision++;
        } catch (e) {
            this.clear();
            this.complete = false;
            this.error = 'Lineage archive rejected; world loaded without ancestry. ' + e.message;
        } finally {
            for (const org of this.env.organisms) delete org._lineage_load_tag;
        }
    }
}
module.exports = LineageTracker;
// TADIWA EDIT END: observational individual ancestry archive
