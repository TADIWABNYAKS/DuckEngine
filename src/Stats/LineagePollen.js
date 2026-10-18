// TADIWA EDIT START: delayed pollen ancestry and incremental pending-source accounting
const S=require('./LineageSnapshot');
class LineagePollen {
    constructor(tracker) {
        this.tracker=tracker;this.food=0;this.carriers=0;this.dormant=false;
        this.foodMembers=new WeakMap();this.carrierMembers=new WeakMap();
    }
    get pending() {return this.food+this.carriers;}
    capture(parent,payload) {
        const node=this.tracker.nodeFor(parent);
        if(node)payload.lineage_origin={session:this.tracker.session,nodeId:node.id};
    }
    nodeFor(origin,parent) {
        if(!origin||origin.session!==this.tracker.session)return null;
        const node=this.tracker.byId.get(origin.nodeId);
        return node&&S.bodyKey(parent)===node.shapeKey?node:null;
    }
    addFood(cell) {
        if(this.foodMembers.has(cell))return;
        const node=cell.pollen&&this.nodeFor(cell.pollen.lineage_origin,cell.pollen);
        if(node){this.foodMembers.set(cell,node.id);this.food++;this.tracker.revision++;}
    }
    removeFood(cell) {
        if(cell&&this.foodMembers.has(cell)){this.foodMembers.delete(cell);this.food--;this.tracker.revision++;}
    }
    addCarrier(org) {
        if(this.carrierMembers.has(org))return;
        const source=org.pollen&&org.pollen.source,node=source&&this.nodeFor(source.lineage_origin,source);
        if(node){this.carrierMembers.set(org,node.id);this.carriers++;this.tracker.revision++;}
    }
    removeCarrier(org) {
        if(this.carrierMembers.has(org)){this.carrierMembers.delete(org);this.carriers--;this.tracker.revision++;}
    }
    rebuild(linkExisting=false) {
        const t=this.tracker,bySource=new Map(),bySpecies=new Map();
        this.food=0;this.carriers=0;this.foodMembers=new WeakMap();this.carrierMembers=new WeakMap();
        for(const org of t.env.organisms){const node=t.nodeFor(org);if(node){bySource.set(org.source_id,node);bySpecies.set(org.species.name,node);}}
        for(const node of t.nodes)if(!bySpecies.has(node.species))bySpecies.set(node.species,node);
        const link=payload=>{
            if(!payload)return;
            if(linkExisting){
                const node=bySource.get(payload.source_id)||bySpecies.get(payload.species_name);
                if(node&&S.bodyKey(payload)===node.shapeKey)payload.lineage_origin={session:t.session,nodeId:node.id};
                else if(payload.lineage_origin)delete payload.lineage_origin;
            }else if(payload.lineage_origin?.session===t.session&&!this.nodeFor(payload.lineage_origin,payload))throw new Error('Invalid pollen lineage origin');
        };
        for(const col of t.env.grid_map.grid)for(const cell of col){link(cell.pollen);this.addFood(cell);}
        for(const org of t.env.organisms)if(org.living&&org.anatomy.is_mover&&org.pollen){link(org.pollen.source);this.addCarrier(org);}
        this.dormant=!t.living&&this.pending>0;
    }
    load(raw) {
        const t=this.tracker;
        if(raw&&(!Number.isSafeInteger(raw.food)||raw.food<0||!Number.isSafeInteger(raw.carriers)||raw.carriers<0))throw new Error('Invalid pending pollen counts');
        if(t.active){
            this.rebuild(!raw);
            if(raw&&(raw.food!==this.food||raw.carriers!==this.carriers))throw new Error(`Pending pollen membership mismatch: saved ${raw.food}/${raw.carriers}, restored ${this.food}/${this.carriers}`);
        }else if(raw){this.food=raw.food;this.carriers=raw.carriers;this.dormant=!t.living&&this.pending>0;}
    }
    serialize(){return {food:this.food,carriers:this.carriers};}
}
module.exports=LineagePollen;
// TADIWA EDIT END: delayed pollen ancestry and incremental pending-source accounting
