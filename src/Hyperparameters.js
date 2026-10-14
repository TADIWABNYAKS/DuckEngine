const Neighbors = require("./Grid/Neighbors");

const Hyperparams = {
    setDefaults: function() {
        this.lifespanMultiplier = 100;
        this.foodProdProb = 5;
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

        // Seasons - Implemented by Jack
        this.seasonsEnabled = false;
        this.seasonLength = 3000;              // ticks per season
        this.summerProductionMultiplier = 1.5; // plant food production in summer
        this.winterProductionMultiplier = 0.5; // plant food production in winter
        this.summerDecayMultiplier = 2;        // food decay speed in summer
        this.winterDecayMultiplier = 0.5;      // food decay speed in winter

        // Food decay - Implemented by Jack
        this.foodDecayEnabled = false;
        this.foodDecayRate = 0.1;              // % chance per tick that a food cell rots
    },

    loadJsonObj(obj) {
        for (let key in obj) {
            this[key] = obj[key];
        }
    }
}

Hyperparams.setDefaults();

module.exports = Hyperparams;