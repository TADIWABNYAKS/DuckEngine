// TADIWA EDIT START: preview archived cells without constructing organisms or consuming RNG
const CellStates = require('../Organism/Cell/CellStates');
function thumbnail(form, size = 84) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    canvas.className = 'lineage-preview';
    canvas.setAttribute('aria-label', 'Archived organism body; eye arrows show inherited direction');
    const ctx = canvas.getContext('2d');
    const cells = form.anatomy.cells;
    let minC = 0, maxC = 0, minR = 0, maxR = 0;
    for (const c of cells) { minC = Math.min(minC, c.loc_col); maxC = Math.max(maxC, c.loc_col); minR = Math.min(minR, c.loc_row); maxR = Math.max(maxR, c.loc_row); }
    const step = Math.min(22, (size - 12) / Math.max(maxC - minC + 1, maxR - minR + 1));
    const x = (size - (maxC - minC + 1) * step) / 2;
    const y = (size - (maxR - minR + 1) * step) / 2;
    for (const c of cells) {
        const cx = x + (c.loc_col - minC) * step, cy = y + (c.loc_row - minR) * step;
        const colors = {mouth:'#DEB14D', producer:'#15DE59', mover:'#60D4FF', killer:'#F82380', armor:'#7230DB', eye:'#B6C1EA'};
        ctx.fillStyle = CellStates[c.state.name].color || colors[c.state.name];
        ctx.fillRect(cx, cy, Math.max(1, step - 1), Math.max(1, step - 1));
        if (c.state.name === 'eye') {
            const [dc, dr] = [[0,-1],[1,0],[0,1],[-1,0]][c.direction];
            ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(1, step / 10);
            ctx.beginPath(); ctx.moveTo(cx + step / 2, cy + step / 2);
            ctx.lineTo(cx + step / 2 + dc * step / 2.5, cy + step / 2 + dr * step / 2.5); ctx.stroke();
        }
    }
    return canvas;
}
module.exports = thumbnail;
// TADIWA EDIT END: preview archived cells without constructing organisms or consuming RNG
