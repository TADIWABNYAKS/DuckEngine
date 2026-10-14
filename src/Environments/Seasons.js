// Seasons - Implemented by Jack
// The world starts in summer and switches season every seasonLength ticks.
// Seasons only change how often plants make food and how fast food rots. They never
// touch organisms directly, so they can't force any species to survive or die out.
const Hyperparams = require('../Hyperparameters');

const Seasons = {
    length() {
        return Math.max(1, Math.floor(Hyperparams.seasonLength) || 1);
    },

    isSummer(tick) {
        return Math.floor(tick / this.length()) % 2 === 0;
    },

    name(tick) {
        if (!Hyperparams.seasonsEnabled) return 'Off';
        return this.isSummer(tick) ? 'Summer' : 'Winter';
    },

    ticksLeft(tick) {
        return this.length() - (tick % this.length());
    },

    // How much to scale plant food production this season
    productionMultiplier(tick) {
        if (!Hyperparams.seasonsEnabled) return 1;
        return Number(this.isSummer(tick) ? Hyperparams.summerProductionMultiplier : Hyperparams.winterProductionMultiplier);
    },

    // How much to scale food decay this season
    decayMultiplier(tick) {
        if (!Hyperparams.seasonsEnabled) return 1;
        return Number(this.isSummer(tick) ? Hyperparams.summerDecayMultiplier : Hyperparams.winterDecayMultiplier);
    },
};

module.exports = Seasons;
