const CellStates = require("./Cell/CellStates");
const Neighbors = require("../Grid/Neighbors");
const Hyperparams = require("../Hyperparameters");
const Directions = require("./Directions");
const Anatomy = require("./Anatomy");
const Brain = require("./Perception/Brain");
const FossilRecord = require("../Stats/FossilRecord");
const SerializeHelper = require("../Utils/SerializeHelper");

class Organism {
    constructor(col, row, env, parent=null) {
        this.c = col;
        this.r = row;
        this.env = env;
        // Persist identity across saves so plants cannot acquire their own pollen.
        this.source_id = Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join('');
        this.pollen = null;
        this.lifetime = 0;
        this.food_collected = 0;
        this.living = true;
        this.anatomy = new Anatomy(this)
        this.direction = Directions.down; // direction of movement
        this.rotation = Directions.up; // direction of rotation
        this.move_count = 0;
        this.move_range = 4;
        this.ignore_brain_for = 0;
        this.mutability = 5;
        this.damage = 0;
        this.brain = new Brain(this);
        if (parent != null) {
            this.inherit(parent);
        }
    }

    inherit(parent) {
        this.move_range = parent.move_range;
        this.mutability = parent.mutability;
        this.species = parent.species;
        for (var c of parent.anatomy.cells){
            //deep copy parent cells
            this.anatomy.addInheritCell(c);
        }
        this.brain.copy(parent.brain);
    }

    // amount of food required before it can reproduce
    foodNeeded() {
        return this.anatomy.is_mover ? this.anatomy.cells.length + Hyperparams.extraMoverFoodCost : this.anatomy.cells.length;
    }

    lifespan() {
        return Math.max(1, this.anatomy.cells.length * Hyperparams.lifespanMultiplier *
            (this.isPlant() ? Hyperparams.plantLifespanFactor : 1));
    }

    maxHealth() {
        return this.anatomy.cells.length;
    }

    /** Create inherited, optionally mutated offspring without placing it in the world. */
    createOffspring() {
        var org = new Organism(0, 0, this.env, this);
        if(Hyperparams.rotationEnabled){
            org.rotation = Directions.getRandomDirection();
        }
        var prob = this.mutability;
        if (Hyperparams.useGlobalMutability){
            prob = Hyperparams.globalMutability;
        }
        else {
            //mutate the mutability
            if (Math.random() <= 0.5)
                org.mutability++;
            else{ 
                org.mutability--;
                if (org.mutability < 1)
                    org.mutability = 1;
            }
        } 
        var mutated = false;
// TADIWA EDIT START: avoid comparing brains on unchanged biological inheritance
        let lineageMutationAttempted = false;
// TADIWA EDIT END: avoid comparing brains on unchanged biological inheritance
        if (this.calcRandomChance(prob)) {
// TADIWA EDIT START: possible inherited brain change
            lineageMutationAttempted = true;
// TADIWA EDIT END: possible inherited brain change
            mutated = org.mutate();
        }

// TADIWA EDIT START: carry mutation-attempt information to both birth paths
        return {org, mutated, lineageMutationAttempted};
// TADIWA EDIT END: carry mutation-attempt information to both birth paths
    }

    /** Register a placed offspring and update its species population or lineage. */
// TADIWA EDIT START: shared biological registration for ordinary and pollen births
    registerBirth(org, mutated, knownInherited=false, lineageOrigin=null) {
// TADIWA EDIT END: shared biological registration for ordinary and pollen births
        this.env.addOrganism(org);
        if (mutated) FossilRecord.addSpecies(org, this.species);
        else {
            FossilRecord.resurrect(org.species);
            org.species.addPop();
        }
// TADIWA EDIT START: observe only successfully placed offspring, with pollen donor provenance
        if (this.env.lineage && this.env.lineage.active) this.env.lineage.birth(this, org, knownInherited, lineageOrigin);
// TADIWA EDIT END: observe only successfully placed offspring, with pollen donor provenance
    }

    reproduce() {
// TADIWA EDIT START: preserve ordinary inherited brain fast path
        const {org, mutated, lineageMutationAttempted} = this.createOffspring();
// TADIWA EDIT END: preserve ordinary inherited brain fast path
        var direction = Directions.getRandomScalar();
        var direction_c = direction[0];
        var direction_r = direction[1];
        var offset = (Math.floor(Math.random() * 3));
        var basemovement = this.anatomy.birth_distance;
        var new_c = this.c + (direction_c*basemovement) + (direction_c*offset);
        var new_r = this.r + (direction_r*basemovement) + (direction_r*offset);

        if (org.isClear(new_c, new_r, org.rotation, true) && 
            org.isStraightPath(new_c, new_r, this.c, this.r, this) && 
            this.env.canAddOrganism())
        {
            org.c = new_c;
            org.r = new_r;
// TADIWA EDIT START: successful ordinary biological birth through shared registration
            this.registerBirth(org, mutated, !lineageMutationAttempted);
// TADIWA EDIT END: successful ordinary biological birth through shared registration
        }
        Math.max(this.food_collected -= this.foodNeeded(), 0);
    }

    /** Only stationary producers participate in pollen production and reduced lifespan. */
    isPlant() {
        return this.anatomy.is_producer && !this.anatomy.is_mover;
    }

    /** Snapshot inheritable traits and retain the source species after parent death. */
    createPollen() {
        FossilRecord.pollen_species[this.species.name] = this.species;
// TADIWA EDIT START: attach donor lineage to delayed pollen without retaining the live donor
        const payload = {
            source_id: this.source_id,
            anatomy: this.anatomy.serialize(), brain: JSON.parse(JSON.stringify(this.brain.serialize())),
            move_range: this.move_range, mutability: this.mutability,
            species_name: this.species.name
        };
        if (this.env.lineage && this.env.lineage.active) this.env.lineage.pollen.capture(this, payload);
        return payload;
// TADIWA EDIT END: attach donor lineage to delayed pollen without retaining the live donor
    }

    /** Only movers retain a foreign pollen load; additional food does not reset it. */
    acquirePollen(payload) {
        if (!this.anatomy.is_mover || !payload || this.pollen || payload.source_id === this.source_id) return;
        this.pollen = {source: payload, remaining: Hyperparams.pollenDelayTicks};
// TADIWA EDIT START: observe transfer of tracked pollen to a carrier
        if (this.env.lineage && this.env.lineage.active) this.env.lineage.pollen.addCarrier(this);
// TADIWA EDIT END: observe transfer of tracked pollen to a carrier
    }

    /** Compute local bounds after rotation without allocating coordinate arrays. */
    bounds() {
        let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
        for (const cell of this.anatomy.cells) {
            const col = cell.rotatedCol(this.rotation);
            const row = cell.rotatedRow(this.rotation);
            left = Math.min(left, col);
            right = Math.max(right, col);
            top = Math.min(top, row);
            bottom = Math.max(bottom, row);
        }
        return {left, right, top, bottom};
    }

    /** Advance an existing load and consume it before attempting reproduction. */
    updatePollen() {
        if (!this.anatomy.is_mover) {
// TADIWA EDIT START: release pollen when a carrier cannot retain it
            if (this.env.lineage && this.env.lineage.active) this.env.lineage.pollen.removeCarrier(this);
// TADIWA EDIT END: release pollen when a carrier cannot retain it
            this.pollen = null;
            return;
        }
        if (!this.pollen || --this.pollen.remaining > 0) return;
        const source = this.pollen.source;
// TADIWA EDIT START: release the consumed carrier load before the unchanged reproduction attempt
        if (this.env.lineage && this.env.lineage.active) this.env.lineage.pollen.removeCarrier(this);
// TADIWA EDIT END: release the consumed carrier load before the unchanged reproduction attempt
        this.pollen = null;
        if (!this.calcRandomChance(Hyperparams.pollenReproductionProb) || !this.env.canAddOrganism()) return;
        const species = FossilRecord.extant_species[source.species_name] || FossilRecord.pollen_species[source.species_name];
        if (!species) return;
        const parent = new Organism(0, 0, this.env);
        parent.loadRaw(source);
        parent.species = species;
// TADIWA EDIT START: retain mutation-attempt information for pollen offspring
        const {org, mutated, lineageMutationAttempted} = parent.createOffspring();
// TADIWA EDIT END: retain mutation-attempt information for pollen offspring
        const a = this.bounds(), b = org.bounds();
        // A two-cell offset leaves a one-cell gap between the bounding boxes.
        const positions = [
            [this.c + a.right + 2 - b.left, this.r],
            [this.c + a.left - 2 - b.right, this.r],
            [this.c, this.r + a.bottom + 2 - b.top],
            [this.c, this.r + a.top - 2 - b.bottom]
        ];
        for (let i = positions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [positions[i], positions[j]] = [positions[j], positions[i]];
        }
        for (const [c, r] of positions) {
            if (!org.isClear(c, r)) continue;
            org.c = c;
            org.r = r;
// TADIWA EDIT START: attribute pollen offspring to the donor, never the carrier
            parent.registerBirth(org, mutated, !lineageMutationAttempted, source.lineage_origin);
// TADIWA EDIT END: attribute pollen offspring to the donor, never the carrier
            return;
        }
    }

    mutate() {
        let added = false;
        let changed = false;
        let removed = false;
        if (this.calcRandomChance(Hyperparams.addProb)) {
            let branch = this.anatomy.getRandomCell();
            let state = CellStates.getRandomLivingType(); // branch.state;
            let growth_direction = Neighbors.all[Math.floor(Math.random() * Neighbors.all.length)];
            let c = branch.loc_col + growth_direction[0];
            let r = branch.loc_row + growth_direction[1];
            if (this.anatomy.canAddCellAt(c, r)) {
                added = true;
                this.anatomy.addRandomizedCell(state, c, r);

                // attempt symmetrical mutations across horizontal, vertical, and both diagonal axes
                const axes = ['h', 'v', 'd'];
                for (let axis of axes) {
                    if (this.calcRandomChance(Hyperparams.mutationSymmetryChance)) {
                        let mc = c;
                        let mr = r;
                        switch (axis) {
                            case 'h': // horizontal symmetry (mirror over x-axis)
                                mr = -r;
                                if (r === 0) {
                                    mr = c;
                                    mc = -r;
                                }
                                break;
                            case 'v': // vertical symmetry (mirror over y-axis)
                                mc = -c;
                                if (c === 0) {
                                    mr = -c;
                                    mc = r;
                                }
                                break;
                            case 'd': // diagonal symmetry (mirror over both axes)
                                mc = -c;
                                mr = -r;
                                break;
                        }
                        if (this.anatomy.canAddCellAt(mc, mr)) {
                            this.anatomy.addRandomizedCell(state, mc, mr);
                        }
                    }
                }
            }
        }
        if (this.calcRandomChance(Hyperparams.changeProb)){
            let cell = this.anatomy.getRandomCell();
            let state = CellStates.getRandomLivingType();
            this.anatomy.replaceCell(state, cell.loc_col, cell.loc_row);
            changed = true;
        }
        if (this.calcRandomChance(Hyperparams.removeProb)){
            if(this.anatomy.cells.length > 1) {
                let cell = this.anatomy.getRandomCell();
                removed = this.anatomy.removeCell(cell.loc_col, cell.loc_row);
            }
        }
        if (this.anatomy.is_mover && this.calcRandomChance(Hyperparams.brainMutationChance)) { 
            if (this.anatomy.has_eyes) {
                this.brain.mutate();
            }
            this.move_range += Math.floor(Math.random() * 4) - 2;
            if (this.move_range <= 0){
                this.move_range = 1;
            };
        }
        // return true if a new species is created, which is only true for anatomy changes, not brain changes
        return added || changed || removed;
    }

    calcRandomChance(prob) {
        return (Math.random() * 100) < prob;
    }

    attemptMove() {
        var direction = Directions.scalars[this.direction];
        var direction_c = direction[0];
        var direction_r = direction[1];
        var new_c = this.c + direction_c;
        var new_r = this.r + direction_r;
        if (this.isClear(new_c, new_r)) {
            for (var cell of this.anatomy.cells) {
                var real_c = this.c + cell.rotatedCol(this.rotation);
                var real_r = this.r + cell.rotatedRow(this.rotation);
                this.env.changeCell(real_c, real_r, CellStates.empty, null);
            }
            this.c = new_c;
            this.r = new_r;
            this.updateGrid();
            return true;
        }
        return false;
    }

    attemptRotate(rotation=null) {
        if(!Hyperparams.rotationEnabled){
            this.direction = Directions.getRandomDirection();
            this.move_count = 0;
            return true;
        }
        if(rotation == null){
            rotation = Directions.getRandomDirection();
        }
        if(this.isClear(this.c, this.r, rotation)){
            for (var cell of this.anatomy.cells) {
                var real_c = this.c + cell.rotatedCol(this.rotation);
                var real_r = this.r + cell.rotatedRow(this.rotation);
                this.env.changeCell(real_c, real_r, CellStates.empty, null);
            }
            this.rotation = rotation;
            this.direction = Directions.getRandomDirection();
            this.updateGrid();
            this.move_count = 0;
            return true;
        }
        return false;
    }

    changeDirection(dir) {
        this.direction = dir;
        this.move_count = 0;
    }

    // assumes either c1==c2 or r1==r2, returns true if there is a clear path from point 1 to 2
    isStraightPath(c1, r1, c2, r2, parent){
        if (c1 == c2) {
            if (r1 > r2){
                var temp = r2;
                r2 = r1;
                r1 = temp;
            }
            for (var i=r1; i!=r2; i++) {
                var cell = this.env.grid_map.cellAt(c1, i)
                if (!this.isPassableCell(cell, parent)){
                    return false;
                }
            }
            return true;
        }
        else {
            if (c1 > c2){
                var temp = c2;
                c2 = c1;
                c1 = temp;
            }
            for (var i=c1; i!=c2; i++) {
                var cell = this.env.grid_map.cellAt(i, r1);
                if (!this.isPassableCell(cell, parent)){
                    return false;
                }
            }
            return true;
        }
    }

    isPassableCell(cell, parent){
        return cell != null && (cell.state == CellStates.empty || cell.owner == this || cell.owner == parent || cell.state == CellStates.food);
    }

    isClear(col, row, rotation=this.rotation) {
        for(var loccell of this.anatomy.cells) {
            var cell = this.getRealCell(loccell, col, row, rotation);
            if (cell==null) {
                return false;
            }
            // habitats keep out organisms that are too big
            if (cell.owner != this && this.env.isHabitatBlocked(this, cell.col, cell.row)) {
                return false;
            }
            if (cell.owner==this || cell.state==CellStates.empty || (!Hyperparams.foodBlocksReproduction && cell.state==CellStates.food)){
                continue;
            }
            return false;
        }
        return true;
    }
    
    harm() {
        this.damage++;
        if (this.damage >= this.maxHealth() || Hyperparams.instaKill) {
// TADIWA EDIT START: record the actual lethal damage path
            this.die('lethal-damage');
// TADIWA EDIT END: record the actual lethal damage path
        }
    }

// TADIWA EDIT START: explicit observed death cause
    die(reason = null) {
// TADIWA EDIT END: explicit observed death cause
// TADIWA EDIT START: release carrier pollen on death
        if (this.env.lineage && this.env.lineage.active) this.env.lineage.pollen.removeCarrier(this);
// TADIWA EDIT END: release carrier pollen on death
// TADIWA EDIT START: idempotent death observation
        if (this.env.lineage && this.env.lineage.active) this.env.lineage.death(this, reason);
// TADIWA EDIT END: idempotent death observation
        this.pollen = null;
        for (var cell of this.anatomy.cells) {
            var real_c = this.c + cell.rotatedCol(this.rotation);
            var real_r = this.r + cell.rotatedRow(this.rotation);
            this.env.changeCell(real_c, real_r, CellStates.food, null);
        }
        this.species.decreasePop();
        this.living = false;
    }

    updateGrid() {
        for (var cell of this.anatomy.cells) {
            var real_c = this.c + cell.rotatedCol(this.rotation);
            var real_r = this.r + cell.rotatedRow(this.rotation);
            this.env.changeCell(real_c, real_r, cell.state, cell);
        }
    }

    update() {
        // Newly acquired pollen starts aging on the following simulation tick.
        const pollenAtStart = this.pollen;
        this.lifetime++;
        if (this.lifetime > this.lifespan()) {
// TADIWA EDIT START: record the actual age limit path
            this.die('age-limit');
// TADIWA EDIT END: record the actual age limit path
            return this.living;
        }
        if (this.food_collected >= this.foodNeeded()) {
            this.reproduce();
        }
        for (var cell of this.anatomy.cells) {
            cell.performFunction();
            if (!this.living)
                return this.living
        }
        
        if (this.anatomy.is_mover) {
            const Decision = Brain.Decision;
            let brain_decision = Decision.neutral;
            let brain_direction = 0;
            if (this.anatomy.has_eyes) {
                let {decision, move_direction} = this.brain.decide();
                brain_decision = decision;
                brain_direction = move_direction;
            }
            let dontmove = false;
            switch (brain_decision) {
                case Decision.neutral:
                    // move move_range times, then randomly rotate/change direction
                    if (this.move_count > this.move_range) {
                        this.attemptRotate();
                        this.changeDirection(Directions.getRandomDirection());
                        this.move_count = 0;
                    }
                    break;
                case Decision.chase:
                    this.changeDirection(brain_direction);
                    break;
                case Decision.retreat:
                    this.changeDirection(Directions.getOppositeDirection(brain_direction));
                    break;
                case Decision.move_left:
                    this.changeDirection(Directions.getLeftDirection(brain_direction));
                    break;
                case Decision.move_right:
                    this.changeDirection(Directions.getRightDirection(brain_direction));
                    break;
                case Decision.turn_left:
                    // rotate left based on current rotation, brain direction irrelavent
                    this.attemptRotate(Directions.getLeftDirection(this.rotation));
                    dontmove = true;
                    break;
                case Decision.turn_right:
                    this.attemptRotate(Directions.getRightDirection(this.rotation));
                    dontmove = true;
                    break;
                case Decision.stop:
                    dontmove = true;
                    break;
            }
            if (!dontmove) {
                let moved = this.attemptMove();
                if (!moved) {
                    // if stuck, try to rotate or change direction
                    let rotated = this.attemptRotate();
                    if (!rotated) {
                        this.changeDirection(Directions.getRandomDirection());
                    }
                }
                else {
                    this.move_count++;
                }
            }
        }
        if (pollenAtStart && this.pollen === pollenAtStart) this.updatePollen();
        return this.living;
    }

    getRealCell(local_cell, c=this.c, r=this.r, rotation=this.rotation){
        var real_c = c + local_cell.rotatedCol(rotation);
        var real_r = r + local_cell.rotatedRow(rotation);
        return this.env.grid_map.cellAt(real_c, real_r);
    }

    isNatural() {
        let found_center = false;
        if (this.anatomy.cells.length === 0) {
            return false;
        }
        for (let i=0; i<this.anatomy.cells.length; i++) {
            let cell = this.anatomy.cells[i];
            for (let j=i+1; j<this.anatomy.cells.length; j++) {
                let toCompare = this.anatomy.cells[j];
                if (cell.loc_col === toCompare.loc_col && cell.loc_row === toCompare.loc_row) {
                    return false;
                }
            }
            if (cell.loc_col === 0 && cell.loc_row === 0) {
                found_center = true;
            }
        }
        return found_center;
    }

    serialize() {
        let org = SerializeHelper.copyNonObjects(this);
        org.pollen = this.pollen ? JSON.parse(JSON.stringify(this.pollen)) : null;
        org.anatomy = this.anatomy.serialize();
        if (this.anatomy.is_mover && this.anatomy.has_eyes)
            org.brain = this.brain.serialize();
// TADIWA EDIT START: separate standalone exports from world tags
        org.species_name = this.species.name;
        // Generic organism exports never carry world identity.
        delete org.lineage_id;
        delete org.lineage_session;
        delete org.lineage_brain;
// TADIWA EDIT END: separate standalone exports from world tags
        return org;
    }

    loadRaw(org) {
// TADIWA EDIT START: restore pollen while excluding tracking metadata from organism inheritance
        this.pollen = org.pollen ? JSON.parse(JSON.stringify(org.pollen)) : null;
        const {lineage_id, lineage_session, lineage_brain, lineage_origin, ...form} = org;
        SerializeHelper.overwriteNonObjects(form, this);
// TADIWA EDIT END: restore pollen while excluding tracking metadata from organism inheritance
        this.anatomy.loadRaw(org.anatomy)
        // Discard stationary carriers from saves created before the mover-only rule.
        if (!this.anatomy.is_mover) this.pollen = null;
        if (org.brain)
            this.brain.copy(org.brain)
    }

}

module.exports = Organism;
