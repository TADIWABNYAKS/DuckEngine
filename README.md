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


# Added Features: Digesting Ducks 

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
| `src/Environments/WorldEnvironment.js` | Owns the tracker; samples completed ticks; handles removal/reset ; saves/restores archives and live identities; accounts for pollen removed from the world. |
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

## Changes made to the original code

Eight existing JavaScript files were modified; no new source files were added, and no HTML or CSS files were changed.

- *src/Environments/WorldEnvironment.js* — Added habitat storage, the default size limit, habitat-management and hiding checks, reset and grid-resizing behaviour, plus save/load support. Habitat tiles outside the grid are removed after resizing.
- *src/Environments/Environment.js* — Added safe default habitat methods for environments that do not use habitats.
- *src/Rendering/Renderer.js* — Added the translucent green habitat tint.
- *src/Organism/Organism.js* — Added a habitat-blocking check to isClear(), covering movement, rotation, reproduction, and editor placement. An organism's current cells are exempt from the blocking check so painting habitat under a large organism does not immediately trap it.
- *src/Organism/Cell/BodyCells/KillerCell.js* — Prevented larger predators from harming prey that is fully hidden in a habitat.
- *src/Controllers/ControlModes.js* — Added the HabitatDrop control mode.
- *src/Controllers/EnvironmentController.js* — Added habitat painting and erasing using the existing brush.
- *src/Controllers/ControlPanel.js* — Added the leaf button, mode-switching behaviour, and the *E* keyboard shortcut.
## Food Decay and Seasons

Seasons make the world alternate between summer and winter, and food decay lets uneaten food rot back into empty space. Both only change food: they never move, harm or remove organisms, so they cannot directly decide whether a species survives. Both are off by default and are found under Seasons & Food Decay in Evolution Controls.

The world starts in summer and switches season every 3000 ticks (default, can be changed). The current season and the ticks left until it changes are shown under the FPS readout in the Simulation Speed panel.

- Summer: producers make food 1.5× as often, and food rots 2× as fast.
- Winter: producers make food 0.5× as often, and food rots 0.5× as fast.

Each food cell has a chance per tick (default 0.1%) of turning back into an empty cell. When seasons are on, this chance is multiplied by the summer or winter decay multiplier. Only food cells are affected.

### Files changed
- `src/Environments/Seasons.js` (new): works out the current season and its production and decay multipliers.
- `src/Hyperparameters.js`: adds the season and decay settings and their defaults.
- `src/Organism/Cell/BodyCells/ProducerCell.js`: scales food production by the season.
- `src/Environments/WorldEnvironment.js`: adds `decayFood()`, which rots food each tick when decay is on.
- `src/Controllers/ControlPanel.js` and `dist/index.html`: the Seasons & Food Decay controls and the season display.
