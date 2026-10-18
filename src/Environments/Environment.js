//An evironment has a grid_map, controller, and renderer
class Environment{
    constructor() {
    }

    update(){
        alert("Environment.update() must be overriden");
    }

    changeCell(c, r, state, owner) {
        this.grid_map.setCellType(c, r, state);
        this.grid_map.setCellOwner(c, r, owner);
    }

    // Habitats only exist in WorldEnvironment. Other environments (like the
    // organism editor) have none, so by default nothing is blocked or hidden.
    isHabitat() { return false; }
    isHabitatBlocked() { return false; }
    isHiddenFrom() { return false; }
}


module.exports = Environment;