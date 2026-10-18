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
// The key describes appearance only; representative cell/eye execution order stays intact.
function bodyKey(form) {
    return JSON.stringify(form.anatomy.cells.map(c => [c.loc_col, c.loc_row, c.state.name,
        c.state.name === 'eye' ? c.direction : null]).sort((a,b) => a[0]-b[0] || a[1]-b[1] || a[2].localeCompare(b[2])));
}
function brainChanges(before, after) {
    const changes=[];
    if (!before) return ['First observed active brain; earlier active-brain history unknown.'];
    if (before.brain.independent_eye_decisions!==after.brain.independent_eye_decisions) changes.push(`Independent eyes: ${before.brain.independent_eye_decisions} → ${after.brain.independent_eye_decisions}`);
    const labels=['neutral','retreat','chase','move left','move right','stop','turn left','turn right'];
    for(let e=0;e<Math.max(before.brain.decisions.length,after.brain.decisions.length);e++) {
        const a=before.brain.decisions[e]||[],b=after.brain.decisions[e]||[];
        for(let s=0;s<Math.max(a.length,b.length);s++) {
            if(!a[s]||!b[s]) {changes.push(`Eye ${e+1}, state ${s}: ${a[s]?'removed':'added'}`);continue;}
            for(const type of Object.keys(b[s])) if(canonical(a[s][type])!==canonical(b[s][type])) {
                const x=a[s][type],y=b[s][type];
                changes.push(`Eye ${e+1}, state ${s}, ${type}: ${labels[x.decision]} / state ${x.state} → ${labels[y.decision]} / state ${y.state}`);
            }
        }
    }
    const eyes=form=>form.anatomy.cells.filter(c=>c.state.name==='eye').map(c=>[c.loc_col,c.loc_row,c.direction]);
    if(canonical(eyes(before))!==canonical(eyes(after)))changes.push('Eye layout, orientation or mapping order changed.');
    return changes.length?changes:['Inherited decision maps unchanged.'];
}
function validate(form) {
    const fail = () => { throw new Error("Invalid representative snapshot"); };
    if (!form.anatomy || !Array.isArray(form.anatomy.cells) || !form.anatomy.cells.length || !form.brain || !Array.isArray(form.brain.decisions) || !Number.isFinite(form.move_range) || !Number.isFinite(form.mutability)) fail();
    for (const c of form.anatomy.cells) if (!c.state || !['mouth','producer','mover','killer','armor','eye'].includes(c.state.name) || !Number.isInteger(c.loc_col) || !Number.isInteger(c.loc_row) || (c.state.name === 'eye' && ![0,1,2,3].includes(c.direction))) fail();
    if (typeof form.brain.independent_eye_decisions !== 'boolean' || !form.brain.decisions.length) fail();
    const states = form.brain.decisions[0].length;
    if (!states) fail();
    for (const eye of form.brain.decisions) {
        if (!Array.isArray(eye) || eye.length !== states) fail();
        for (const map of eye) for (const type of ['empty','food','wall','mouth','producer','mover','killer','armor','eye']) {
            const choice = map && map[type];
            if (!choice || !Number.isInteger(choice.decision) || choice.decision < 0 || choice.decision > 7 || !Number.isInteger(choice.state) || choice.state < 0 || choice.state >= states) fail();
        }
    }
}

module.exports = {copy, canonical, capture, exportOrganism, compare, bodyKey, brainChanges, validate};
// TADIWA EDIT END: immutable inherited forms and editor-compatible exports
