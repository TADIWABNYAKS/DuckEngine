// TADIWA EDIT START: full ancestry navigation, comparisons, history and downloads
const Snapshot = require('../Stats/LineageSnapshot');
const thumbnail = require('../Rendering/LineageThumbnail');
const Modes = require('./ControlModes');
function el(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
}
function button(text, action) {
    const b = el('button', text); b.type = 'button'; b.onclick = action; return b;
}
function download(value, name) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value)], {type:'application/json'}));
    const a = el('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
class LineagePanel {
    constructor(engine) {
        this.engine = engine; this.env = engine.env;
        this.expanded = new Set(); this.pages = new Map(); this.selected = null; this.focus = null;
        this.thumbnails = new Map(); this.open = false;
        this.launch = button('Lineage', () => this.show()); this.launch.id = 'lineage-open';
        document.body.append(this.launch);
        this.panel = el('section', undefined, 'lineage-panel');
        this.panel.id = 'lineage-panel'; this.panel.hidden = true; this.panel.setAttribute('aria-label', 'Lineage tracker');
        const header = el('header'); header.append(el('h2', 'Recorded ancestry'), button('Close lineage', () => this.hide()));
        const help = el('p', 'Select a living creature in the world, then track its descendants. Earlier relatives are unknown. Manual clones are excluded. Root preview is its form at tracking; offspring previews are their birth forms.');
        const actions = el('div', undefined, 'lineage-actions');
        actions.append(button('Select creature', () => { this.hide(); this.engine.controlpanel.setMode(Modes.Select); }),
            button('Track descendants', () => this.track()),
            button('Stop recording', () => { this.env.lineage.stop(); this.render(true); }),
            button('Download lineage archive', () => download(this.env.lineage.serialize(), 'lineage-archive.json')),
            button('Clear archive', () => { if (this.discardConfirmed()) { this.env.lineage.clear(); this.render(true); } }));
        this.message = el('p', '', 'lineage-message'); this.message.setAttribute('role', 'status');
        this.summary = el('p');
        this.history = el('canvas'); this.history.width = 820; this.history.height = 120;
        this.history.setAttribute('aria-label', 'Living family population over recorded ticks');
        this.historyCaption = el('p', '', 'lineage-history-caption');
        const navigation = el('div', undefined, 'lineage-actions');
        this.lookup = el('input'); this.lookup.type = 'number'; this.lookup.min = 1; this.lookup.placeholder = 'Individual ID'; this.lookup.setAttribute('aria-label', 'Individual ID');
        const find = () => { const id = Number(this.lookup.value); if (this.env.lineage.byId.has(id)) this.navigate(id); else this.message.textContent = 'No recorded individual with that ID.'; };
        this.lookup.onkeydown = e => { if (e.key === 'Enter') find(); e.stopPropagation(); };
        navigation.append(button('Root', () => this.navigate(this.env.lineage.rootId)), button('Parent branch', () => {
            const n = this.env.lineage.byId.get(this.focus); if (n && n.parentId) this.navigate(n.parentId);
        }), this.lookup, button('Find individual', find), button('Collapse branches', () => { this.expanded.clear(); this.render(true); }));
        this.tree = el('div', undefined, 'lineage-tree'); this.tree.setAttribute('aria-label', 'Parent and child ancestry tree');
        this.inspector = el('aside', undefined, 'lineage-inspector'); this.inspector.setAttribute('aria-label', 'Selected ancestor');
        const body = el('div', undefined, 'lineage-body'); body.append(this.tree, this.inspector);
        this.panel.append(header, help, actions, this.message, this.summary, this.history, this.historyCaption, navigation, body);
        // Prevent existing simulation hotkeys from interpreting text entry in this panel.
        this.panel.addEventListener('keydown', e => e.stopPropagation());
        document.body.append(this.panel);
        const track = button('Track descendants', () => this.track()); track.id = 'track-descendants';
        document.querySelector('.editor-buttons').append(track);
    }
    discardConfirmed() {
        return !this.env.lineage.nodes.length || confirm('This discards the current lineage archive. Cancel and use Download lineage archive to preserve it first. Continue?');
    }
    track() {
        const org = this.env.lineage_selection;
        this.show();
        if (!org || !org.living || !this.env.organisms.includes(org)) {
            this.message.textContent = 'Select a living creature in the current world first. A dead or previously loaded selection cannot be tracked.'; return;
        }
        if (!this.discardConfirmed()) return;
        try { this.env.lineage.start(org); this.message.textContent = 'Recording this individual and future biological descendants.'; this.render(true); }
        catch (e) { this.message.textContent = e.message; }
    }
    show() {
        this.open = true; this.panel.hidden = false; this.render(true);
        if (!this.timer) this.timer = setInterval(() => this.render(), 1000);
    }
    hide() { this.open = false; this.panel.hidden = true; clearInterval(this.timer); this.timer = null; }
    navigate(id) {
        if (!this.env.lineage.byId.has(id)) return;
        this.focus = this.selected = id; this.expanded.add(id); this.render(true);
    }
    preview(genomeId, size = 84) {
        const key = genomeId + ':' + size;
        if (!this.thumbnails.has(key)) {
            if (this.thumbnails.size >= 256) this.thumbnails.delete(this.thumbnails.keys().next().value);
            this.thumbnails.set(key, thumbnail(this.env.lineage.genomes[genomeId], size));
        }
        const original = this.thumbnails.get(key), canvas = original.cloneNode();
        canvas.getContext('2d').drawImage(original, 0, 0); return canvas;
    }
    status(node) {
        if (node.deathTick !== null) return `Dead at tick ${node.deathTick} (${node.deathReason})`;
        return this.env.lineage.active ? 'Living' : `Last seen alive at tick ${this.env.lineage.endedAtTick}; current status unknown`;
    }
    render(force = false) {
        if (!this.open) return;
        const t = this.env.lineage;
        if (this.archive !== t.nodes) {
            this.archive = t.nodes; this.selected = this.focus = t.rootId; this.expanded.clear(); this.pages.clear(); this.thumbnails.clear(); this.inspectedKey = null;
            if (t.rootId) this.expanded.add(t.rootId);
            force = true;
        }
        if (!force && this.revision === t.revision) return;
        this.revision = t.revision;
        const root = t.byId.get(t.rootId);
        this.summary.textContent = t.nodes.length ? `${t.active ? 'Recording' : 'Recording ended'} · ${t.living} ${t.active ? 'living' : 'last observed living'} family members · ${t.living - (root.deathTick === null ? 1 : 0)} descendants excluding root · ${t.nodes.length - 1} births · Peak ${t.peak} at tick ${t.peakTick} · ${t.extinctionTick === null ? 'No recorded extinction' : 'Family reached zero at tick ' + t.extinctionTick} · ${t.genomes.length} inherited forms${t.endReason ? ' · ' + t.endReason : ''}${t.interventions.length ? ' · Interventions: ' + t.interventions.map(i => i.reason + ' at ' + i.tick).join('; ') : ''}` : 'No family recorded yet.';
        if (t.error) this.message.textContent = t.error;
        this.drawHistory(); this.drawTree(); this.inspect();
    }
    drawTree() {
        this.tree.replaceChildren(); const t = this.env.lineage;
        if (!t.byId.has(this.focus)) return;
        let budget = 120;
        const draw = (id, depth) => {
            if (budget-- <= 0) return el('p', 'View this branch to see more descendants.');
            const node = t.byId.get(id), children = t.children.get(id), container = el('div', undefined, 'lineage-branch');
            const card = el('div', undefined, 'lineage-card' + (id === this.selected ? ' lineage-selected' : ''));
            const details = el('div');
            const select = button(`#${id} · generation ${node.generation}`, () => { this.selected = id; this.render(true); });
            select.setAttribute('aria-pressed', String(id === this.selected));
            const parent = node.parentId === null ? 'Root · earlier parent unknown' : `Parent #${node.parentId}`;
            details.append(select, el('p', parent), el('p', node.birthTick === null ? 'Tracked at tick ' + node.recordedAtTick : 'Born at tick ' + node.birthTick), el('p', this.status(node)));
            const p = t.byId.get(node.parentId), form = t.genomes[node.genomeId];
            if (p) { const changes = Snapshot.compare(t.genomes[p.genomeId], form); details.append(el('p', changes.body[0] + ' · ' + changes.brain[0])); }
            card.append(this.preview(node.genomeId), details); container.append(card);
            if (children.length) {
                const expanded = this.expanded.has(id);
                container.append(button(`${expanded ? 'Collapse' : 'Expand'} ${children.length} children of #${id}`, () => { if (expanded) this.expanded.delete(id); else this.expanded.add(id); this.render(true); }), button('View branch #' + id, () => this.navigate(id)));
                if (expanded && depth < 3) {
                    const offset = this.pages.get(id) || 0;
                    const branch = el('div', undefined, 'lineage-children');
                    for (const child of children.slice(offset, offset + 20)) {
                        if (budget <= 0) break;
                        branch.append(draw(child, depth + 1));
                    }
                    container.append(branch);
                    if (offset > 0) container.append(button('Previous children of #' + id, () => { this.pages.set(id, Math.max(0, offset - 20)); this.render(true); }));
                    if (offset + 20 < children.length) container.append(button('Next children of #' + id, () => { this.pages.set(id, offset + 20); this.render(true); }));
                    container.append(el('small', `Children ${offset + 1}–${Math.min(offset + 20, children.length)} of ${children.length}. All records remain in the archive.`));
                } else if (expanded) container.append(el('p', 'Open this branch to continue to deeper generations.'));
            }
            return container;
        };
        this.tree.append(draw(this.focus, 0));
        if (budget <= 0) this.tree.append(el('p', 'Visible tree limited to 120 individuals. Collapse branches or use View branch / ID lookup to reach every record.'));
    }
    inspect() {
        const t = this.env.lineage, n = t.byId.get(this.selected);
        const key = n ? `${t.session}:${n.id}:${n.deathTick}:${t.active}:${t.endedAtTick}` : 'empty';
        if (this.inspectedKey === key) return;
        this.inspectedKey = key;
        this.inspector.replaceChildren(); if (!n) return;
        const form = t.genomes[n.genomeId], parent = t.byId.get(n.parentId), pform = parent && t.genomes[parent.genomeId];
        this.inspector.append(el('h3', 'Individual #' + n.id), el('p', n.species), el('p', this.status(n)), el('p', n.birthTick === null ? 'Root tracked at tick ' + n.recordedAtTick + '; actual birth unknown.' : 'Born at tick ' + n.birthTick), this.preview(n.genomeId, 140));
        this.inspector.append(button('Download organism #' + n.id, () => download(t.exportNode(n.id), 'ancestor-' + n.id + '.json')),
            button('Open birth form in editor', () => { this.engine.organism_editor.controller.loadOrg(t.exportNode(n.id)); this.hide(); $('#maximize').click(); $('.tabnav #editor').click(); }),
            button('View descendants of #' + n.id, () => this.navigate(n.id)));
        if (parent) this.inspector.append(button('Inspect parent #' + parent.id, () => { this.selected = parent.id; this.render(true); }), el('h4', 'Parent #' + parent.id), this.preview(parent.genomeId, 140));
        this.inspector.append(el('p', `Movement range: ${pform ? pform.move_range + ' → ' : ''}${form.move_range} · Mutability: ${pform ? pform.mutability + ' → ' : ''}${form.mutability}`));
        const changes = Snapshot.compare(pform, form);
        for (const [title, values] of [['Body comparison', changes.body], ['Brain comparison', changes.brain]]) {
            this.inspector.append(el('h4', title)); const list = el('ul'); values.forEach(v => list.append(el('li', v))); this.inspector.append(list);
        }
        const maps = el('details'); maps.append(el('summary', 'Complete inherited brain and ordered body data'));
        if (pform) maps.append(el('h4', 'Parent'), el('pre', JSON.stringify(pform, null, 2)));
        maps.append(el('h4', 'Selected'), el('pre', JSON.stringify(form, null, 2))); this.inspector.append(maps);
    }
    drawHistory() {
        const t = this.env.lineage, data = t.history, ctx = this.history.getContext('2d');
        ctx.clearRect(0, 0, 820, 120);
        if (!data.length) { this.historyCaption.textContent = 'Population history is sampled every 100 completed ticks.'; return; }
        const first = data[0].tick, last = data[data.length - 1].tick, max = Math.max(1, t.peak);
        ctx.strokeStyle = '#5cdebb'; ctx.beginPath();
        // Each horizontal bin retains its min/max; full history stays in the archive.
        const bins = new Map();
        for (const d of data) {
            const x = Math.round(35 + 760 * (d.tick - first) / Math.max(1, last - first));
            const b = bins.get(x) || [d.living, d.living]; b[0] = Math.min(b[0], d.living); b[1] = Math.max(b[1], d.living); bins.set(x, b);
        }
        for (const [x, [low, high]] of bins) { ctx.lineTo(x, 95 - high / max * 80); ctx.lineTo(x, 95 - low / max * 80); }
        ctx.stroke(); ctx.fillStyle = '#e5edf2'; ctx.font = '12px sans-serif'; ctx.fillText(String(max), 2, 16); ctx.fillText('0', 15, 98); ctx.fillText(String(first), 35, 115); ctx.fillText(String(last), 760, 115);
        this.historyCaption.textContent = `Living family · ticks ${first}–${last} · ${data.length} preserved samples (100-tick cadence plus start/end events). Event peak: ${t.peak} at tick ${t.peakTick}.`;
    }
}
module.exports = LineagePanel;
// TADIWA EDIT END: full ancestry navigation, comparisons, history and downloads
