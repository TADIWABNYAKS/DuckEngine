// TADIWA EDIT START: read-only food and plant population history
const S = require('./LineageSnapshot');
const Cells = require('../Organism/Cell/CellStates');
class LineageEnvironment {
    constructor(tracker) {
        this.tracker = tracker; this.fromTick = null; this.history = []; this.species = []; this.byName = new Map();
    }
    sample(tick) {
        const env = this.tracker.env;
        let food = 0, plants = 0, pollenFood = 0, pollenCarriers = 0; const counts = new Map();
        for (const col of env.grid_map.grid) for (const cell of col) if (cell.state === Cells.food) {food++;if(cell.pollen)pollenFood++;}
        for (const org of env.organisms) {
            if(org.living&&org.anatomy.is_mover&&org.pollen)pollenCarriers++;
            if (!org.living || !org.anatomy.is_producer || org.anatomy.is_mover) continue;
            const name = org.species && org.species.name || '(unnamed)';
            let species = this.byName.get(name);
            if (!species) {
                species = {id:this.species.length + 1, name, firstSeenTick:tick};
                this.species.push(species); this.byName.set(name, species);
            }
            plants++; counts.set(species.id, (counts.get(species.id) || 0) + 1);
        }
        if (this.fromTick === null) this.fromTick = tick;
        const point = {tick, food, plants, pollenFood, pollenCarriers, season:this.tracker.research?.season||null, bySpecies:[...counts].sort((a,b)=>a[0]-b[0])};
        if (this.history.at(-1)?.tick === tick) this.history[this.history.length - 1] = point;
        else this.history.push(point);
    }
    serialize() { return S.copy({fromTick:this.fromTick, species:this.species, history:this.history}); }
    load(raw) {
        if (!raw) {
            if (this.tracker.active) this.sample(this.tracker.env.total_ticks);
            return;
        }
        const d = S.copy(raw), uint = n=>Number.isSafeInteger(n) && n>=0;
        const fail = ()=>{throw new Error('Invalid environment history');};
        if (!Array.isArray(d.species) || !Array.isArray(d.history) || d.fromTick!==null && !uint(d.fromTick)) fail();
        if (d.fromTick===null && (d.species.length || d.history.length) || d.fromTick!==null && !d.history.length) fail();
        for (const species of d.species) {
            if (species.id!==this.species.length+1 || typeof species.name!=='string' || !species.name || this.byName.has(species.name) || !uint(species.firstSeenTick) || species.firstSeenTick<d.fromTick) fail();
            this.species.push(species); this.byName.set(species.name, species);
        }
        let last = -1;
        for (const point of d.history) {
            if (!uint(point.tick) || point.tick<=last || point.tick<d.fromTick || !uint(point.food) || !uint(point.plants) || !Array.isArray(point.bySpecies)) fail();
            for(const key of ['pollenFood','pollenCarriers'])if(point[key]!==undefined&&!uint(point[key]))fail();
            if(point.pollenFood>point.food||point.season!=null&&!['Off','Summer','Winter'].includes(point.season))fail();
            let previous=0, total=0;
            for (const entry of point.bySpecies) {
                if (!Array.isArray(entry) || entry.length!==2) fail();
                const [id,count]=entry, species=this.species[id-1];
                if (!uint(id) || id<=previous || !species || species.firstSeenTick>point.tick || !uint(count) || !count) fail();
                previous=id; total+=count;
            }
            if (total!==point.plants) fail();
            last=point.tick; this.history.push(point);
        }
        if (d.fromTick!==null && d.history[0].tick!==d.fromTick) fail();
        this.fromTick=d.fromTick;
    }
}
module.exports=LineageEnvironment;
// TADIWA EDIT END: read-only food and plant population history
