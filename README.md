This is the readme for my evolution simulator, The Life Engine. 

FOR FEATURE REQUESTS, USE THE DISCUSSIONS TAB. FOR BUG REPORTS, USE THE ISSUES TAB. :)

# The Life Engine
[Play here!](https://thelifeengine.net/)

The life engine is a cellular automaton designed to simulate the long term processes of biological evolution. It allows organisms to eat, reproduce, mutate, and adapt.
Unlike genetic algorithms, the life engine does not manually select the most "fit" organism for some given task, but rather allows true natural selection to 
run its course. Organisms that survive, successfully produce offspring, and out-compete their neighbors naturally propogate througout the environment.

This is the second version of the [original evolution simulator](https://github.com/MaxRobinsonTheGreat/EvolutionSimulator), which I started in high school.


# How to Run and Modify the Code
 - [Install node and npm](https://nodejs.org/en/download/)
 - Download or clone this repository
 - Open a terminal or powershell comand prompt, go to the repository and run `npm install`
 - Run `npm run build` (or `npm run build-watch` for a better developer experience)
   - If you get a `Can't resolve jquery` error message run `npm install --save jquery`
 - Open `dist/index.html` in your browser. The simulation should start running.

To load custom creations (found in `/dist/assets`), you must have a simple web server that serves all files in the dist directory. I do this with python:
 - [Install python](https://www.python.org/downloads/)
 - run `python -m http.server --directory dist` from the repository root
 - Open `http://localhost:8000/` in your browser

### Npm build commands
- Production mode (minified): `npm run build`
- Watch mode (dev mode that auto-builds when you save a file): `npm run build-watch`
- Dev mode (better error messages): `npm run build-dev` 


# How the Simulation Works
## The Environment
The environment is a simple grid system made up of cells, which at every tick have a certain type. The environment is populated by organisms, which are structures of multiple cells.

## Cells
A cell can be one of the following types.
### Independent Cells
Independent cells are not part of organisms. 
- Empty - Dark blue, inert.
- Food - Grayish-blue, provides nourishment for organisms.
- Wall - Gray, blocks organisms movement and reproduction.
### Organism Cells
Organism Cells are only found in organisms, and cannot exist on their own in the grid.
- Mouth - Orange, eats food in directly adjacent cells.
- Producer - Green, randomly generates food in directly adjacent empty cells.
- Mover - Light blue, allows the organism to move and rotate randomly.
- Killer - Red, harms organisms in directly adjacent cells (besides itself).
- Armor - Purple, negates the effects of killer cells.
- Eye - Light purple with a slit, allows the organism to see and move intelligently. See further description below.

## Organisms
Organisms are structures of cells that eat food, reproduce, and die.
When an organism dies, every cell in the grid that was occupied by a cell in its body will be changed to food.
Their lifespan is calculated by multiplying the number of cells they have by the hyperparameter `Lifespan Multiplier`. They will survive for that many ticks unless killed by another organism.
When touched by a killer cell, an organism will take damage. Once it has taken as much damage as it has cells in its body, it will die. If the hyperparameter `One touch kill` is on, an organism will immediatly die when touched by a killer cell.

## Reproduction
Once an organism has eaten as much food as it has cells in its body, it will attempt to reproduce. 
First, offspring is formed by cloning the current organism and possibly mutating it (see below).
The offspring birth location is then chosen a certain number of cells in a random direction (up, down, left, right). This number is calculated programmatically such that it is far enough away that it can't intersect with it's parent.
Additionally, a random value between 1 and 3 is added to the location to introduce a little variance.
Reproduction can fail if the offspring attempts to occupy non-empty cells, like other organisms and food. If reproduction fails, the food required to produce a child is wasted.

## Mutation
Offspring can mutate their anatomies in 3 different ways: change a cell, lose a cell, or add a cell. Changing a cell sets a random cell to a random type. Losing a cell removes a random cell. Note that this can result in organisms with "gaps" and cells disconnected from the rest of its body. I consider this a feature, not a bug.
To add a cell the organism first selects a cell it already has in its body, then grows a new cell with a random type in a location adjacent to the selected cell.

If an organism mutates, there is a 10% chance that mutation will alter the movement patterns of the organism (see below).

## Movement and Rotation
Organisms with mover cells (light blue) are permitted to move freely about the grid. Only a single mover cell is required and adding more doesn't do anything. By default, an organism selects a random direction and moves one cell per tick in that direction for a certain number of ticks. This number is called "Move range", and it can mutate over time.

Organims can also rotate around a central pivot cell. This cell can never be removed by mutation, though it can change type. Movers rotate randomly when they change direction, and their rotation is not necessarily the same as their movement direction, ie, they aren't always facing the direction they are moving. Offspring of all organisms (including static ones) rotate randomly during reproduction. This rotation can be toggled in the simulation controls.

## Eyes and Brains
Any organism can evolve eyes, but when an organism has both eyes and mover cells it is given a brain. The eye, unlike other cells, has a direction, which is denoted by the direction of the slit in the cell. It "looks" forward in this direction and "sees" the first non-empty cell within a certain range. It checks the type of the cell and informs the brain, which then decideds how to move. The brain can either ignore (keep moving in whatever direction), chase (move towards the observed cell), or retreat (move in the opposite direction of the observed cell). The brain maps different observed cell types to different actions. For instance, the brain will chase when it sees food and retreat when it sees a killer cell. These behaviors can mutate over time. 


## Pollen-assisted plant reproduction

A plant is an organism with producer cells and no mover cells. Each food cell it
successfully produces has a 10% chance of containing pollen, shown in a different
colour in every theme. Pollen food remains ordinary food for nutrition, eyes,
movement, and food-blocking rules. Corpse food and manually dropped food have no pollen.

Only organisms with mover cells can carry pollen, with one load at a time.
Stationary organisms receive normal nutrition but do not acquire pollen; stored
loads on stationary organisms are discarded when loading older saves. Eating more pollen food still
provides nutrition but does not replace the load or restart its timer. A plant
cannot carry its own pollen. After 50 subsequent simulation ticks, the carrier
has one 25% chance to create offspring of the source plant beside its current
position. The load is discarded after that attempt, even if there is no space or
the population limit has been reached. Carrier death also destroys the load.

Offspring inherit the source plant's saved traits and use normal mutation and
rotation rules. The four cardinal sides are tried in random order, with a one-cell
gap between the carrier and offspring bounding boxes. Occupied cells and world
edges prevent placement. Pollen remains viable after the source plant dies, and
world saves preserve pollen food, carrier timers, source identity, and species.
Carrier offspring do not inherit the carried load. Existing food-based reproduction
continues alongside pollen reproduction.

Stationary producers live for `cell count × lifespan multiplier × plant lifespan
factor`, with a minimum of one tick. The default factor is 0.75 (25% shorter).
Evolution Controls includes pollen food probability (0–100%), delay (positive
integer ticks), reproduction probability (0–100%), and plant lifespan factor
(0.01–1). Changes to the delay apply to newly acquired loads. Loaded older worlds
have no stored pollen and use the new defaults when their controls are applied.
Set pollen probability to 0 and plant lifespan factor to 1 for baseline mechanics;
existing loads will still finish their attempts.

### Changes made

- Added pollen-bearing food from stationary producers, with distinct colours in
  every theme and normal food nutrition and perception.
- Added delayed, single-attempt reproduction beside pollen carriers, using the
  source plant's inherited traits and existing mutation and placement rules.
  Pollen remains viable after the source plant dies.
- Added adjustable pollen production probability, carrier delay, reproduction
  probability, and plant lifespan factor. Defaults are 10%, 50 ticks, 25%, and
  0.75 respectively; stationary plants therefore have 25% shorter lifespans.
- Extended world saves to preserve pollen food, carrier timers, source identity,
  and species records, including extinct sources. Older saves remain loadable,
  and species renaming preserves outstanding pollen references.
- Shared offspring creation and birth registration between ordinary and pollen
  reproduction. Ordinary food-based reproduction remains available: setting
  pollen reproduction probability to 0% disables only births through carriers.
- Restricted pollen acquisition and reproduction through carriers to organisms
  with mover cells. Stationary organisms still receive normal food nutrition.
- Added compatibility handling to discard pollen stored on stationary organisms
  when loading saves created before this restriction.

## Species lineage tracking (Tadiwanashe)

The tracker follows a species and its descendants as mutations change their names.
Select a living organism in the Editor, click **Track species**, then open
**Lineage**. Recording starts with all living members of that species. It tracks
one lineage at a time and cannot recover earlier ancestry.

### Mutation tree and ancestor forms

- Body-cell and inherited eye-direction changes create branches. Unchanged
  offspring add to the existing form's population.
- Forms show previews, first-observed ticks, mutation depth, population statistics
  and parent comparisons. Search by form ID or species name, or collapse branches.
- Brain versions are recorded separately for organisms with movers and eyes.
  Each body form keeps its first observed member's brain, movement range and mutability.
- Extinct forms remain available to download as organism JSON or open in the editor.

### Population and environmental evidence

Graphs show lineage and form populations, peaks, birth/death rates and extinction
events. Recorded death causes are age limit and lethal damage. The timeline marks
body and brain changes, seasons, settings and interventions. Losing one form does
not mean the whole lineage is extinct.

Food and plant populations are sampled every 100 ticks. Plants here are organisms
with producers and no movers. These records support extinction investigations;
evolutionary suicide still needs evidence from experimental comparisons.

### Persistence and integration

- World saves preserve the archive and restore tracking. Archives can also be
  downloaded separately, and older worlds without tracking data still load.
- Only successful biological births extend the lineage; failed reproduction and
  manually placed clones are excluded.
- Pollen births belong to the source plant's lineage. Tracking includes pending
  pollen because descendants can appear after the plant dies.
- Tracking does not change ecological rules or consume simulation randomness.

### Files and implementation structure

Data lives in `src/Stats`, controls in `src/Controllers` and previews in
`src/Rendering`. Paths below are relative to the repository root.

#### Added tracker modules

| File | Responsibility |
| --- | --- |
| `src/Stats/LineageTracker.js` | Owns the tracking session, live membership, parent-linked body forms, birth/death accounting, population history and archive save/load. |
| `src/Stats/LineageSnapshot.js` | Captures inherited organism data, identifies body forms, compares body/brain changes and produces editor-compatible organism exports. |
| `src/Stats/LineageResearch.js` | Records birth/death rates, direct death causes, active brain versions, settings changes and season events. |
| `src/Stats/LineageEnvironment.js` | Samples world food and stationary producer populations, including populations by current species name. |
| `src/Stats/LineagePollen.js` | Preserves donor ancestry through pollen food and carriers; accounts for pending sources and delayed births. |
| `src/Stats/LineageMigration.js` | Converts older individual-based archives into stopped form-based records for inspection. |
| `src/Controllers/LineagePanel.js` | Builds the mutation tree, form search/navigation, population graph, comparisons, archive downloads and editor actions. |
| `src/Controllers/LineageInsights.js` | Displays rates, death causes, event navigation and active brain versions. |
| `src/Controllers/LineageEnvironmentChart.js` | Displays food and plant histories alongside the lineage time axis. |
| `src/Rendering/LineageThumbnail.js` | Draws archived bodies and eye directions without creating live organisms or consuming simulation randomness. |

#### Existing files changed for tracking and compatibility

| File | Changes/additions |
| --- | --- |
| `src/Engine.js` | Creates and updates the lineage interface. |
| `src/Environments/WorldEnvironment.js` | Owns the tracker; samples completed ticks; handles removal/reset boundaries; saves/restores archives and live identities; accounts for pollen removed from the world. |
| `src/Organism/Organism.js` | Reports successful births and actual deaths; connects pollen births to their donor lineage; prevents tracking identity from leaking into standalone organism imports/exports. |
| `src/Controllers/ControlPanel.js` | Retains the selected live organism for tracking, observes control changes and supports world downloads containing large archives. |
| `src/Organism/Cell/BodyCells/ProducerCell.js` | Registers successfully created pollen packets with the tracker. |
| `src/Grid/GridMap.js` | Copies pollen data on load so a running world does not mutate the saved input object. |
| `src/Hyperparameters.js` | Restores season defaults for older saves without replacing explicitly supplied settings. |
| `dist/css/style.css` | Styles the lineage panel, tree, graphs and comparisons; keeps editor toolbar buttons at their original size. |
| `dist/index.html` | Updates asset references so the browser loads the integrated interface assets. |

# Habitats 
HABITATS: sheltered ground where small organisms can hide.

A habitat is its own layer, not a CellState. Every organism overwrites
the state of the grid cells it stands on and resets them to "empty"
when it moves away, which would erase a habitat stored as a state.

Rules:
    - an organism with more than habitat_max_cells cells can't enter
    - a small organism with ALL of its cells on habitat tiles is "hidden"
    - a hidden organism can't be harmed or seen by bigger organisms
