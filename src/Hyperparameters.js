const Neighbors = require("./Grid/Neighbors");

// Shared validation bounds for pollen controls and imported configurations.
const pollenLimits = {
    pollenFoodProb: [0, 100],
    pollenDelayTicks: [1, Number.MAX_SAFE_INTEGER],
    pollenReproductionProb: [0, 100],
    plantLifespanFactor: [0.01, 1]
};

const Hyperparams = {
    setDefaults: function() {
        this.lifespanMultiplier = 100;
        this.foodProdProb = 5;
        this.setPollenDefaults();
        this.killableNeighbors = Neighbors.adjacent;
        this.edibleNeighbors = Neighbors.adjacent;
        this.growableNeighbors = Neighbors.adjacent;

        this.useGlobalMutability = false;
        this.globalMutability = 5;
        this.addProb = 25;
        this.changeProb = 25;
        this.removeProb = 25;
        this.brainMutationChance = 25;
        this.mutationSymmetryChance = 10;
        
        this.rotationEnabled = true;

        this.foodBlocksReproduction = true;
        this.moversCanProduce = false;

        this.instaKill = false;
        this.dontKillSameSpecies = false;

        this.lookRange = 30;
        this.seeThroughSelf = false;
        this.evolveIndependentEyeDecisions = true;

        this.foodDropProb = 0;

        this.extraMoverFoodCost = 0;

        this.maxOrganisms = -1;
    },

    setPollenDefaults() {
        this.pollenFoodProb = 10;
        this.pollenDelayTicks = 50;
        this.pollenReproductionProb = 25;
        this.plantLifespanFactor = 0.75;
    },

    /** Apply a valid control value; leave the current setting unchanged on failure. */
    setPollenControl(key, value) {
        if (!Object.hasOwn(pollenLimits, key)) return false;
        const [min, max] = pollenLimits[key];
        const n = Number(value);
        if (value === '' || !Number.isFinite(n) || n < min || n > max ||
            (key === 'pollenDelayTicks' && !Number.isSafeInteger(n))) return false;
        this[key] = n;
        return true;
    },

    loadJsonObj(obj) {
        // Older saves omit pollen settings and should use the feature defaults.
        this.setPollenDefaults();
        for (let key in obj) {
            if (Object.hasOwn(pollenLimits, key))
                this.setPollenControl(key, obj[key]);
            else this[key] = obj[key];
        }
    }
}

Hyperparams.setDefaults();

module.exports = Hyperparams;