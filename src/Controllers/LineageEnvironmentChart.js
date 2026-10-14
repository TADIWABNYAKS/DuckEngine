// TADIWA EDIT START: food and plant histories sharing the lineage time axis
function el(tag,text,cls) { const n=document.createElement(tag); if(text!==undefined)n.textContent=text; if(cls)n.className=cls; return n; }
class LineageEnvironmentChart {
    constructor(panel) {
        this.panel=panel; this.element=el('details',undefined,'lineage-environment'); this.element.open=true;
        this.summary=el('summary','Environment');
        const controls=el('div',undefined,'lineage-actions'); const label=el('label','Plants ');
        this.plants=el('select'); this.plants.setAttribute('aria-label','Plant population');
        this.plants.onchange=()=>panel.render(true); label.append(this.plants); controls.append(label);
        this.canvas=el('canvas'); this.canvas.width=820; this.canvas.height=160;
        this.canvas.setAttribute('aria-label','World food and plant population history');
        this.caption=el('p','', 'lineage-history-caption');
        this.element.append(this.summary,controls,this.canvas,this.caption);
    }
    draw(range) {
        const t=this.panel.env.lineage, env=t.research.environment, data=env.history;
        this.element.hidden=!t.nodes.length;
        if(this.archive!==env) { this.archive=env; this.speciesCount=-1; this.plants.replaceChildren(); const all=el('option','All plants');all.value='all';this.plants.append(all); }
        if(this.speciesCount!==env.species.length) {
            for(const species of env.species.slice(Math.max(0,this.speciesCount))) { const option=el('option',species.name);option.value=species.id;this.plants.append(option); }
            this.speciesCount=env.species.length;
        }
        const ctx=this.canvas.getContext('2d');ctx.clearRect(0,0,820,160);
        if(!data.length) { this.summary.textContent='Environment'; this.caption.textContent='No environment history recorded.'; return; }
        const latest=data[data.length-1];
        this.summary.textContent=`Environment · Food ${latest.food} · Plants ${latest.plants} · tick ${latest.tick}`;
        const first=range?range.first:data[0].tick, last=range?range.last:latest.tick;
        const selected=this.plants.value==='all'?null:Number(this.plants.value);
        for(const [key,label,color,top] of [['food','Food tiles','#905000',18],['plants','Plant organisms','#246c52',87]]) {
            const value=p=>key==='plants' && selected!==null?(p.bySpecies.find(([id])=>id===selected)?.[1]||0):p[key];
            let max=1; for(const point of data)max=Math.max(max,value(point));
            const bins=new Map();
            for(const point of data) {
                const x=Math.round(35+760*(point.tick-first)/Math.max(1,last-first));
                if(x<35||x>795)continue;
                const v=value(point),b=bins.get(x)||[v,v];b[0]=Math.min(b[0],v);b[1]=Math.max(b[1],v);bins.set(x,b);
            }
            ctx.strokeStyle=color;ctx.beginPath();
            for(const [x,[low,high]] of bins) {ctx.lineTo(x,top+42-high/max*40);ctx.lineTo(x,top+42-low/max*40);}ctx.stroke();
            if(bins.size===1) {const [x,[,high]]=[...bins][0];ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,top+42-high/max*40,2,0,Math.PI*2);ctx.fill();}
            ctx.fillStyle='#18202b';ctx.font='12px Arial';ctx.fillText(label,35,top-5);ctx.fillText(String(max),2,top+8);ctx.fillText('0',15,top+43);
        }
        ctx.fillText(String(first),35,153);ctx.fillText(String(last),755,153);
        this.caption.textContent=`Plants: producers without movers · 100-tick samples · recorded from tick ${env.fromTick}`;
    }
}
module.exports=LineageEnvironmentChart;
// TADIWA EDIT END: food and plant histories sharing the lineage time axis
