const fs=require('fs');const {chromium}=require('playwright');
const L=JSON.parse(fs.readFileSync(__dirname+'/../grace/data/malibu/malibu_circuits.geojson'));
const A=JSON.parse(fs.readFileSync(__dirname+'/malibu_hypothetical_assets.geojson'));
const x0=-118.90,x1=-118.64,y0=33.995,y1=34.115,W=1400,H=Math.round(W*(y1-y0)*110570/((x1-x0)*111320*Math.cos(34.03*Math.PI/180)));
const X=x=>(x-x0)/(x1-x0)*W,Y=y=>(y1-y)/(y1-y0)*H;
const col={CUTHBERT:'#2a78d6',GALAHAD:'#7a5bd6',MAGUIRE:'#d68a2a',MERLIN:'#1a9e77',SERRA:'#c2408a'};
let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H+70}" style="background:#f7f6f2;font-family:Helvetica">`;
for(const f of L.features)for(const ln of f.geometry.coordinates)s+=`<polyline fill="none" stroke="${col[f.properties.circuit]}" stroke-width="2" opacity=".55" points="${ln.map(p=>X(p[0]).toFixed(1)+','+Y(p[1]).toFixed(1)).join(' ')}"/>`;
for(const f of A.features){const [x,y]=f.geometry.coordinates,p=f.properties;
 if(p.kind==='transformer')s+=`<rect x="${X(x)-2}" y="${Y(y)-2}" width="4" height="4" fill="#333" opacity=".55"/>`;}
for(const f of A.features){const [x,y]=f.geometry.coordinates,p=f.properties;
 if(p.kind==='line_device')s+=`<circle cx="${X(x)}" cy="${Y(y)}" r="8" fill="#e23" stroke="#fff" stroke-width="2"/><text x="${X(x)+11}" y="${Y(y)+(p.device==="RAR8848"?-12:5)}" font-size="15" font-weight="bold" fill="#222" paint-order="stroke" stroke="#f7f6f2" stroke-width="4">${p.device} (${p.customers_cut})</text>`;
 if(p.kind==='substation')s+=`<rect x="${X(x)-9}" y="${Y(y)-9}" width="18" height="18" fill="#111"/><text x="${X(x)+13}" y="${Y(y)-8}" font-size="15" fill="#111">Latigo substation (est.)</text>`;}
let lx=16;s+=`<g transform="translate(0,${H+10})">`;
for(const c in col){s+=`<rect x="${lx}" y="8" width="22" height="5" fill="${col[c]}"/><text x="${lx+28}" y="15" font-size="14">${c}</text>`;lx+=130;}
s+=`<circle cx="${lx+8}" cy="11" r="7" fill="#e23"/><text x="${lx+20}" y="15" font-size="14">SCE line switch, real name and customers cut, location estimated</text>`;
s+=`<rect x="16" y="32" width="5" height="5" fill="#333"/><text x="28" y="39" font-size="14">Hypothetical service transformer (1 per 8 homes), candidate island switch site. Lines: SCE DRPEP. Tuna circuit not published.</text></g></svg>`;
fs.writeFileSync(__dirname+'/malibu_switches_map.svg',s);
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:W,height:H+70}});await pg.setContent(s);await pg.screenshot({path:__dirname+'/malibu_switches_map.png'});await b.close();})();
