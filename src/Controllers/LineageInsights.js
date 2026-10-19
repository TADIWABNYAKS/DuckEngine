// TADIWA EDIT START: rates, event navigation and active brain version inspector
const S=require('../Stats/LineageSnapshot');
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function button(text,fn){const b=el('button',text);b.type='button';b.onclick=fn;return b;}
const colors={start:'#416788','body-mutation':'#7230DB','brain-version':'#355a93','brain-change':'#355a93','form-extinction':'#a22656','line-extinction':'#a22656','form-revival':'#246c52',intervention:'#905000',settings:'#905000',stop:'#596077',upgrade:'#596077',season:'#905000','line-dormant':'#905000','line-revival':'#246c52'};
class LineageInsights {
    constructor(panel,download){
        this.panel=panel;this.download=download;this.page=0;this.brainPage=0;this.brainId=null;this.markers=[];
        this.rates=el('div',undefined,'lineage-metrics');this.rates.setAttribute('aria-label','Birth and death rates');
        this.wholeRate=el('p');this.selectedRate=el('p');this.wholeCauses=el('p');this.rates.append(this.wholeRate,this.selectedRate,this.wholeCauses);
        this.chartControls=el('div',undefined,'lineage-actions');
        this.mode=el('select');this.mode.setAttribute('aria-label','Lineage chart');
        for(const [value,text] of [['population','Population'],['rates','Birth / death rates']]){const o=el('option',text);o.value=value;this.mode.append(o);}
        this.scope=el('select');this.scope.setAttribute('aria-label','Rate population');
        for(const [value,text] of [['whole','Whole line rates'],['form','Selected form rates']]){const o=el('option',text);o.value=value;this.scope.append(o);}
        this.scope.onchange=()=>panel.render(true);
        this.filter=el('select');this.filter.setAttribute('aria-label','Event filter');
        for(const [value,text] of [['all','All events'],['body','Body mutations'],['brain','Brain versions / changes'],['extinction','Extinctions'],['season','Season changes'],['intervention','Settings / interventions']]){const o=el('option',text);o.value=value;this.filter.append(o);}
        this.mode.onchange=()=>panel.render(true);this.filter.onchange=()=>{this.page=0;this.eventKey=null;panel.render(true);};
        this.chartControls.append(this.mode,this.scope,this.filter,el('span','Markers: purple body · blue brain · red extinction · amber environment','lineage-legend'));
        this.events=el('details',undefined,'lineage-events');this.eventSummary=el('summary','Events & interventions');this.eventList=el('div');this.eventNav=el('div',undefined,'lineage-actions');
        this.events.append(this.eventSummary,this.eventList,this.eventNav);
        panel.history.onclick=e=>{
            if(!this.markers.length)return;
            const rect=panel.history.getBoundingClientRect(),x=(e.clientX-rect.left)*820/rect.width;
            const marker=this.markers.reduce((best,m)=>Math.abs(m.x-x)<Math.abs(best.x-x)?m:best);
            if(Math.abs(marker.x-x)>12)return;
            this.page=Math.floor(marker.index/20);this.events.open=true;this.eventKey=null;this.renderEvents();
        };
    }
    research(){return this.panel.env.lineage.research;}
    filtered() {
        const research = this.research();
        const filter = this.filter.value;
        const key = research.eventRevision + ':' + research.events.length + ':' + filter;
        if (this.filterArchive === research && this.filterKey === key) return this.filteredEvents;
        this.filterArchive = research;
        this.filterKey = key;
        this.filteredEvents = research.events.filter(event => {
            switch (filter) {
                case 'all': return true;
                case 'body': return event.type === 'body-mutation';
                case 'brain': return event.type.startsWith('brain');
                case 'extinction':
                    return event.type.endsWith('extinction') || ['line-dormant', 'line-revival'].includes(event.type);
                case 'season': return event.type === 'season';
                default: return ['settings', 'intervention', 'stop', 'upgrade'].includes(event.type);
            }
        });
        return this.filteredEvents;
    }
    rateText(id,label){
        const rate=this.research().rates(id);
        if(!rate||!rate.duration)return label+(this.panel.env.lineage.active?': collecting a rate window…':': no rate window recorded.');
        const fmt=x=>Number.isInteger(x)?String(x):x.toFixed(1);
        return `${label}: ${fmt(rate.birthRate)} births / ${fmt(rate.deathRate)} deaths per 100 ticks · ${rate.from}–${rate.to}${rate.duration<100?' (partial window, normalised)':' (last completed window)'}`;
    }
    update(){
        const p=this.panel;
        if(this.archive!==this.research()){this.archive=this.research();this.page=0;this.eventKey=null;this.formKey=null;this.formId=null;this.brainId=null;this.brainPage=0;}
        this.wholeRate.textContent=this.rateText(0,'Whole line');
        const c=this.research().metricMap.get(0)?.causes||{};this.wholeCauses.textContent=`Whole-line recorded deaths: age ${c['age-limit']||0}, lethal damage ${c['lethal-damage']||0}`;
        this.selectedRate.textContent=p.selected?this.rateText(p.selected,'Form #'+p.selected):'Select a form for its rates. Starting members are not births.';
        this.renderEvents();
    }
    renderEvents(){
        const events=this.filtered(),r=this.research();this.page=Math.min(this.page,Math.max(0,Math.ceil(events.length/20)-1));
        const key=`${this.filterKey}:${this.page}`;if(this.eventKey===key)return;this.eventKey=key;
        this.eventSummary.textContent=`Events & interventions (${events.length}) · recording from tick ${r.fromTick===null?'—':r.fromTick}`;
        this.eventList.replaceChildren();this.eventNav.replaceChildren();
        for(const e of events.slice(this.page*20,this.page*20+20)){
            const row=el('div',undefined,'lineage-event');const badge=el('span',e.type.replaceAll('-',' '),'lineage-event-type');badge.style.borderColor=colors[e.type];
            row.append(el('span','Tick '+e.tick),badge,el('span',e.detail+(e.count>1?' × '+e.count:'')));
            if(e.nodeId)row.append(button('Form #'+e.nodeId,()=>{this.panel.navigate(e.nodeId);if(e.variantId){this.brainId=e.variantId;this.formKey=null;this.panel.render(true);}}));
            this.eventList.append(row);
        }
        if(!events.length)this.eventList.append(el('p','No matching events.'));
        this.eventNav.append(button('Previous events',()=>{this.page=Math.max(0,this.page-1);this.eventKey=null;this.renderEvents();}),el('span',`Page ${this.page+1} / ${Math.max(1,Math.ceil(events.length/20))}`),button('Next events',()=>{this.page++;this.eventKey=null;this.renderEvents();}));
    }
    renderForm(node){
        const r=this.research(),host=this.panel.inspector;
        if(!this.formHost||!host.contains(this.formHost)){
            this.formHost=el('section',undefined,'lineage-research-form');this.formHost.append(el('h4','Rates & observed death causes'));this.causes=el('p');this.formHost.append(this.causes);
            this.formHost.append(el('h4','Active brain versions'));this.brainList=el('div');this.brainDetails=el('div');this.formHost.append(this.brainList,this.brainDetails);host.append(this.formHost);this.formKey=null;
        }
        const m=r.metricMap.get(node.id),c=m?m.causes:{};
        this.causes.textContent=`${this.rateText(node.id,'This form')} · Recorded deaths: age ${c['age-limit']||0}, lethal damage ${c['lethal-damage']||0}`;
        const versions=r.formVariants.get(node.id)||[];
        if(this.formId!==node.id){this.formId=node.id;this.brainPage=0;if(!versions.some(v=>v.id===this.brainId))this.brainId=versions[0]?.id||null;}
        const key=`${node.id}:${versions.length}:${this.brainPage}:${this.brainId}`;
        if(this.formKey!==key){
            this.formKey=key;this.brainList.replaceChildren();this.brainDetails.replaceChildren();
            if(!versions.length){this.brainList.append(el('p','No active brain recorded.'));return;}
            this.brainList.append(el('small','Inherited decision maps and eye mapping; momentary brain state is not a mutation. Versions keep their first observed body and settings.'));
            const select=el('select');select.setAttribute('aria-label','Brain version');
            const visible=versions.slice(this.brainPage*20,this.brainPage*20+20);
            if(!visible.some(v=>v.id===this.brainId)&&r.byVariant.has(this.brainId))visible.push(r.byVariant.get(this.brainId));
            for(const v of visible){const o=el('option',`B${v.id} · first tick ${v.firstSeenTick}`);o.value=v.id;select.append(o);}select.value=this.brainId;
            select.onchange=()=>{this.brainId=Number(select.value);this.formKey=null;this.renderForm(node);};this.brainList.append(select);
            if(versions.length>20)this.brainList.append(button('Earlier brains',()=>{this.brainPage=Math.max(0,this.brainPage-1);this.renderForm(node);}),button('Later brains',()=>{this.brainPage=Math.min(Math.ceil(versions.length/20)-1,this.brainPage+1);this.renderForm(node);}));
            const v=r.byVariant.get(this.brainId),parent=r.byVariant.get(v.parentVariantId);this.brainStats=el('p');this.brainDetails.append(this.brainStats);
            this.brainDetails.append(button('Download brain B'+v.id,()=>this.download(r.exportVariant(v.id),'form-'+node.id+'-brain-'+v.id+'.json')),
                button('Open brain version in editor',()=>{this.panel.engine.organism_editor.controller.loadOrg(r.exportVariant(v.id));this.panel.hide();$('#maximize').click();$('.tabnav #editor').click();}));
            this.brainDetails.append(el('p',parent?`First observed from B${parent.id} in form #${parent.nodeId}`:'Baseline version; earlier active-brain history unknown.'));
            if(parent)this.brainDetails.append(button('Inspect source B'+parent.id,()=>{this.brainId=parent.id;this.formKey=null;this.panel.navigate(parent.nodeId);}));
            const list=el('ul');for(const text of S.brainChanges(parent&&parent.snapshot,v.snapshot))list.append(el('li',text));
            const diffs=el('details');diffs.open=true;diffs.append(el('summary','Brain changes'),list);this.brainDetails.append(diffs);
            const raw=el('details');raw.append(el('summary','Complete inherited brain data'),el('pre',JSON.stringify(v.snapshot.brain,null,2)));this.brainDetails.append(raw);
        }
        const v=r.byVariant.get(this.brainId);if(v&&this.brainStats)this.brainStats.textContent=`B${v.id}: ${v.population} ${this.panel.env.lineage.active?'living':'last observed living'} · ${v.births} recorded births · ${v.deaths} recorded deaths`;
    }
    drawMarkers(ctx,first,last){
        this.markers=[];const seen=new Set();const events=this.filtered();
        for(let i=0;i<events.length;i++){
            const e=events[i],x=Math.round(35+760*(e.tick-first)/Math.max(1,last-first));
            if(x<35||x>795||seen.has(x))continue;seen.add(x);this.markers.push({x,index:i});
            ctx.strokeStyle=colors[e.type];ctx.beginPath();ctx.moveTo(x,6);ctx.lineTo(x,16);ctx.stroke();
        }
    }
    drawRates(){
        const p=this.panel,r=this.research(),t=p.env.lineage,ctx=p.history.getContext('2d');ctx.clearRect(0,0,820,120);
        if(r.fromTick===null){p.chartRange=null;p.historyCaption.textContent='Rates begin when tracking starts.';return;}
        const now=t.active?t.tick():t.endedAtTick,first=r.fromTick,last=Math.max(first,now),lastIndex=Math.floor((last-first)/100)-1;
        p.chartRange={first,last};
        const selected=this.scope.value==='form'?p.selected:null;
        const m=r.metricMap.get(selected||0),data=m?m.buckets.filter(b=>b.index<=lastIndex):[];
        const max=Math.max(1,data.reduce((v,b)=>Math.max(v,b.births,b.deaths),0));
        for(const [kind,color] of [['births','#246c52'],['deaths','#a22656']]){
            ctx.strokeStyle=color;ctx.beginPath();
            // Sparse buckets: gaps mean zero, not a continuation of the previous rate.
            const bins=new Map();let previous=-1;
            const add=(index,value)=>{const x=Math.round(35+760*((index+1)*100)/Math.max(1,last-first));const b=bins.get(x)||[value,value];b[0]=Math.min(b[0],value);b[1]=Math.max(b[1],value);bins.set(x,b);};
            for(const b of data){if(b.index>previous+1){add(previous+1,0);add(b.index-1,0);}add(b.index,b[kind]);previous=b.index;}
            if(lastIndex>previous){add(previous+1,0);add(lastIndex,0);}
            for(const [x,[low,high]] of bins){ctx.lineTo(x,95-high/max*75);ctx.lineTo(x,95-low/max*75);}ctx.stroke();
        }
        this.drawMarkers(ctx,first,last);ctx.fillStyle='#18202b';ctx.font='12px Arial';ctx.fillText(String(max),2,25);ctx.fillText('0',15,98);ctx.fillText(String(first),35,115);ctx.fillText(String(last),755,115);
        p.historyCaption.textContent=`${selected?'Form #'+selected:'Whole line'} · births (green), deaths (red) per 100 ticks · completed 100-tick windows only. Click a marker to locate its event.`;
    }
}
module.exports=LineageInsights;
// TADIWA EDIT END: rates, event navigation and active brain version inspector
