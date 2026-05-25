import { useState, useRef, useCallback } from "react";
import { extractFromFile } from "./api";

// ── PERFIOS OFFICIAL DESIGN SYSTEM ────────────────────────────────────────────
const P = {
  // Primary
  blue:      "#0054B4",
  blueHover: "#004A9E",
  blueDark:  "#003D85",
  blueLight: "#E6EEF8",
  blueMid:   "#CCDDf0",
  // Secondary
  green:     "#2BB673",
  greenDark: "#1F8A55",
  greenLight:"#E8F7F1",
  // Tertiary
  yellow:    "#F2ED51",
  turquoise: "#00B4F0",
  blueGrey:  "#B6CFDD",
  blueGreyL: "#EEF4F8",
  // Neutrals
  white:     "#FFFFFF",
  gray1:     "#F5F7FA",
  gray2:     "#EAECF0",
  gray3:     "#D0D5DD",
  gray4:     "#98A2B3",
  gray5:     "#667085",
  gray6:     "#344054",
  gray7:     "#1D2939",
  // Semantic (used sparingly)
  error:     "#D92D20",
  errorL:    "#FEF3F2",
  warning:   "#DC6803",
  warningL:  "#FFFAEB",
  navy:      "#0A1929",
};

// ── TYPOGRAPHY — Roboto hierarchy ──────────────────────────────────────────────
const T = {
  h1: {fontSize:32, fontWeight:700, fontFamily:"Roboto,system-ui,sans-serif"},
  h2: {fontSize:24, fontWeight:700, fontFamily:"Roboto,system-ui,sans-serif"},
  h3: {fontSize:18, fontWeight:500, fontFamily:"Roboto,system-ui,sans-serif"},
  body:{fontSize:15, fontWeight:400, fontFamily:"Roboto,system-ui,sans-serif"},
  small:{fontSize:13,fontWeight:400, fontFamily:"Roboto,system-ui,sans-serif"},
  label:{fontSize:11,fontWeight:600, fontFamily:"Roboto,system-ui,sans-serif", letterSpacing:"0.5px"},
};

type Confidence = "high"|"medium"|"low"|"unmapped";
interface Field {
  id:string; label:string; value:string;
  confidence:number; status:Confidence;
  section:string; subsection:string; page:number;
  corrected?:boolean; isNew?:boolean;
}
interface AuditEntry {
  id:string; timestamp:string; event:string; field:string;
  originalValue?:string; newValue?:string; method?:string;
}
interface Ratio {
  label:string; formula:string; formulaDetail:string;
  value:string|number; benchmark:string; flag:boolean;
  unit:string; category:string;
}

const SAMPLE_FIELDS:Field[] = [
  {id:"cash",  label:"Cash & Equivalents",         value:"4,20,00,000",  confidence:0.97,status:"high",    section:"Balance Sheet",subsection:"Current Assets",          page:1},
  {id:"rec",   label:"Trade Receivables",           value:"2,10,00,000",  confidence:0.71,status:"medium",  section:"Balance Sheet",subsection:"Current Assets",          page:1},
  {id:"inv",   label:"Inventory",                   value:"1,80,00,000",  confidence:0.68,status:"medium",  section:"Balance Sheet",subsection:"Current Assets",          page:1},
  {id:"cwip",  label:"Capital Work in Progress",    value:"60,00,000",    confidence:0.38,status:"low",     section:"Balance Sheet",subsection:"Current Assets",          page:1},
  {id:"dta",   label:"Deferred Tax Asset",          value:"23,00,000",    confidence:0,   status:"unmapped",section:"Balance Sheet",subsection:"Current Assets",          page:1},
  {id:"ppe",   label:"Property Plant & Equipment",  value:"8,50,00,000",  confidence:0.94,status:"high",    section:"Balance Sheet",subsection:"Non-Current Assets",      page:1},
  {id:"intang",label:"Intangible Assets",           value:"1,20,00,000",  confidence:0.82,status:"medium",  section:"Balance Sheet",subsection:"Non-Current Assets",      page:1},
  {id:"std",   label:"Short-term Debt",             value:"3,10,00,000",  confidence:0.94,status:"high",    section:"Balance Sheet",subsection:"Current Liabilities",     page:2},
  {id:"ap",    label:"Accounts Payable",            value:"1,40,00,000",  confidence:0.76,status:"medium",  section:"Balance Sheet",subsection:"Current Liabilities",     page:2},
  {id:"ltd",   label:"Long-term Debt",              value:"5,20,00,000",  confidence:0.89,status:"medium",  section:"Balance Sheet",subsection:"Non-Current Liabilities", page:2},
  {id:"sc",    label:"Share Capital",               value:"2,00,00,000",  confidence:0.96,status:"high",    section:"Balance Sheet",subsection:"Equity",                  page:2},
  {id:"re",    label:"Retained Earnings",           value:"6,80,00,000",  confidence:0.91,status:"high",    section:"Balance Sheet",subsection:"Equity",                  page:2},
  {id:"rev",   label:"Total Revenue",               value:"18,40,00,000", confidence:0.95,status:"high",    section:"Profit & Loss", subsection:"Revenue",                page:3},
  {id:"cogs",  label:"Cost of Goods Sold",          value:"11,20,00,000", confidence:0.88,status:"medium",  section:"Profit & Loss", subsection:"Expenses",               page:3},
  {id:"gp",    label:"Gross Profit",                value:"7,20,00,000",  confidence:0.93,status:"high",    section:"Profit & Loss", subsection:"Profit",                 page:3},
  {id:"ebitda",label:"EBITDA",                      value:"4,10,00,000",  confidence:0.44,status:"low",     section:"Profit & Loss", subsection:"Profit",                 page:3},
  {id:"int",   label:"Interest & Finance Costs",    value:"1,28,00,000",  confidence:0.87,status:"medium",  section:"Profit & Loss", subsection:"Expenses",               page:3},
  {id:"dep",   label:"Depreciation & Amortisation", value:"62,00,000",    confidence:0.91,status:"high",    section:"Profit & Loss", subsection:"Expenses",               page:3},
  {id:"pat",   label:"Profit After Tax",            value:"2,30,00,000",  confidence:0.91,status:"high",    section:"Profit & Loss", subsection:"Profit",                 page:3},
  {id:"ocf",   label:"Cash from Operations",        value:"3,80,00,000",  confidence:0.85,status:"medium",  section:"Cash Flow",     subsection:"Operating Activities",   page:3},
  {id:"icf",   label:"Cash from Investing",         value:"-2,10,00,000", confidence:0.82,status:"medium",  section:"Cash Flow",     subsection:"Investing Activities",   page:3},
  {id:"fcf",   label:"Cash from Financing",         value:"-90,00,000",   confidence:0.79,status:"medium",  section:"Cash Flow",     subsection:"Financing Activities",   page:3},
];

const PDF_PAGES:Record<number,[string,string][]> = {
  1:[["BALANCE SHEET AS AT 31 MARCH 2025",""],["ASSETS",""],["Current Assets",""],
     ["Cash & Equivalents","4,20,00,000"],["Trade Receivables","2,10,00,000"],
     ["Inventory","1,80,00,000"],["Capital Work in Progress","60,00,000"],
     ["Deferred Tax Asset","23,00,000"],["Non-Current Assets",""],
     ["Property Plant & Equipment","8,50,00,000"],["Intangible Assets","1,20,00,000"]],
  2:[["LIABILITIES & EQUITY",""],["Current Liabilities",""],
     ["Short-term Debt","3,10,00,000"],["Accounts Payable","1,40,00,000"],
     ["Non-Current Liabilities",""],["Long-term Debt","5,20,00,000"],
     ["Equity",""],["Share Capital","2,00,00,000"],["Retained Earnings","6,80,00,000"]],
  3:[["PROFIT & LOSS — FY 2024-25",""],["Revenue",""],["Total Revenue","18,40,00,000"],
     ["Expenses",""],["Cost of Goods Sold","11,20,00,000"],
     ["Interest & Finance Costs","1,28,00,000"],["Depreciation & Amortisation","62,00,000"],
     ["Profit",""],["Gross Profit","7,20,00,000"],["EBITDA","4,10,00,000"],
     ["Profit After Tax","2,30,00,000"],["CASH FLOW SUMMARY",""],
     ["Cash from Operations","3,80,00,000"],["Cash from Investing","-2,10,00,000"],
     ["Cash from Financing","-90,00,000"]],
};

const pv = (id:string, f:Field[]) => {
  const x=f.find(n=>n.id===id); if(!x) return 0;
  const n=parseFloat(x.value.replace(/,/g,"").replace(/-/,""))||0;
  return x.value.startsWith("-")?-n:n;
};
const fmt = (n:number) => {
  if(n===0) return "—";
  const abs=Math.abs(n), sign=n<0?"(-)":"";
  if(abs>=10000000) return sign+"₹"+(abs/10000000).toFixed(2)+"Cr";
  if(abs>=100000)   return sign+"₹"+(abs/100000).toFixed(2)+"L";
  return sign+"₹"+abs.toLocaleString("en-IN");
};

const calcRatios = (f:Field[]):Ratio[] => {
  const ca=pv("cash",f)+pv("rec",f)+pv("inv",f)+pv("cwip",f)+pv("dta",f);
  const cl=pv("std",f)+pv("ap",f);
  const td=pv("std",f)+pv("ltd",f);
  const eq=pv("sc",f)+pv("re",f);
  const nca=pv("ppe",f)+pv("intang",f);
  const ta=ca+nca;
  const rev=pv("rev",f), eb=pv("ebitda",f), pat=pv("pat",f);
  const int_=pv("int",f), gp=pv("gp",f), wc=ca-cl;
  const cr=cl?ca/cl:0, de=eq?td/eq:0;
  const em=rev?(eb/rev)*100:0, npm=rev?(pat/rev)*100:0;
  const ic=int_?eb/int_:0, roa=ta?(pat/ta)*100:0;
  const roe=eq?(pat/eq)*100:0, gpm=rev?(gp/rev)*100:0;
  return [
    {label:"Current Ratio",      formula:"Current Assets ÷ Current Liabilities",    formulaDetail:`${fmt(ca)} ÷ ${fmt(cl)}`,               value:cr?cr.toFixed(2):"N/A",  benchmark:"> 1.5",  flag:cr>0&&cr<1.5,  unit:"x",  category:"Liquidity"},
    {label:"Working Capital",    formula:"Current Assets − Current Liabilities",     formulaDetail:`${fmt(ca)} − ${fmt(cl)}`,               value:fmt(wc),                 benchmark:"> 0",    flag:wc<0,          unit:"",   category:"Liquidity"},
    {label:"Total Current Assets",  formula:"Sum of all current assets",             formulaDetail:`${fmt(ca)}`,                            value:fmt(ca),                 benchmark:"",       flag:false,         unit:"",   category:"Liquidity"},
    {label:"Total Current Liab.",formula:"Sum of all current liabilities",           formulaDetail:`${fmt(cl)}`,                            value:fmt(cl),                 benchmark:"",       flag:false,         unit:"",   category:"Liquidity"},
    {label:"Debt to Equity",     formula:"Total Debt ÷ Net Worth",                   formulaDetail:`${fmt(td)} ÷ ${fmt(eq)}`,               value:de?de.toFixed(2):"N/A",  benchmark:"< 2.0",  flag:de>2,          unit:"x",  category:"Leverage"},
    {label:"Total Debt",         formula:"Short-term Debt + Long-term Debt",         formulaDetail:`${fmt(pv("std",f))} + ${fmt(pv("ltd",f))}`,value:fmt(td),              benchmark:"",       flag:false,         unit:"",   category:"Leverage"},
    {label:"Net Worth",          formula:"Share Capital + Retained Earnings",        formulaDetail:`${fmt(pv("sc",f))} + ${fmt(pv("re",f))}`,  value:fmt(eq),              benchmark:"",       flag:false,         unit:"",   category:"Leverage"},
    {label:"Total Assets",       formula:"Current Assets + Non-Current Assets",      formulaDetail:`${fmt(ca)} + ${fmt(nca)}`,               value:fmt(ta),                benchmark:"",       flag:false,         unit:"",   category:"Leverage"},
    {label:"Gross Profit Margin",formula:"Gross Profit ÷ Revenue × 100",            formulaDetail:`${fmt(gp)} ÷ ${fmt(rev)} × 100`,        value:gpm?gpm.toFixed(1):"N/A",benchmark:"> 20%",  flag:gpm>0&&gpm<20, unit:"%",  category:"Profitability"},
    {label:"EBITDA Margin",      formula:"EBITDA ÷ Revenue × 100",                  formulaDetail:`${fmt(eb)} ÷ ${fmt(rev)} × 100`,        value:em?em.toFixed(1):"N/A",  benchmark:"> 15%",  flag:em>0&&em<15,   unit:"%",  category:"Profitability"},
    {label:"Net Profit Margin",  formula:"PAT ÷ Revenue × 100",                     formulaDetail:`${fmt(pat)} ÷ ${fmt(rev)} × 100`,       value:npm?npm.toFixed(1):"N/A",benchmark:"> 5%",   flag:npm>0&&npm<5,  unit:"%",  category:"Profitability"},
    {label:"Return on Assets",   formula:"PAT ÷ Total Assets × 100",               formulaDetail:`${fmt(pat)} ÷ ${fmt(ta)} × 100`,        value:roa?roa.toFixed(1):"N/A",benchmark:"> 5%",   flag:roa>0&&roa<5,  unit:"%",  category:"Profitability"},
    {label:"Return on Equity",   formula:"PAT ÷ Net Worth × 100",                  formulaDetail:`${fmt(pat)} ÷ ${fmt(eq)} × 100`,        value:roe?roe.toFixed(1):"N/A",benchmark:"> 12%",  flag:roe>0&&roe<12, unit:"%",  category:"Profitability"},
    {label:"Revenue",            formula:"As extracted from P&L",                   formulaDetail:`${fmt(rev)}`,                           value:fmt(rev),                benchmark:"",       flag:false,         unit:"",   category:"Key Figures"},
    {label:"EBITDA",             formula:"As extracted from P&L",                   formulaDetail:`${fmt(eb)}`,                            value:fmt(eb),                 benchmark:"",       flag:false,         unit:"",   category:"Key Figures"},
    {label:"Profit After Tax",   formula:"As extracted from P&L",                   formulaDetail:`${fmt(pat)}`,                           value:fmt(pat),                benchmark:"",       flag:false,         unit:"",   category:"Key Figures"},
    {label:"Interest Coverage",  formula:"EBITDA ÷ Interest & Finance Costs",       formulaDetail:`${fmt(eb)} ÷ ${fmt(int_)}`,             value:ic?ic.toFixed(2):"N/A",  benchmark:"> 2x",   flag:ic>0&&ic<2,    unit:"x",  category:"Debt Service"},
    {label:"Interest Expense",   formula:"As extracted from P&L",                   formulaDetail:`${fmt(int_)}`,                          value:fmt(int_),               benchmark:"",       flag:false,         unit:"",   category:"Debt Service"},
  ];
};

const now=()=>new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit"});

const Badge=({status,confidence}:{status:Confidence;confidence:number})=>{
  const m={
    high:    {bg:P.greenLight,color:P.greenDark,border:"#A7D7BF",text:`✓ ${Math.round(confidence*100)}%`},
    medium:  {bg:P.warningL,  color:P.warning,  border:"#FDE68A",text:`⚠ ${Math.round(confidence*100)}%`},
    low:     {bg:P.errorL,    color:P.error,    border:"#FDA29B",text:`✕ ${Math.round(confidence*100)}%`},
    unmapped:{bg:P.blueGreyL, color:P.gray6,    border:P.blueGrey,text:"UNMAPPED"},
  };
  const s=m[status];
  return <span style={{background:s.bg,color:s.color,border:`1px solid ${s.border}`,...T.label,padding:"2px 7px",borderRadius:4,whiteSpace:"nowrap" as const}}>{s.text}</span>;
};
const PDFViewer=({highlight,page,onPage}:{highlight:Field|null;page:number;onPage:(p:number)=>void})=>{
  const rows=PDF_PAGES[page]||PDF_PAGES[1];
  return(
    <div style={{display:"flex",flexDirection:"column" as const,height:"100%"}}>
      <div style={{background:P.blue,padding:"8px 14px",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
        <span style={{...T.label,color:"rgba(255,255,255,0.7)"}}>DOCUMENT — PAGE</span>
        {[1,2,3].map(p=>(
          <button key={p} onClick={()=>onPage(p)} style={{padding:"3px 11px",borderRadius:4,border:"none",cursor:"pointer",...T.small,fontWeight:600,background:page===p?"rgba(255,255,255,0.25)":"rgba(255,255,255,0.08)",color:"white",transition:"background 0.15s"}}>
            {p}
          </button>
        ))}
        {highlight&&<span style={{marginLeft:"auto",...T.small,color:P.turquoise,fontWeight:600}}>● {highlight.label}</span>}
      </div>
      <div style={{flex:1,overflowY:"auto" as const,background:P.white,padding:"16px 20px"}}>
        <div style={{textAlign:"center" as const,marginBottom:12,...T.label,color:P.gray4,borderBottom:`1px solid ${P.gray2}`,paddingBottom:10}}>
          FINANCIAL STATEMENT — FY 2024-25 — PAGE {page} OF 3
        </div>
        <table style={{width:"100%",borderCollapse:"collapse" as const}}>
          <tbody>
            {rows.map(([label,value],i)=>{
              const isH=value==="";
              const isHL=highlight?.label===label&&highlight?.page===page;
              return(
                <tr key={i} style={{background:isHL?"#FFF9C4":"transparent",transition:"background 0.2s"}}>
                  <td style={{padding:"5px 8px",fontWeight:isH?700:400,paddingLeft:isH?4:18,...T.body,color:isH?P.blue:P.gray7,borderBottom:isH?"none":`1px solid ${P.gray1}`}}>
                    {isHL&&<span style={{color:P.blue,marginRight:6,fontWeight:700}}>►</span>}
                    {label}
                  </td>
                  <td style={{padding:"5px 8px",textAlign:"right" as const,fontWeight:isHL?700:400,...T.body,color:isHL?P.blue:P.gray7,fontFamily:"monospace",borderBottom:isH?"none":`1px solid ${P.gray1}`}}>
                    {value}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ExtractionTable=({fields,selected,filter,onSelect,onEdit,onAddRow}:{
  fields:Field[];selected:string|null;filter:string;
  onSelect:(f:Field)=>void;onEdit:(f:Field,v:string)=>void;onAddRow:(s:string,sub:string)=>void;
})=>{
  const [editId,setEditId]=useState<string|null>(null);
  const [editVal,setEditVal]=useState("");
  const sections=["Balance Sheet","Profit & Loss","Cash Flow"];
  const vis=filter==="all"?fields:fields.filter(f=>f.status===filter);
  return(
    <div style={{height:"100%",overflowY:"auto" as const,background:P.white}}>
      {sections.map(sec=>{
        const secAll=fields.filter(f=>f.section===sec);
        const secVis=vis.filter(f=>f.section===sec);
        if(!secVis.length&&filter!=="all") return null;
        const subs=[...new Set(secAll.map(f=>f.subsection))];
        const st={h:secAll.filter(f=>f.status==="high").length,m:secAll.filter(f=>f.status==="medium").length,l:secAll.filter(f=>f.status==="low").length,u:secAll.filter(f=>f.status==="unmapped").length};
        return(
          <div key={sec} style={{borderBottom:`2px solid ${P.gray2}`}}>
            {/* Section header — Perfios Blue */}
            <div style={{background:P.blue,padding:"9px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky" as const,top:0,zIndex:3}}>
              <span style={{...T.h3,color:P.white,fontSize:14}}>{sec}</span>
              <div style={{display:"flex",gap:6}}>
                {st.h>0&&<span style={{...T.label,color:"#FFFFFF",background:"rgba(43,182,115,0.3)",padding:"1px 7px",borderRadius:3}}>✓ {st.h}</span>}
                {st.m>0&&<span style={{...T.label,color:"#FFFFFF",background:"rgba(242,237,81,0.3)",padding:"1px 7px",borderRadius:3}}>⚠ {st.m}</span>}
                {st.l>0&&<span style={{...T.label,color:"#FFFFFF",background:"rgba(217,45,32,0.3)",padding:"1px 7px",borderRadius:3}}>✕ {st.l}</span>}
                {st.u>0&&<span style={{...T.label,color:"#FFFFFF",background:"rgba(182,207,221,0.4)",padding:"1px 7px",borderRadius:3}}>? {st.u}</span>}
              </div>
            </div>
            {subs.map(sub=>{
              const subVis=(filter==="all"?fields:vis).filter(f=>f.section===sec&&f.subsection===sub);
              if(!subVis.length&&filter!=="all") return null;
              const subAll=fields.filter(f=>f.section===sec&&f.subsection===sub);
              return(
                <div key={sub}>
                  {/* Subsection header — light blue-grey */}
                  <div style={{background:P.blueGreyL,padding:"5px 16px 5px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${P.gray2}`,position:"sticky" as const,top:42,zIndex:2}}>
                    <span style={{...T.label,color:P.blue}}>{sub.toUpperCase()}</span>
                    <span style={{...T.label,color:P.gray4,fontWeight:400}}>{subAll.length} items</span>
                  </div>
                  {/* Column labels */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 170px 96px 46px",background:P.gray1,borderBottom:`1px solid ${P.gray2}`,padding:"4px 0"}}>
                    <span style={{...T.label,color:P.gray5,padding:"0 12px 0 24px"}}>FIELD NAME</span>
                    <span style={{...T.label,color:P.gray5,textAlign:"right" as const,paddingRight:14}}>EXTRACTED VALUE</span>
                    <span style={{...T.label,color:P.gray5,textAlign:"center" as const}}>CONFIDENCE</span>
                    <span style={{...T.label,color:P.gray5,textAlign:"center" as const}}>PG</span>
                  </div>
                  {/* Data rows */}
                  {subVis.map(f=>{
                    const isSel=selected===f.id;
                    const isEd=editId===f.id;
                    return(
                      <div key={f.id}
                        onClick={()=>onSelect(f)}
                        style={{display:"grid",gridTemplateColumns:"1fr 170px 96px 46px",alignItems:"center",background:isSel?P.blueLight:P.white,borderBottom:`1px solid ${P.gray1}`,cursor:"pointer",borderLeft:isSel?`3px solid ${P.blue}`:"3px solid transparent",transition:"all 0.1s"}}
                        onMouseEnter={e=>{if(!isSel)(e.currentTarget as HTMLDivElement).style.background=P.gray1;}}
                        onMouseLeave={e=>{if(!isSel)(e.currentTarget as HTMLDivElement).style.background=P.white;}}>
                        <div style={{padding:"8px 12px 8px 21px",...T.body,color:f.corrected?P.greenDark:f.isNew?P.blue:P.gray7}}>
                          {f.label}
                          {f.corrected&&<span style={{...T.label,color:P.greenDark,background:P.greenLight,padding:"1px 5px",borderRadius:3,marginLeft:7}}>CORRECTED</span>}
                          {f.isNew&&<span style={{...T.label,color:P.blue,background:P.blueLight,padding:"1px 5px",borderRadius:3,marginLeft:7}}>NEW</span>}
                        </div>
                        <div style={{padding:"8px 14px",textAlign:"right" as const,fontFamily:"monospace",...T.body,color:P.gray7}}>
                          {isEd
                            ?<input autoFocus value={editVal}
                                onChange={e=>setEditVal(e.target.value)}
                                onKeyDown={e=>{if(e.key==="Enter"){onEdit(f,editVal);setEditId(null);}if(e.key==="Escape")setEditId(null);}}
                                onBlur={()=>{if(editVal!==f.value)onEdit(f,editVal);setEditId(null);}}
                                onClick={e=>e.stopPropagation()}
                                style={{border:`2px solid ${P.blue}`,borderRadius:4,padding:"2px 6px",fontSize:14,width:"100%",fontFamily:"monospace",textAlign:"right" as const,outline:"none",color:P.gray7}}/>
                            :<span onDoubleClick={e=>{e.stopPropagation();setEditId(f.id);setEditVal(f.value);}} title="Double-click to edit" style={{cursor:"text"}}>{f.value}</span>}
                        </div>
                        <div style={{padding:"8px",textAlign:"center" as const}}><Badge status={f.status} confidence={f.confidence}/></div>
                        <div style={{padding:"8px",textAlign:"center" as const,...T.small,color:P.gray4}}>{f.page}</div>
                      </div>
                    );
                  })}
                  {filter==="all"&&(
                    <div style={{padding:"4px 24px",background:P.white,borderBottom:`1px solid ${P.gray1}`}}>
                      <button onClick={e=>{e.stopPropagation();onAddRow(sec,sub);}}
                        style={{background:"transparent",border:`1px dashed ${P.blueGrey}`,color:P.gray4,...T.small,padding:"3px 14px",borderRadius:4,cursor:"pointer",width:"100%",textAlign:"left" as const}}>
                        + Add field to {sub}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

const RatioSection=({title,ratios,icon}:{title:string;ratios:Ratio[];icon:string})=>{
  const [exp,setExp]=useState<string|null>(null);
  if(!ratios.length) return null;
  const flags=ratios.filter(r=>r.flag).length;
  const good=ratios.filter(r=>!r.flag&&r.benchmark).length;
  return(
    <div style={{marginBottom:28,borderRadius:8,overflow:"hidden",border:`1px solid ${P.gray2}`,boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
      {/* Section header */}
      <div style={{background:P.blue,padding:"10px 18px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:18}}>{icon}</span>
          <span style={{...T.h3,color:P.white,fontSize:15}}>{title}</span>
        </div>
        <div style={{display:"flex",gap:8}}>
          {good>0&&<span style={{...T.label,color:P.white,background:P.green,padding:"2px 10px",borderRadius:12}}>✓ {good} Good</span>}
          {flags>0&&<span style={{...T.label,color:P.white,background:P.error,padding:"2px 10px",borderRadius:12}}>⚠ {flags} Flag</span>}
        </div>
      </div>
      {/* Table */}
      <table style={{width:"100%",borderCollapse:"collapse" as const,background:P.white}}>
        <thead>
          <tr style={{background:P.gray1,borderBottom:`2px solid ${P.gray2}`}}>
            <th style={{padding:"9px 16px",textAlign:"left" as const,...T.label,color:P.gray5,width:"26%"}}>METRIC</th>
            <th style={{padding:"9px 16px",textAlign:"left" as const,...T.label,color:P.gray5,width:"34%"}}>FORMULA</th>
            <th style={{padding:"9px 16px",textAlign:"right" as const,...T.label,color:P.gray5,width:"16%"}}>VALUE</th>
            <th style={{padding:"9px 16px",textAlign:"center" as const,...T.label,color:P.gray5,width:"12%"}}>BENCHMARK</th>
            <th style={{padding:"9px 16px",textAlign:"center" as const,...T.label,color:P.gray5,width:"12%"}}>STATUS</th>
          </tr>
        </thead>
        <tbody>
          {ratios.map(r=>(
            <>
              <tr key={r.label}
                onClick={()=>setExp(exp===r.label?null:r.label)}
                style={{borderBottom:`1px solid ${P.gray1}`,cursor:r.benchmark?"pointer":"default",background:r.flag?P.errorL:P.white,transition:"background 0.1s"}}
                onMouseEnter={e=>{(e.currentTarget as HTMLTableRowElement).style.background=r.flag?"#FEE4E2":P.gray1;}}
                onMouseLeave={e=>{(e.currentTarget as HTMLTableRowElement).style.background=r.flag?P.errorL:P.white;}}>
                <td style={{padding:"11px 16px",...T.body,color:P.gray7,fontWeight:500}}>
                  {r.benchmark&&<span style={{color:P.gray3,fontSize:10,marginRight:6}}>{exp===r.label?"▼":"▶"}</span>}
                  {r.label}
                </td>
                <td style={{padding:"11px 16px",...T.small,color:P.gray5,fontFamily:"monospace"}}>{r.formula}</td>
                <td style={{padding:"11px 16px",textAlign:"right" as const,fontSize:16,fontWeight:700,color:r.flag?P.error:r.benchmark?P.green:P.gray7}}>
                  {r.value}{r.unit&&r.value!=="N/A"&&r.value!=="—"?r.unit:""}
                </td>
                <td style={{padding:"11px 16px",textAlign:"center" as const,...T.small,color:P.gray5}}>{r.benchmark||"—"}</td>
                <td style={{padding:"11px 16px",textAlign:"center" as const}}>
                  {r.flag
                    ?<span style={{background:P.errorL,color:P.error,border:`1px solid #FDA29B`,...T.label,padding:"3px 9px",borderRadius:4}}>⚠ Below</span>
                    :r.benchmark
                    ?<span style={{background:P.greenLight,color:P.greenDark,border:`1px solid #A7D7BF`,...T.label,padding:"3px 9px",borderRadius:4}}>✓ Good</span>
                    :<span style={{color:P.gray3,...T.label}}>—</span>}
                </td>
              </tr>
              {exp===r.label&&(
                <tr key={r.label+"_x"} style={{background:P.blueLight,borderBottom:`1px solid ${P.gray2}`}}>
                  <td colSpan={5} style={{padding:"10px 16px 10px 38px"}}>
                    <div style={{...T.label,color:P.gray5,marginBottom:6}}>CALCULATION BREAKDOWN</div>
                    <div style={{fontFamily:"monospace",fontSize:13,color:P.gray7,background:P.white,padding:"10px 16px",borderRadius:6,border:`1px solid ${P.gray2}`,borderLeft:`4px solid ${P.blue}`}}>
                      <strong style={{color:P.blue}}>{r.label}</strong> = {r.formulaDetail} = <strong style={{color:r.flag?P.error:P.green,fontSize:15}}>{r.value}{r.unit&&r.value!=="N/A"&&r.value!=="—"?r.unit:""}</strong>
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const AuditLog=({entries}:{entries:AuditEntry[]})=>(
  <div style={{background:P.white,borderRadius:8,border:`1px solid ${P.gray2}`,height:"100%",overflowY:"auto" as const,display:"flex",flexDirection:"column" as const,boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
    <div style={{background:P.blue,padding:"10px 16px",borderRadius:"8px 8px 0 0",flexShrink:0}}>
      <span style={{...T.label,color:P.white}}>AUDIT TRAIL — {entries.length===0?"NO EVENTS YET":`${entries.length} EVENTS LOGGED`}</span>
    </div>
    <div style={{flex:1,overflowY:"auto" as const,padding:14}}>
      {entries.length===0&&(
        <div style={{textAlign:"center" as const,marginTop:40,color:P.gray4}}>
          <div style={{fontSize:32,marginBottom:8}}>📋</div>
          <div style={{...T.body,color:P.gray4}}>No events yet.</div>
          <div style={{...T.small,color:P.gray3,marginTop:4}}>Start reviewing to build the trail.</div>
        </div>
      )}
      {[...entries].reverse().map(e=>(
        <div key={e.id} style={{borderLeft:`3px solid ${P.blue}`,paddingLeft:10,marginBottom:14,paddingBottom:2}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:2,alignItems:"center"}}>
            <span style={{...T.label,color:P.blue}}>{e.event}</span>
            <span style={{...T.label,color:P.gray4,fontWeight:400}}>{e.timestamp}</span>
          </div>
          <div style={{...T.small,color:P.gray5}}>Field: <span style={{color:P.gray7,fontWeight:500}}>{e.field}</span></div>
          {e.originalValue&&<div style={{...T.small,color:P.gray5}}>Before: <span style={{color:P.error,fontFamily:"monospace"}}>{e.originalValue}</span></div>}
          {e.newValue&&<div style={{...T.small,color:P.gray5}}>After: <span style={{color:P.green,fontFamily:"monospace"}}>{e.newValue}</span></div>}
          {e.method&&<div style={{...T.small,color:P.gray5}}>Method: <span style={{color:P.blue}}>{e.method}</span></div>}
        </div>
      ))}
    </div>
  </div>
);
export default function App(){
  const [screen,setScreen]=useState<1|2|3>(1);
  const [fields,setFields]=useState<Field[]>(SAMPLE_FIELDS);
  const [selected,setSelected]=useState<Field|null>(null);
  const [pdfPage,setPdfPage]=useState(1);
  const [filter,setFilter]=useState("all");
  const [audit,setAudit]=useState<AuditEntry[]>([]);
  const [uploading,setUploading]=useState(false);
  const [uploadError,setUploadError]=useState<string|null>(null);
  const [exported,setExported]=useState(false);
  const [showCustom,setShowCustom]=useState(false);
  const [customRatios,setCustomRatios]=useState<Ratio[]>([]);
  const [crName,setCrName]=useState("");
  const [crNum,setCrNum]=useState("");
  const [crDen,setCrDen]=useState("");
  const [crMult,setCrMult]=useState("1");
  const aRef=useRef(0);

  const addAudit=useCallback((e:Omit<AuditEntry,"id"|"timestamp">)=>{
    setAudit(a=>[...a,{...e,id:String(++aRef.current),timestamp:now()}]);
  },[]);

  const stats={
    total:fields.length,
    high:fields.filter(f=>f.status==="high").length,
    medium:fields.filter(f=>f.status==="medium").length,
    low:fields.filter(f=>f.status==="low").length,
    unmapped:fields.filter(f=>f.status==="unmapped").length,
  };

  const handleSelect=(f:Field)=>{setSelected(f);setPdfPage(f.page);addAudit({event:"ITEM VIEWED",field:f.label});};

  const handleEdit=(f:Field,v:string)=>{
    if(v===f.value) return;
    setFields(p=>p.map(x=>x.id===f.id?{...x,value:v,confidence:1,status:"high" as Confidence,corrected:true}:x));
    addAudit({event:"CORRECTION",field:f.label,originalValue:f.value,newValue:v,method:"inline edit"});
  };

  const handleAddRow=(section:string,subsection:string)=>{
    const id="new_"+Date.now();
    setFields(p=>[...p,{id,label:"New Field",value:"0",confidence:0,status:"unmapped",section,subsection,page:1,isNew:true}]);
    addAudit({event:"FIELD ADDED",field:`${section} › ${subsection}`});
  };

  const handleUpload=async(file:File)=>{
    setUploading(true);setUploadError(null);
    addAudit({event:"DOCUMENT UPLOADED",field:file.name});
    try{
      const result=await extractFromFile(file);
      if(result.error){setUploadError(result.error);}
      else{setFields(result.tree as any);addAudit({event:"EXTRACTION COMPLETE",field:file.name});}
    }catch(err){setUploadError(String(err));}
    setUploading(false);
  };

  const handleAddCustomRatio=()=>{
    if(!crName||!crNum||!crDen) return;
    const nf=fields.find(f=>f.id===crNum),df=fields.find(f=>f.id===crDen);
    if(!nf||!df) return;
    const nv=parseFloat(nf.value.replace(/,/g,""))||0;
    const dv=parseFloat(df.value.replace(/,/g,""))||0;
    const mult=parseFloat(crMult)||1;
    const val=dv?(nv/dv)*mult:0;
    setCustomRatios(r=>[...r,{label:crName,formula:`${nf.label} ÷ ${df.label}${mult!==1?` × ${mult}`:""}`,formulaDetail:`${fmt(nv)} ÷ ${fmt(dv)}${mult!==1?` × ${mult}`:""}`,value:val.toFixed(2),benchmark:"",flag:false,unit:mult===100?"%":"x",category:"Custom Ratios"}]);
    addAudit({event:"CUSTOM RATIO CREATED",field:crName});
    setCrName("");setCrNum("");setCrDen("");setCrMult("1");setShowCustom(false);
  };

  const allRatios=[...calcRatios(fields),...customRatios];
  const ratioCats=[...new Set(allRatios.map(r=>r.category))];
  const catIcons:Record<string,string>={"Liquidity":"💧","Leverage":"⚖️","Profitability":"📈","Debt Service":"🏦","Key Figures":"📊","Custom Ratios":"⭐"};

  const inp={background:P.white,border:`1px solid ${P.gray3}`,borderRadius:6,color:P.gray7,padding:"7px 10px",...T.body,width:"100%",boxSizing:"border-box" as const,outline:"none"};

  return(
    <div style={{fontFamily:"Roboto,system-ui,sans-serif",background:P.gray1,minHeight:"100vh",color:P.gray7,display:"flex",flexDirection:"column" as const}}>

      {/* ── TOP NAV ── */}
      <div style={{background:P.blue,padding:"0 24px",display:"flex",alignItems:"center",gap:0,flexShrink:0,boxShadow:"0 2px 8px rgba(0,84,180,0.3)"}}>
        {/* Logo area */}
        <div style={{display:"flex",alignItems:"center",gap:10,paddingRight:32,borderRight:`1px solid rgba(255,255,255,0.2)`,marginRight:0,padding:"12px 32px 12px 0"}}>
          <div style={{width:32,height:32,background:P.white,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <span style={{color:P.blue,fontWeight:900,fontSize:16}}>P</span>
          </div>
          <div>
            <div style={{...T.label,color:"rgba(255,255,255,0.9)",fontSize:13,letterSpacing:1}}>PERFIOS</div>
            <div style={{...T.label,color:"rgba(255,255,255,0.5)",fontWeight:400,fontSize:10}}>AI Financial Spreading</div>
          </div>
        </div>
        {/* Nav tabs */}
        <div style={{display:"flex",flex:1,paddingLeft:8}}>
          {([{n:1,label:"Extract & Verify",icon:"📄"},{n:2,label:"Analysis & Ratios",icon:"📊"},{n:3,label:"Export",icon:"📤"}] as const).map(({n,label,icon})=>(
            <button key={n} onClick={()=>setScreen(n)} style={{padding:"14px 20px",border:"none",cursor:"pointer",background:"transparent",color:screen===n?P.white:"rgba(255,255,255,0.55)",fontWeight:screen===n?700:400,...T.body,borderBottom:screen===n?`3px solid ${P.white}`:"3px solid transparent",transition:"all 0.15s",display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:14}}>{icon}</span>{label}
            </button>
          ))}
        </div>
        {/* Stats pills */}
        <div style={{display:"flex",gap:6,paddingLeft:16}}>
          {[{k:"high",c:P.green,l:"✓"},{k:"medium",c:P.yellow,l:"⚠"},{k:"low",c:P.error,l:"✕"},{k:"unmapped",c:P.blueGrey,l:"?"}].map(({k,c,l})=>
            stats[k as keyof typeof stats]>0&&(
              <span key={k} style={{background:"rgba(255,255,255,0.12)",color:P.white,...T.label,padding:"3px 9px",borderRadius:12,borderLeft:`3px solid ${c}`}}>
                {l} {stats[k as keyof typeof stats]}
              </span>
            )
          )}
        </div>
      </div>

      {/* ── SCREEN 1 — EXTRACT & VERIFY ── */}
      {screen===1&&(
        <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 1fr",gridTemplateRows:"auto 1fr",minHeight:0}}>
          {/* Sub-toolbar */}
          <div style={{gridColumn:"1/-1",background:P.white,borderBottom:`1px solid ${P.gray2}`,padding:"8px 16px",display:"flex",alignItems:"center",gap:8,flexShrink:0,boxShadow:"0 1px 3px rgba(0,0,0,0.05)"}}>
            <span style={{...T.label,color:P.gray5,marginRight:4}}>FILTER:</span>
            {(["all","high","medium","low","unmapped"] as const).map(f=>(
              <button key={f} onClick={()=>setFilter(f)} style={{padding:"4px 12px",borderRadius:20,border:`1px solid ${filter===f?P.blue:P.gray3}`,cursor:"pointer",...T.small,fontWeight:600,background:filter===f?P.blue:P.white,color:filter===f?P.white:P.gray5,transition:"all 0.15s"}}>
                {f==="all"?"All":f.charAt(0).toUpperCase()+f.slice(1)}{f!=="all"?` (${stats[f as keyof typeof stats]})` :""}
              </button>
            ))}
            <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:10}}>
              <span style={{...T.small,color:P.gray4}}>Click to highlight in PDF  ·  Double-click value to edit</span>
              {uploadError&&<span style={{...T.small,color:P.error}}>{uploadError}</span>}
              <label style={{cursor:"pointer",background:uploading?P.gray2:P.blue,color:uploading?P.gray4:P.white,...T.small,fontWeight:700,padding:"6px 16px",borderRadius:6,border:"none",transition:"background 0.15s"}}>
                {uploading?"Processing…":"Upload Document"}
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)handleUpload(f);}}/>
              </label>
            </div>
          </div>
          {/* Left — extraction table */}
          <div style={{background:P.white,borderRight:`1px solid ${P.gray2}`,overflow:"hidden",display:"flex",flexDirection:"column" as const,minHeight:0}}>
            <div style={{background:P.blueGreyL,padding:"6px 16px",borderBottom:`1px solid ${P.gray2}`,flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{...T.label,color:P.blue}}>{stats.total} FIELDS EXTRACTED</span>
              <span style={{...T.label,color:P.gray4,fontWeight:400}}>FY 2024-25 · 3 Documents</span>
            </div>
            <div style={{flex:1,overflowY:"auto" as const}}>
              <ExtractionTable fields={fields} selected={selected?.id||null} filter={filter} onSelect={handleSelect} onEdit={handleEdit} onAddRow={handleAddRow}/>
            </div>
          </div>
          {/* Right — PDF viewer */}
          <div style={{overflow:"hidden",display:"flex",flexDirection:"column" as const,minHeight:0}}>
            <PDFViewer highlight={selected} page={pdfPage} onPage={setPdfPage}/>
          </div>
        </div>
      )}

      {/* ── SCREEN 2 — ANALYSIS & RATIOS ── */}
      {screen===2&&(
        <div style={{flex:1,overflowY:"auto" as const,padding:"24px 32px"}}>
          <div style={{maxWidth:1080,margin:"0 auto"}}>
            {/* Page header */}
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:24}}>
              <div>
                <h1 style={{...T.h1,color:P.blue,margin:0,marginBottom:6}}>Financial Analysis</h1>
                <p style={{...T.body,color:P.gray5,margin:0}}>Computed from verified extraction · FY 2024-25 · Click any ratio to expand the full calculation</p>
              </div>
              <button onClick={()=>setShowCustom(s=>!s)} style={{background:showCustom?P.blueLight:P.blue,border:`1px solid ${P.blue}`,color:showCustom?P.blue:P.white,...T.body,fontWeight:600,padding:"9px 20px",borderRadius:6,cursor:"pointer",display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                <span>+</span> Custom Ratio
              </button>
            </div>

            {/* Summary KPI bar */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:28}}>
              {[
                {label:"Total Revenue",    val:fmt(calcRatios(fields).find(r=>r.label==="Revenue")?.value as any||0),   color:P.blue,   bg:P.blueLight},
                {label:"EBITDA",           val:fmt(calcRatios(fields).find(r=>r.label==="EBITDA")?.value as any||0),    color:P.green,  bg:P.greenLight},
                {label:"Profit After Tax", val:fmt(calcRatios(fields).find(r=>r.label==="Profit After Tax")?.value as any||0), color:P.greenDark, bg:P.greenLight},
                {label:"Net Worth",        val:fmt(calcRatios(fields).find(r=>r.label==="Net Worth")?.value as any||0), color:P.blue,   bg:P.blueLight},
              ].map(c=>(
                <div key={c.label} style={{background:P.white,border:`1px solid ${P.gray2}`,borderRadius:8,padding:"16px 18px",borderTop:`3px solid ${c.color}`,boxShadow:"0 1px 3px rgba(0,0,0,0.05)"}}>
                  <div style={{...T.label,color:P.gray5,marginBottom:6}}>{c.label.toUpperCase()}</div>
                  <div style={{...T.h2,color:c.color,fontSize:20}}>{fields.find(f=>f.id===["rev","ebitda","pat","sc"][["Total Revenue","EBITDA","Profit After Tax","Net Worth"].indexOf(c.label)])?.value||"—"}</div>
                </div>
              ))}
            </div>

            {/* Flags alert */}
            {allRatios.filter(r=>r.flag).length>0&&(
              <div style={{background:P.errorL,border:`1px solid #FDA29B`,borderRadius:8,padding:"12px 18px",marginBottom:24,display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:20}}>⚠️</span>
                <div>
                  <span style={{...T.body,color:P.error,fontWeight:600}}>  {allRatios.filter(r=>r.flag).length} ratio{allRatios.filter(r=>r.flag).length>1?"s":""} below benchmark: </span>
                  <span style={{...T.body,color:P.error}}>{allRatios.filter(r=>r.flag).map(r=>r.label).join(" · ")}</span>
                </div>
              </div>
            )}

            {/* Custom ratio builder */}
            {showCustom&&(
              <div style={{background:P.white,border:`1px solid ${P.gray2}`,borderRadius:8,padding:20,marginBottom:28,boxShadow:"0 1px 4px rgba(0,0,0,0.08)"}}>
                <h3 style={{...T.h3,color:P.blue,margin:"0 0 16px 0"}}>Build a Custom Ratio</h3>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:14}}>
                  <div><div style={{...T.label,color:P.gray5,marginBottom:5}}>RATIO NAME</div>
                    <input value={crName} onChange={e=>setCrName(e.target.value)} placeholder="e.g. Net NPA Ratio" style={inp}/></div>
                  <div><div style={{...T.label,color:P.gray5,marginBottom:5}}>NUMERATOR</div>
                    <select value={crNum} onChange={e=>setCrNum(e.target.value)} style={inp}>
                      <option value="">Select field…</option>
                      {fields.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}
                    </select></div>
                  <div><div style={{...T.label,color:P.gray5,marginBottom:5}}>DENOMINATOR</div>
                    <select value={crDen} onChange={e=>setCrDen(e.target.value)} style={inp}>
                      <option value="">Select field…</option>
                      {fields.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}
                    </select></div>
                  <div><div style={{...T.label,color:P.gray5,marginBottom:5}}>MULTIPLY BY</div>
                    <select value={crMult} onChange={e=>setCrMult(e.target.value)} style={inp}>
                      <option value="1">× 1 — ratio / absolute</option>
                      <option value="100">× 100 — percentage (%)</option>
                    </select></div>
                </div>
                {crNum&&crDen&&(()=>{const nf=fields.find(f=>f.id===crNum),df=fields.find(f=>f.id===crDen);return nf&&df&&(<div style={{background:P.blueLight,border:`1px solid ${P.blueMid}`,borderRadius:6,padding:"8px 14px",marginBottom:14,...T.body,color:P.blue,fontFamily:"monospace"}}>Preview: <strong>{crName||"New Ratio"}</strong> = {nf.label} ÷ {df.label}{crMult==="100"?" × 100":""}</div>);})()}
                <div style={{display:"flex",gap:10}}>
                  <button onClick={handleAddCustomRatio} style={{background:P.blue,border:"none",color:P.white,...T.body,fontWeight:600,padding:"8px 20px",borderRadius:6,cursor:"pointer"}}>Add Ratio</button>
                  <button onClick={()=>setShowCustom(false)} style={{background:P.white,border:`1px solid ${P.gray3}`,color:P.gray5,...T.body,padding:"8px 20px",borderRadius:6,cursor:"pointer"}}>Cancel</button>
                </div>
              </div>
            )}

            {/* Ratio sections grouped by category */}
            {ratioCats.map(cat=>(
              <RatioSection key={cat} title={cat} ratios={allRatios.filter(r=>r.category===cat)} icon={catIcons[cat]||"📊"}/>
            ))}
          </div>
        </div>
      )}

      {/* ── SCREEN 3 — EXPORT ── */}
      {screen===3&&(
        <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 1fr",minHeight:0,gap:0}}>
          {/* Left — summary + download */}
          <div style={{padding:28,overflowY:"auto" as const,borderRight:`1px solid ${P.gray2}`}}>
            <h1 style={{...T.h1,color:P.blue,margin:"0 0 4px 0"}}>Export Package</h1>
            <p style={{...T.body,color:P.gray5,margin:"0 0 24px 0"}}>Review the processing summary and download all files</p>
            {/* Summary grid */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:28}}>
              {[
                {label:"Total Fields Extracted",    val:stats.total,       color:P.blue,   bg:P.blueLight},
                {label:"Auto-Approved ≥90%",        val:stats.high,        color:P.green,  bg:P.greenLight},
                {label:"Manually Corrected",        val:audit.filter(e=>e.event==="CORRECTION").length, color:P.warning, bg:P.warningL},
                {label:"Ratios Calculated",         val:allRatios.length,  color:P.blue,   bg:P.blueLight},
                {label:"Audit Events Logged",       val:audit.length,      color:P.greenDark,bg:P.greenLight},
                {label:"Flags Below Benchmark",     val:allRatios.filter(r=>r.flag).length, color:allRatios.filter(r=>r.flag).length>0?P.error:P.green, bg:allRatios.filter(r=>r.flag).length>0?P.errorL:P.greenLight},
              ].map(c=>(
                <div key={c.label} style={{background:c.bg,border:`1px solid ${P.gray2}`,borderRadius:8,padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{...T.small,color:P.gray6}}>{c.label}</span>
                  <span style={{...T.h2,color:c.color,fontSize:22}}>{c.val}</span>
                </div>
              ))}
            </div>
            {/* Download buttons */}
            <h3 style={{...T.h3,color:P.gray6,margin:"0 0 14px 0"}}>Download Files</h3>
            <div style={{display:"flex",flexDirection:"column" as const,gap:10}}>
              {[
                {icon:"📊",label:"CAM Report (.xlsx)",     sub:"Verified extraction mapped to your Excel template",  accent:P.blue},
                {icon:"📋",label:"Audit Trail (.json)",    sub:"Machine-readable log — for compliance systems",      accent:P.green},
                {icon:"📄",label:"Audit Report (.pdf)",    sub:"Human-readable — MAS · OCC · EBA compliant",        accent:P.turquoise},
              ].map(b=>(
                <button key={b.label} onClick={()=>setExported(true)}
                  style={{display:"flex",alignItems:"center",gap:14,padding:"14px 18px",borderRadius:8,border:`1px solid ${P.gray2}`,background:P.white,cursor:"pointer",textAlign:"left" as const,boxShadow:"0 1px 3px rgba(0,0,0,0.05)",transition:"box-shadow 0.15s",borderLeft:`4px solid ${b.accent}`}}
                  onMouseEnter={e=>(e.currentTarget as HTMLButtonElement).style.boxShadow="0 3px 10px rgba(0,0,0,0.1)"}
                  onMouseLeave={e=>(e.currentTarget as HTMLButtonElement).style.boxShadow="0 1px 3px rgba(0,0,0,0.05)"}>
                  <span style={{fontSize:24}}>{b.icon}</span>
                  <div>
                    <div style={{...T.body,color:P.gray7,fontWeight:600}}>{b.label}</div>
                    <div style={{...T.small,color:P.gray4,marginTop:2}}>{b.sub}</div>
                  </div>
                  <span style={{marginLeft:"auto",color:P.blue,...T.label}}>↓ Download</span>
                </button>
              ))}
            </div>
            {exported&&(
              <div style={{marginTop:16,padding:"12px 16px",background:P.greenLight,border:`1px solid ${P.green}`,borderRadius:8,...T.body,color:P.greenDark,display:"flex",alignItems:"center",gap:8}}>
                <span>✓</span> Export complete — all files ready. Audit trail sealed.
              </div>
            )}
          </div>
          {/* Right — audit log */}
          <div style={{padding:20,overflowY:"auto" as const,background:P.gray1}}>
            <AuditLog entries={audit}/>
          </div>
        </div>
      )}
    </div>
  );
}