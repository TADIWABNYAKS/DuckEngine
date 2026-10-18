const Environment = require('./Environment');
const Renderer = require('../Rendering/Renderer');
const GridMap = require('../Grid/GridMap');
const Organism = require('../Organism/Organism');
const CellStates = require('../Organism/Cell/CellStates');
const EnvironmentController = require('../Controllers/EnvironmentController');
const Hyperparams = require('../Hyperparameters.js');
const FossilRecord = require('../Stats/FossilRecord');
const WorldConfig = require('../WorldConfig');
const SerializeHelper = require('../Utils/SerializeHelper');
const Species = require('../Stats/Species');
// TADIWA EDIT START: lineage dependency
const LineageTracker = require('../Stats/LineageTracker');
// TADIWA EDIT END: lineage dependency
// TADIWA EDIT START: preserve seasons dependency alongside lineage observer
const Seasons = require('./Seasons');
// TADIWA EDIT END: preserve seasons dependency alongside lineage observer

// Habitat tiles live in a set of numbers: col*HABITAT_STRIDE + row
const HABITAT_STRIDE = 65536;
const habitatKey = (col, row) => col * HABITAT_STRIDE + row;
const habitatCol = (key) => Math.floor(key / HABITAT_STRIDE);
const habitatRow = (key) => key % HABITAT_STRIDE;

class WorldEnvironment extends Environment{
    constructor(engine, cell_size) {
        super();
        this.engine = engine ;
        this.renderer = new Renderer('env-canvas', 'env', cell_size);
        this.controller = new EnvironmentController(this, this.renderer.canvas);
        this.num_rows = Math.ceil(this.renderer.height / cell_size);
        this.num_cols = Math.ceil(this.renderer.width / cell_size);
        this.grid_map = new GridMap(this.num_cols, this.num_rows, cell_size);
        this.organisms = [];
        this.walls = [];
        this.habitats = new Set();
        this.habitat_max_cells = 5; // Animals with MORE cells than this can't enter or hide in a habitat
        this.total_mutability = 0;
        this.largest_cell_count = 0;
        this.reset_count = 0;
        this.total_ticks = 0;
        this.data_update_rate = 100;
// TADIWA EDIT START: world archive ownership
        this.lineage_event_tick = null;
        this.lineage = new LineageTracker(this);
// TADIWA EDIT END: world archive ownership
        FossilRecord.setEnv(this);
        // the renderer asks us whether a tile is a habitat so it can tint it
        this.renderer.habitat_lookup = (col, row) => this.isHabitat(col, row)
    }

    // TADIWA EDIT START: observe active recording without wrapping the ecological loop
    update() {
        if (!this.lineage.active) return this.updateSimulation();
        this.lineage_event_tick = this.total_ticks + 1;
        try {
            this.updateSimulation();
            this.lineage.research.observeSeason(this.total_ticks);
            this.lineage.updateFate();
            this.lineage.sample(this.total_ticks);
        } finally { this.lineage_event_tick = null; }
    }

    updateSimulation() {
    // TADIWA EDIT END: observe active recording without wrapping the ecological loop
        var to_remove = [];
        for (var i in this.organisms) {
            var org = this.organisms[i];
            if (!org.living || !org.update()) {
                to_remove.push(i);
            }
        }
        this.removeOrganisms(to_remove);
        if (Hyperparams.foodDropProb > 0) {
            this.generateFood();
        }
        if (Hyperparams.foodDecayEnabled && Hyperparams.foodDecayRate > 0) {
            this.decayFood();
        }
        this.total_ticks ++;
        if (this.total_ticks % this.data_update_rate == 0) {
            this.prunePollenSpecies();
            FossilRecord.updateData();
        }
    }

    /** Release extinct species once no food cell or carrier references their pollen. */
    prunePollenSpecies() {
        const retained = {};
        const retain = payload => {
            if (!payload) return;
            const name = payload.species_name;
            const species = FossilRecord.extant_species[name] || FossilRecord.pollen_species[name];
            if (species) retained[name] = species;
        };
        for (const column of this.grid_map.grid)
            for (const cell of column) retain(cell.pollen);
        for (const org of this.organisms) if (org.pollen) retain(org.pollen.source);
        FossilRecord.pollen_species = retained;
    }

    render() {
        if (WorldConfig.headless) {
            this.renderer.cells_to_render.clear();
            return;
        }
        this.renderer.renderCells();
        this.renderer.renderHighlights();
    }

    renderFull() {
        this.renderer.renderFullGrid(this.grid_map.grid);
    }

    removeOrganisms(org_indeces) {
        let start_pop = this.organisms.length;
        for (var i of org_indeces.reverse()){
// TADIWA EDIT START: observe all removals
            if (this.lineage.active) {this.lineage.pollen.removeCarrier(this.organisms[i]);this.lineage.death(this.organisms[i], 'removed from world');}
// TADIWA EDIT END: observe all removals
            this.total_mutability -= this.organisms[i].mutability;
            this.organisms.splice(i, 1);
        }
        if (this.organisms.length === 0 && start_pop > 0) {
            if (WorldConfig.auto_pause)
                $('.pause-button')[0].click();
            else if(WorldConfig.auto_reset) {
                this.reset_count++;
                this.reset(false);
            }
        }
    }

    OriginOfLife() {
        var center = this.grid_map.getCenter();
        var org = new Organism(center[0], center[1], this);
        org.anatomy.addDefaultCell(CellStates.mouth, 0, 0);
        org.anatomy.addDefaultCell(CellStates.producer, 1, 1);
        org.anatomy.addDefaultCell(CellStates.producer, -1, -1);
        this.addOrganism(org);
        FossilRecord.addSpecies(org, null);
        // this.addHabitat(center[0] + 20, center[1], 12);
    }

    addOrganism(organism) {
        organism.updateGrid();
        this.total_mutability += organism.mutability;
        this.organisms.push(organism);
        if (organism.anatomy.cells.length > this.largest_cell_count) 
            this.largest_cell_count = organism.anatomy.cells.length;
    }

    canAddOrganism() {
        return this.organisms.length < Hyperparams.maxOrganisms || Hyperparams.maxOrganisms < 0;
    }

    averageMutability() {
        if (this.organisms.length < 1)
            return 0;
        if (Hyperparams.useGlobalMutability) {
            return Hyperparams.globalMutability;
        }
        return this.total_mutability / this.organisms.length;
    }

    changeCell(c, r, state, owner) {
// TADIWA EDIT START: account pollen loss through the existing rendered cell-update path
        if(this.lineage?.active)this.lineage.pollen.removeFood(this.grid_map.cellAt(c,r));
// TADIWA EDIT END: account pollen loss through the existing rendered cell-update path
        super.changeCell(c, r, state, owner);
        this.renderer.addToRender(this.grid_map.cellAt(c, r));
        if(state == CellStates.wall)
            this.walls.push(this.grid_map.cellAt(c, r));
// TADIWA EDIT START: update paused/manual pollen fate after cell replacement
        if(this.lineage?.active&&this.lineage_event_tick==null)this.lineage.updateFate();
// TADIWA EDIT END: update paused/manual pollen fate after cell replacement
    }

    clearWalls() {
        for(var wall of this.walls){
            let wcell = this.grid_map.cellAt(wall.col, wall.row);
            if (wcell && wcell.state == CellStates.wall)
                this.changeCell(wall.col, wall.row, CellStates.empty, null);
        }
    }

    clearOrganisms() {
// TADIWA EDIT START: annotate manual clear
        this.lineage.intervene('manual clear');
// TADIWA EDIT END: annotate manual clear
        for (var org of this.organisms)
            org.die();
        this.organisms = [];
    }
    
    clearDeadOrganisms() {
        let to_remove = [];
        for (let i in this.organisms) {
            let org = this.organisms[i];
            if (!org.living)
                to_remove.push(i);
        }
        this.removeOrganisms(to_remove);
    }

    generateFood() {
        var num_food = Math.max(Math.floor(this.grid_map.cols*this.grid_map.rows*Hyperparams.foodDropProb/50000), 1)
        var prob = Hyperparams.foodDropProb;
        for (var i=0; i<num_food; i++) {
            if (Math.random() <= prob){
                var c=Math.floor(Math.random() * this.grid_map.cols);
                var r=Math.floor(Math.random() * this.grid_map.rows);

                if (this.grid_map.cellAt(c, r).state == CellStates.empty){
                    this.changeCell(c, r, CellStates.food, null);
                }
            }
        }
    }

// TADIWA EDIT START: retain seasonal decay alongside habitat terrain methods
    // Food decay - Implemented by Jack
    // Each food cell has a foodDecayRate% chance per tick of rotting into empty space (scaled by season).
    // Rather than checking every cell, we check a random sample of cells, which gives the same
    // average result but runs faster. Only food is removed, never organisms.
    decayFood() {
        var chance = (Hyperparams.foodDecayRate / 100) * Seasons.decayMultiplier(this.total_ticks);
        if (chance <= 0) return;
        var cols = this.grid_map.cols;
        var rows = this.grid_map.rows;
        var expected = cols * rows * Math.min(chance, 1);
        var samples = Math.floor(expected);
        if (Math.random() < expected - samples) samples++;
        for (var i = 0; i < samples; i++) {
            var c = Math.floor(Math.random() * cols);
            var r = Math.floor(Math.random() * rows);
            if (this.grid_map.cellAt(c, r).state == CellStates.food) {
                this.changeCell(c, r, CellStates.empty, null);
            }
        }
    }

    isHabitat(col, row) {
        return this.habitats.has(habitatKey(col, row));
    }
    // paint a size x size square of habitat centered on (col, row)
    addHabitat(col, row, size=1) {
        this.paintHabitat(col, row, size, true);
    }
    // erase a size x size square of habitat centered on (col, row)
    removeHabitat(col, row, size=1) {
        this.paintHabitat(col, row, size, false);
    }

    paintHabitat(col, row, size, on) {
        size = Math.max(1, Math.floor(size));
        let first_col = col - Math.floor(size / 2);
        let first_row = row - Math.floor(size / 2);
        for (let c = first_col; c < first_col + size; c++) {
            for (let r = first_row; r < first_row + size; r++) {
                let cell = this.grid_map.cellAt(c, r);
                if (!cell) // off the grid
                    continue;
                let key = habitatKey(c, r);
                if (this.habitats.has(key) === on)
                    continue;
                if (on)
                    this.habitats.add(key);
                else
                    this.habitats.delete(key);
                this.renderer.addToRender(cell); 
            }
        }
    }

    clearHabitats() {
        for (let key of this.habitats) {
            let cell = this.grid_map.cellAt(habitatCol(key), habitatRow(key));
            if (cell)
                this.renderer.addToRender(cell);
        }
        this.habitats.clear();
    }

    // forget habitat tiles that are no longer on the grid (after a resize)
    pruneHabitats() {
        for (let key of this.habitats) {
            if (!this.grid_map.cellAt(habitatCol(key), habitatRow(key)))
                this.habitats.delete(key);
        }
    }

    isSmall(org) {
        return org.anatomy.cells.length <= this.habitat_max_cells;
    }

    // true if organism is too big to step onto the habitat tile at (col, row)
    isHabitatBlocked(org, col, row) {
        return this.habitats.size > 0 && this.isHabitat(col, row) && !this.isSmall(org);
    }

    // a small organism with every cell on habitat is hidden
    isHidden(org) {
        if (!org || this.habitats.size === 0 || !this.isSmall(org))
            return false;
        for (let cell of org.anatomy.cells) {
            if (!this.isHabitat(cell.getRealCol(), cell.getRealRow()))
                return false;
        }
        return true;
    }

    // true if victim is hidden from observer.
    isHiddenFrom(victim, observer) {
        return this.isHidden(victim) && !this.isSmall(observer);
    }

// TADIWA EDIT END: retain seasonal decay alongside habitat terrain methods
    reset(confirm_reset=true, reset_life=true) {
        if (confirm_reset && !confirm('The current environment will be lost. Proceed?'))
            return false;
// TADIWA EDIT START: preserve archive across reset
        this.lineage.intervene('world reset');
        this.lineage.stop('world reset; remaining individuals last seen at reset');
        this.lineage_selection = null;
// TADIWA EDIT END: preserve archive across reset
        let restart = false;
        if (this.engine.running) {
            this.engine.last_fps = this.engine.fps;
            this.engine.stop();
            restart = true;
        }
        this.organisms = [];
        if (WorldConfig.clear_walls_on_reset) // habitats are terrain, so they follow the same rule as walls
            this.habitats.clear();
        this.grid_map.fillGrid(CellStates.empty, !WorldConfig.clear_walls_on_reset);
        this.renderer.renderFullGrid(this.grid_map.grid);
        this.total_mutability = 0;
        this.total_ticks = 0;
        this.largest_cell_count = 0;
        FossilRecord.clear_record();
        if (reset_life)
            this.OriginOfLife();
        if (restart)
            this.engine.start(this.engine.last_fps);
        return true;
    }

    resizeGridColRow(cell_size, cols, rows) {
        this.renderer.cell_size = cell_size;
        this.renderer.fillShape(rows*cell_size, cols*cell_size);
        this.grid_map.resize(cols, rows, cell_size);
        this.pruneHabitats();
    }

    resizeFillWindow(cell_size) {
        this.renderer.cell_size = cell_size;
        this.renderer.fillWindow('env');
        this.num_cols = Math.ceil(this.renderer.width / cell_size);
        this.num_rows = Math.ceil(this.renderer.height / cell_size);
        this.grid_map.resize(this.num_cols, this.num_rows, cell_size);
        this.pruneHabitats();
    }

    serialize() {
        this.clearDeadOrganisms();
        let env = SerializeHelper.copyNonObjects(this);
        env.grid = this.grid_map.serialize();
        env.habitats = [];
        for (let key of this.habitats)
            env.habitats.push({c: habitatCol(key), r: habitatRow(key)});        
        env.organisms = [];
        for (let org of this.organisms){
// TADIWA EDIT START: explicit world organism tags
            const raw = org.serialize();
            const node = this.lineage.nodeFor(org);
            raw.lineage_id = node ? node.id : null;
            raw.lineage_session = node ? this.lineage.session : null;
            const brain = this.lineage.research.members.get(org);
            raw.lineage_brain = brain ? brain.id : null;
            env.organisms.push(raw);
// TADIWA EDIT END: explicit world organism tags
        }
        env.fossil_record = FossilRecord.serialize();
        // Only retain species still referenced by food or a carrier.
        const names = new Set();
        for (const food of env.grid.food) if (food.pollen) names.add(food.pollen.species_name);
        for (const org of env.organisms) if (org.pollen) names.add(org.pollen.source.species_name);
        env.pollen_species = {};
        for (const name of names) {
            const species = FossilRecord.extant_species[name] || FossilRecord.pollen_species[name];
            if (species) env.pollen_species[name] = SerializeHelper.copyNonObjects(species);
        }
        env.controls = Hyperparams;
// TADIWA EDIT START: versioned world archive
        env.lineage_tracker = this.lineage.serialize();
        delete env.lineage_event_tick;
// TADIWA EDIT END: versioned world archive
        return env;
    }

    loadRaw(env) { // species name->stats map, evolution controls, 
        this.organisms = [];
        FossilRecord.clear_record();
        let cell_size = env.grid.cell_size ? env.grid.cell_size : this.grid_map.cell_size;
        this.resizeGridColRow(cell_size, env.grid.cols, env.grid.rows)
        this.grid_map.loadRaw(env.grid);
        for (let wall of env.grid.walls) {
            this.walls.push(this.grid_map.cellAt(wall.c, wall.r));
        }

        this.habitats.clear();
        for (let h of env.habitats || []) {
            if (this.grid_map.cellAt(h.c, h.r))
                this.habitats.add(habitatKey(h.c, h.r));
        }

        // create species map
        let species = {};
        for (let name in env.fossil_record.species) {
            let s = new Species(null, null, 0);
            SerializeHelper.overwriteNonObjects(env.fossil_record.species[name], s)
            species[name] = s; // the species needs an anatomy obj still
        }

// TADIWA EDIT START: transient load tags without modifying organism shapes
        const lineageTags = new Map();
// TADIWA EDIT END: transient load tags without modifying organism shapes
        for (let orgRaw of env.organisms) {
            let org = new Organism(orgRaw.col, orgRaw.row, this);
            org.loadRaw(orgRaw);
// TADIWA EDIT START: restore nullable identity explicitly
            lineageTags.set(org, {id: orgRaw.lineage_id, session: orgRaw.lineage_session, brain: orgRaw.lineage_brain});
// TADIWA EDIT END: restore nullable identity explicitly
            this.addOrganism(org);
            let s = species[orgRaw.species_name];
            if (!s){ // ideally, every organisms species should exists, but there is a bug that misses some species sometimes
                s = new Species(org.anatomy, null, env.total_ticks);
                species[orgRaw.species_name] = s;
            }
            if (!s.anatomy) {
                //if the species doesn't have anatomy we need to initialize it
                s.anatomy = org.anatomy;
                s.calcAnatomyDetails();
            }
            s.name = orgRaw.species_name;
            org.species = s;
        }
        for (let name in species)
            FossilRecord.addSpeciesObj(species[name]);
        // Reuse living species records; reconstruct extinct sources retained by pollen.
        for (const [name, raw] of Object.entries(env.pollen_species || {})) {
            const s = species[name] || new Species(null, null, 0);
            if (!species[name]) SerializeHelper.overwriteNonObjects(raw, s);
            FossilRecord.pollen_species[name] = s;
        }
        // Source snapshots supply anatomy omitted from compact species records.
        const restoreAnatomy = payload => {
            if (!payload) return;
            const s = FossilRecord.pollen_species[payload.species_name];
            if (s && !s.anatomy) {
                const template = new Organism(0, 0, this);
                template.loadRaw(payload);
                s.anatomy = template.anatomy;
                s.calcAnatomyDetails();
            }
        };
        for (const f of env.grid.food) restoreAnatomy(f.pollen);
        for (const org of this.organisms) if (org.pollen) restoreAnatomy(org.pollen.source);
        FossilRecord.loadRaw(env.fossil_record);
        SerializeHelper.overwriteNonObjects(env, this);
// TADIWA EDIT START: restore archive after world reconstruction
        this.lineage_event_tick = null;
        this.lineage_selection = null;
        this.lineage.load(env.lineage_tracker, lineageTags);
// TADIWA EDIT END: restore archive after world reconstruction
        if ($('#override-controls').is(':checked'))
            Hyperparams.loadJsonObj(env.controls)
        this.renderer.renderFullGrid(this.grid_map.grid);
    }
}

module.exports = WorldEnvironment;

