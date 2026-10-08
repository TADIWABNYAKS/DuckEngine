// TADIWA EDIT START: immutable inherited forms and editor-compatible exports
const copy = value => JSON.parse(JSON.stringify(value));
function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
    return JSON.stringify(value);
}
function capture(org) {
    return copy({
        anatomy: {cells: org.anatomy.serialize().cells},
        brain: {decisions: org.brain.decisions, independent_eye_decisions: org.brain.independent_eye_decisions},
        move_range: org.move_range, mutability: org.mutability
    });
}
function exportOrganism(snapshot, name) {
    return Object.assign(copy(snapshot), {
        species_name: name || 'Recorded ancestor', living: true, lifetime: 0,
        food_collected: 0, damage: 0, rotation: 0, direction: 2,
        move_count: 0, ignore_brain_for: 0
    }); // Position and lineage identity deliberately absent; editor keeps its center.
}
function compare(parent, child) {
    if (!parent) return {body: ['Root form; earlier ancestry unknown'], brain: ['Root brain; earlier ancestry unknown']};
    const before = new Map(parent.anatomy.cells.map(c => [c.loc_col + ',' + c.loc_row, c]));
    const after = new Map(child.anatomy.cells.map(c => [c.loc_col + ',' + c.loc_row, c]));
    const body = [];
    for (const [pos, cell] of after) {
        const old = before.get(pos);
        if (!old) body.push(`Added ${cell.state.name} at (${pos})`);
        else if (canonical(old) !== canonical(cell)) body.push(`(${pos}): ${old.state.name}${old.direction == null ? '' : ' direction ' + old.direction} → ${cell.state.name}${cell.direction == null ? '' : ' direction ' + cell.direction}`);
    }
    for (const [pos, cell] of before) if (!after.has(pos)) body.push(`Removed ${cell.state.name} at (${pos})`);
    if (!body.length && canonical(parent.anatomy) !== canonical(child.anatomy)) body.push('Cell execution order changed');
    const brain = [];
    if (parent.brain.independent_eye_decisions !== child.brain.independent_eye_decisions) brain.push(`Independent eyes: ${parent.brain.independent_eye_decisions} → ${child.brain.independent_eye_decisions}`);
    if (canonical(parent.brain.decisions) !== canonical(child.brain.decisions)) brain.push('Decision maps changed (see complete maps below)');
    return {body: body.length ? body : ['Body unchanged'], brain: brain.length ? brain : ['Brain unchanged']};
}
module.exports = {copy, canonical, capture, exportOrganism, compare};
// TADIWA EDIT END: immutable inherited forms and editor-compatible exports
