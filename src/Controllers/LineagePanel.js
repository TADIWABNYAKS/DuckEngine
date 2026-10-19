// TADIWA EDIT START: full ancestry navigation, comparisons, history and downloads
const Snapshot = require('../Stats/LineageSnapshot');
const thumbnail = require('../Rendering/LineageThumbnail');
const Insights = require('./LineageInsights');
const EnvironmentChart = require('./LineageEnvironmentChart');
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
        const header = el('header'); header.append(el('h2', 'Species mutation tree'), button('Close lineage', () => this.hide()));
        const help = el('p', "Select a living creature, then use the editor's Track species icon. Branches show body changes.");
        const actions = el('div', undefined, 'lineage-actions');
        actions.append(button('Stop recording', () => { this.env.lineage.stop(); this.render(true); }),
            button('Download lineage archive', () => download(this.env.lineage.serialize(), 'lineage-archive.json')),
            button('Clear archive', () => { if (this.discardConfirmed()) { this.env.lineage.clear(); this.render(true); } }));
        this.message = el('p', '', 'lineage-message'); this.message.setAttribute('role', 'status');
        this.summary = el('p');
        this.history = el('canvas'); this.history.width = 820; this.history.height = 120;
        this.history.setAttribute('aria-label', 'Whole lineage and selected form population over recorded ticks');
        this.historyCaption = el('p', '', 'lineage-history-caption');
        this.insights = new Insights(this, download);
        this.environmentChart = new EnvironmentChart(this);
        const navigation = el('div', undefined, 'lineage-actions');
        this.lookup = el('input'); this.lookup.type = 'text'; this.lookup.placeholder = 'Form ID or species name'; this.lookup.setAttribute('aria-label', 'Form ID or species name');
        this.searchMatches = el('select'); this.searchMatches.hidden = true; this.searchMatches.setAttribute('aria-label', 'Matching forms');
        this.searchMatches.onchange = () => this.navigate(Number(this.searchMatches.value));
        const find = () => {
            const query = this.lookup.value.trim().toLowerCase(), t = this.env.lineage;
            this.searchMatches.hidden = true; this.searchMatches.replaceChildren();
            if (!query) { this.message.textContent = 'Enter a form ID or species name.'; return; }
            const id = /^#?\d+$/.test(query) ? Number(query.replace('#','')) : null;
            let matches = id !== null && t.byId.has(id) ? [t.byId.get(id)] : t.nodes.filter(n => n.species.toLowerCase() === query);
            if (!matches.length) matches = t.nodes.filter(n => n.species.toLowerCase().includes(query));
            if (!matches.length) { this.message.textContent = 'No matching recorded form.'; return; }
            this.navigate(matches[0].id);
            if (matches.length > 1) {
                for (const n of matches) { const option = el('option', `Form #${n.id} · ${n.species}`); option.value = n.id; this.searchMatches.append(option); }
                this.searchMatches.hidden = false;
            }
            this.message.textContent = matches.length > 1 ? `${matches.length} matching forms.` : `Form #${matches[0].id} · ${matches[0].species}`;
        };
        this.lookup.onkeydown = e => { if (e.key === 'Enter') find(); e.stopPropagation(); };
        navigation.append(button('Root', () => this.navigate(this.env.lineage.rootId)), button('Parent branch', () => {
            const n = this.env.lineage.byId.get(this.focus); if (n && n.parentId) this.navigate(n.parentId);
        }), this.lookup, button('Find form', find), this.searchMatches, button('Collapse branches', () => { this.expanded.clear(); this.render(true); }));
        this.tree = el('div', undefined, 'lineage-tree'); this.tree.setAttribute('aria-label', 'Visible body mutation tree');
        this.inspector = el('aside', undefined, 'lineage-inspector'); this.inspector.setAttribute('aria-label', 'Selected body form');
        const body = el('div', undefined, 'lineage-body'); body.append(this.tree, this.inspector);
        this.panel.append(header, help, actions, this.message, this.summary, this.insights.rates, this.insights.chartControls, this.history, this.historyCaption, this.environmentChart.element, this.insights.events, navigation, body);
        // Keep typing in the tracker from triggering simulation shortcuts.
        this.panel.addEventListener('keydown', e => e.stopPropagation());
        document.body.append(this.panel);
        const track = button(undefined, () => this.track()); track.id = 'track-descendants';
        track.title = 'Track species'; track.setAttribute('aria-label', 'Track species');
        const trackIcon = el('i', undefined, 'fa-solid fa-sitemap');
        trackIcon.setAttribute('aria-hidden', 'true'); track.append(trackIcon);
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
        try { this.env.lineage.start(org); this.render(true); this.message.textContent = 'Recording all current members of this species and their future mutated forms.'; }
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
        if (!node.population) {
            const cause = node.extinctionReason === 'age-limit' ? 'age' : node.extinctionReason === 'lethal-damage' ? 'lethal damage' : null;
            return `Form extinct at tick ${node.extinctionTick}${cause ? ' (' + cause + ')' : ''}`;
        }
        return `${node.population} ${this.env.lineage.active ? 'living' : 'last observed living'} · Peak ${node.peak} · ${node.totalBirths} births`;
    }
    render(force = false) {
        if (!this.open) return;
        const t = this.env.lineage;
        if (this.archive !== t.nodes) {
            this.message.textContent = ''; this.lookup.value = ''; this.searchMatches.hidden = true; this.searchMatches.replaceChildren();
            this.archive = t.nodes; this.selected = this.focus = t.rootId; this.expanded.clear(); this.pages.clear(); this.thumbnails.clear(); this.inspectedKey = null; this.treeKey = null;
            if (t.rootId) this.expanded.add(t.rootId);
            force = true;
        }
        if (!force && this.revision === t.revision) return;
        this.revision = t.revision;
        const legacy=t.scope==='legacy-subset';
        this.summary.textContent = t.nodes.length ? `${t.active ? 'Recording' : 'Recording ended'} · ${t.initialPopulation} starting member${t.initialPopulation===1?'':'s'} · ${t.living} ${t.active ? 'living' : 'last observed living'} across ${legacy ? 'the legacy subset' : 'the entire line'} · ${t.pollen.pending} ${t.active ? 'pending pollen' : 'last observed pollen'} · ${t.totalBirths} births · ${t.nodes.length} visible forms · Peak ${t.peak} at tick ${t.peakTick} · ${t.extinctionTick === null ? (legacy ? 'Subset extinction not observed' : (!t.living&&t.pollen.pending ? 'No living members; pollen remains' : 'Whole-line extinction not observed')) : (legacy ? 'Legacy subset extinct at tick ' : 'ENTIRE LINE EXTINCT at tick ') + t.extinctionTick}${t.complete ? '' : ' · INCOMPLETE RECORDING'}${t.endReason ? ' · ' + t.endReason : ''}${t.interventions.length ? ' · Interventions: ' + t.interventions.map(i => i.reason + ' at ' + i.tick).join('; ') : ''}` : 'No species recorded yet.';
        if (t.migrationMessage) this.message.textContent = t.migrationMessage;
        if (t.error) this.message.textContent = t.error;
        this.insights.update(); this.drawHistory(); this.environmentChart.draw(this.chartRange); this.drawTree(); this.inspect();
    }
    drawTree() {
        const t = this.env.lineage;
        const key = JSON.stringify([t.nodes.length,this.focus,[...this.expanded],[...this.pages]]);
        if (this.treeKey === key) {
            for (const [id, refs] of this.treeRefs) {
                refs.status.textContent = this.status(t.byId.get(id));
                refs.card.classList.toggle('lineage-selected', id === this.selected);
                refs.select.setAttribute('aria-pressed', String(id === this.selected));
            }
            return;
        }
        this.treeKey = key; this.treeRefs = new Map(); this.tree.replaceChildren();
        if (!t.byId.has(this.focus)) return;
        let budget = 120;
        const draw = (id, depth) => {
            if (budget-- <= 0) return el('p', 'View this branch to see more descendants.');
            const node = t.byId.get(id), children = t.children.get(id), container = el('div', undefined, 'lineage-branch');
            const card = el('div', undefined, 'lineage-card' + (id === this.selected ? ' lineage-selected' : ''));
            const details = el('div');
            const select = button(`#${id} · mutation depth ${node.mutationDepth}`, () => { this.selected = id; this.render(true); });
            select.setAttribute('aria-pressed', String(id === this.selected));
            const parent = node.parentId === null ? 'Root · earlier parent unknown' : `Parent #${node.parentId}`;
            const status = el('p', this.status(node));
            this.treeRefs.set(id, {card, select, status});
            details.append(select, el('p', parent), el('p', 'First observed at tick ' + node.firstSeenTick), status);
            const p = t.byId.get(node.parentId), form = t.genomes[node.genomeId];
            if (p) { const changes = Snapshot.compare(t.genomes[p.genomeId], form); details.append(el('p', changes.body[0] + ' · ' + changes.brain[0])); }
            card.append(this.preview(node.genomeId), details); container.append(card);
            if (children.length) {
                const expanded = this.expanded.has(id);
                container.append(button(`${expanded ? 'Collapse' : 'Expand'} ${children.length} mutated forms from #${id}`, () => { if (expanded) this.expanded.delete(id); else this.expanded.add(id); this.render(true); }), button('View branch #' + id, () => this.navigate(id)));
                if (expanded && depth < 3) {
                    const offset = this.pages.get(id) || 0;
                    const branch = el('div', undefined, 'lineage-children');
                    for (const child of children.slice(offset, offset + 20)) {
                        if (budget <= 0) break;
                        branch.append(draw(child, depth + 1));
                    }
                    container.append(branch);
                    if (offset > 0) container.append(button('Previous mutated forms from #' + id, () => { this.pages.set(id, Math.max(0, offset - 20)); this.render(true); }));
                    if (offset + 20 < children.length) container.append(button('Next mutated forms from #' + id, () => { this.pages.set(id, offset + 20); this.render(true); }));
                    container.append(el('small', `Forms ${offset + 1}–${Math.min(offset + 20, children.length)} of ${children.length}. All records remain in the archive.`));
                } else if (expanded) container.append(el('p', 'Open this branch to continue to deeper mutation depths.'));
            }
            return container;
        };
        this.tree.append(draw(this.focus, 0));
        if (budget <= 0) this.tree.append(el('p', 'Visible tree limited to 120 forms. Collapse branches or use View branch / ID lookup to reach every record.'));
    }
    inspect() {
        const t = this.env.lineage, n = t.byId.get(this.selected);
        const key = n ? `${t.session}:${n.id}` : 'empty';
        if (this.inspectedKey === key) { if (n) { this.inspectorStatus.textContent = this.status(n); this.insights.renderForm(n); } return; }
        this.inspectedKey = key;
        const mapsOpen = this.inspector.querySelector('details')?.open;
        this.inspector.replaceChildren(); if (!n) return;
        const form = t.genomes[n.genomeId], parent = t.byId.get(n.parentId), pform = parent && t.genomes[parent.genomeId];
        this.inspectorStatus = el('p', this.status(n));
        this.inspector.append(el('h3', 'Form #' + n.id), el('p', n.species), this.inspectorStatus, el('p', 'First observed at tick ' + n.firstSeenTick + ' · Mutation depth ' + n.mutationDepth), this.preview(n.genomeId, 140));
        this.inspector.append(button('Download form #' + n.id, () => download(t.exportNode(n.id), 'form-' + n.id + '.json')),
            button('Open representative in editor', () => { this.engine.organism_editor.controller.loadOrg(t.exportNode(n.id)); this.hide(); $('#maximize').click(); $('.tabnav #editor').click(); }),
            button('View mutated forms from #' + n.id, () => this.navigate(n.id)));
        if (parent) this.inspector.append(button('Inspect parent form #' + parent.id, () => { this.selected = parent.id; this.render(true); }), el('h4', 'Parent form #' + parent.id), this.preview(parent.genomeId, 140));
        this.inspector.append(el('p', `Movement range: ${pform ? pform.move_range + ' → ' : ''}${form.move_range} · Mutability: ${pform ? pform.mutability + ' → ' : ''}${form.mutability}`));
        const changes = Snapshot.compare(pform, form);
        for (const [title, values] of [['Body comparison', changes.body], ['Brain comparison', changes.brain]]) {
            this.inspector.append(el('h4', title)); const list = el('ul'); values.forEach(v => list.append(el('li', v))); this.inspector.append(list);
        }
        const maps = el('details'); maps.open = !!mapsOpen; maps.append(el('summary', 'Representative brain and ordered body data'));
        if (pform) maps.append(el('h4', 'Parent'), el('pre', JSON.stringify(pform, null, 2)));
        maps.append(el('h4', 'Selected'), el('pre', JSON.stringify(form, null, 2))); this.inspector.append(maps); this.insights.renderForm(n);
    }
    drawHistory() {
        if (this.insights.mode.value === 'rates') { this.insights.drawRates(); return; }
        const t = this.env.lineage, data = t.history, ctx = this.history.getContext('2d');
        ctx.clearRect(0, 0, 820, 120);
        if (!data.length) { this.chartRange = null; this.historyCaption.textContent = 'Population history is sampled every 100 completed ticks.'; return; }
        const first = data[0].tick, last = Math.max(data[data.length - 1].tick, t.research.events.at(-1)?.tick || 0), max = Math.max(1, t.peak);
        this.chartRange = {first, last};
        ctx.strokeStyle = '#246c52'; ctx.beginPath();
        // Keep the lowest and highest population per pixel so short spikes stay visible.
        const bins = new Map();
        for (const d of data) {
            const x = Math.round(35 + 760 * (d.tick - first) / Math.max(1, last - first));
            const b = bins.get(x) || [d.living, d.living]; b[0] = Math.min(b[0], d.living); b[1] = Math.max(b[1], d.living); bins.set(x, b);
        }
        for (const [x, [low, high]] of bins) { ctx.lineTo(x, 95 - high / max * 80); ctx.lineTo(x, 95 - low / max * 80); }
        ctx.stroke();
        const selected = t.byId.get(this.selected);
        if (selected) {
            ctx.strokeStyle = '#7230DB'; ctx.beginPath();
            const points = selected.history;
            // Use the same per-pixel range for the selected form.
            const formBins = new Map();
            for (const d of points) {
                const x = Math.round(35 + 760 * (d.tick-first)/Math.max(1,last-first));
                const range = formBins.get(x)||[d.living,d.living];
                range[0]=Math.min(range[0],d.living);range[1]=Math.max(range[1],d.living);formBins.set(x,range);
            }
            for (const [x,[low,high]] of formBins) {ctx.lineTo(x,95-high/max*80);ctx.lineTo(x,95-low/max*80);}
            ctx.stroke();
        }
        this.insights.drawMarkers(ctx, first, last);
        ctx.fillStyle = '#18202b'; ctx.font = '12px sans-serif'; ctx.fillText(String(max), 2, 16); ctx.fillText('0', 15, 98); ctx.fillText(String(first), 35, 115); ctx.fillText(String(last), 760, 115);
        this.historyCaption.textContent = `Whole lineage (green), selected form (purple) · ticks ${first}–${last} · ${data.length} preserved samples (100-tick cadence plus start/end events). Event peak: ${t.peak} at tick ${t.peakTick}. Click a marker to locate its event.`;
    }
}
module.exports = LineagePanel;
// TADIWA EDIT END: full ancestry navigation, comparisons, history and downloads
