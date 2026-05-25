import { useState, useRef, useCallback } from "react";
import { extractFromFile } from "./api";

type Confidence = "high" | "medium" | "low" | "unmapped";
interface Field {
  id: string;
  label: string;
  value: string;
  confidence: number;
  status: Confidence;
  section: string;
  subsection: string;
  page: number;
  corrected?: boolean;
  isNew?: boolean;
}
interface MappingRule { cell: string; fieldId: string; fieldLabel: string; value: string; }
interface AuditEntry { id: string; timestamp: string; event: string; field: string; originalValue?: string; newValue?: string; method?: string; }
interface Ratio { label: string; formula: string; formulaDetail: string; value: string | number; benchmark: string; flag: boolean; unit: string; }

const SAMPLE_FIELDS: Field[] = [
  { id:"cash",  label:"Cash & Equivalents",          value:"4,20,00,000",  confidence:0.97, status:"high",    section:"Balance Sheet", subsection:"Current Assets",        page:1 },
  { id:"rec",   label:"Trade Receivables",            value:"2,10,00,000",  confidence:0.71, status:"medium",  section:"Balance Sheet", subsection:"Current Assets",        page:1 },
  { id:"inv",   label:"Inventory",                    value:"1,80,00,000",  confidence:0.68, status:"medium",  section:"Balance Sheet", subsection:"Current Assets",        page:1 },
  { id:"cwip",  label:"Capital Work in Progress",     value:"60,00,000",    confidence:0.38, status:"low",     section:"Balance Sheet", subsection:"Current Assets",        page:1 },
  { id:"dta",   label:"Deferred Tax Asset",           value:"23,00,000",    confidence:0,    status:"unmapped",section:"Balance Sheet", subsection:"Current Assets",        page:1 },
  { id:"ppe",   label:"Property Plant & Equipment",   value:"8,50,00,000",  confidence:0.94, status:"high",    section:"Balance Sheet", subsection:"Non-Current Assets",    page:1 },
  { id:"intang",label:"Intangible Assets",            value:"1,20,00,000",  confidence:0.82, status:"medium",  section:"Balance Sheet", subsection:"Non-Current Assets",    page:1 },
  { id:"std",   label:"Short-term Debt",              value:"3,10,00,000",  confidence:0.94, status:"high",    section:"Balance Sheet", subsection:"Current Liabilities",   page:2 },
  { id:"ap",    label:"Accounts Payable",             value:"1,40,00,000",  confidence:0.76, status:"medium",  section:"Balance Sheet", subsection:"Current Liabilities",   page:2 },
  { id:"ltd",   label:"Long-term Debt",               value:"5,20,00,000",  confidence:0.89, status:"medium",  section:"Balance Sheet", subsection:"Non-Current Liabilities",page:2 },
  { id:"sc",    label:"Share Capital",                value:"2,00,00,000",  confidence:0.96, status:"high",    section:"Balance Sheet", subsection:"Equity",               page:2 },
  { id:"re",    label:"Retained Earnings",            value:"6,80,00,000",  confidence:0.91, status:"high",    section:"Balance Sheet", subsection:"Equity",               page:2 },
  { id:"rev",   label:"Total Revenue",                value:"18,40,00,000", confidence:0.95, status:"high",    section:"Profit & Loss", subsection:"Revenue",              page:3 },
  { id:"cogs",  label:"Cost of Goods Sold",           value:"11,20,00,000", confidence:0.88, status:"medium",  section:"Profit & Loss", subsection:"Expenses",             page:3 },
  { id:"gp",    label:"Gross Profit",                 value:"7,20,00,000",  confidence:0.93, status:"high",    section:"Profit & Loss", subsection:"Profit",               page:3 },
  { id:"ebitda",label:"EBITDA",                       value:"4,10,00,000",  confidence:0.44, status:"low",     section:"Profit & Loss", subsection:"Profit",               page:3 },
  { id:"int",   label:"Interest & Finance Costs",     value:"1,28,00,000",  confidence:0.87, status:"medium",  section:"Profit & Loss", subsection:"Expenses",             page:3 },
  { id:"dep",   label:"Depreciation & Amortisation",  value:"62,00,000",    confidence:0.91, status:"high",    section:"Profit & Loss", subsection:"Expenses",             page:3 },
  { id:"pat",   label:"Profit After Tax",             value:"2,30,00,000",  confidence:0.91, status:"high",    section:"Profit & Loss", subsection:"Profit",               page:3 },
  { id:"ocf",   label:"Cash from Operations",         value:"3,80,00,000",  confidence:0.85, status:"medium",  section:"Cash Flow",     subsection:"Operating Activities", page:3 },
  { id:"icf",   label:"Cash from Investing",          value:"-2,10,00,000", confidence:0.82, status:"medium",  section:"Cash Flow",     subsection:"Investing Activities", page:3 },
  { id:"fcf",   label:"Cash from Financing",          value:"-90,00,000",   confidence:0.79, status:"medium",  section:"Cash Flow",     subsection:"Financing Activities", page:3 },
];

const PDF_PAGES: Record<number,[string,string][]> = {
  1:[
    ["BALANCE SHEET AS AT 31 MARCH 2025",""],
    ["ASSETS",""],["Current Assets",""],
    ["Cash & Equivalents","4,20,00,000"],
    ["Trade Receivables","2,10,00,000"],
    ["Inventory","1,80,00,000"],
    ["Capital Work in Progress","60,00,000"],
    ["Deferred Tax Asset","23,00,000"],
    ["Non-Current Assets",""],
    ["Property Plant & Equipment","8,50,00,000"],
    ["Intangible Assets","1,20,00,000"],
  ],
  2:[
    ["LIABILITIES & EQUITY",""],["Current Liabilities",""],
    ["Short-term Debt","3,10,00,000"],
    ["Accounts Payable","1,40,00,000"],
    ["Non-Current Liabilities",""],
    ["Long-term Debt","5,20,00,000"],
    ["Equity",""],
    ["Share Capital","2,00,00,000"],
    ["Retained Earnings","6,80,00,000"],
  ],
  3:[
    ["PROFIT & LOSS — FY 2024-25",""],["Revenue",""],
    ["Total Revenue","18,40,00,000"],
    ["Expenses",""],
    ["Cost of Goods Sold","11,20,00,000"],
    ["Interest & Finance Costs","1,28,00,000"],
    ["Depreciation & Amortisation","62,00,000"],
    ["Profit",""],
    ["Gross Profit","7,20,00,000"],
    ["EBITDA","4,10,00,000"],
    ["Profit After Tax","2,30,00,000"],
    ["CASH FLOW SUMMARY",""],
    ["Cash from Operations","3,80,00,000"],
    ["Cash from Investing","-2,10,00,000"],
    ["Cash from Financing","-90,00,000"],
  ],
};

const pv = (id: string, fields: Field[]) => {
  const f = fields.find(x => x.id === id);
  if (!f) return 0;
  return parseFloat(f.value.replace(/,/g,"").replace(/-/g,"")) * (f.value.startsWith("-") ? -1 : 1) || 0;
};

const fmt = (n: number) => {
  if (n === 0) return "N/A";
  const abs = Math.abs(n);
  if (abs >= 10000000) return "₹" + (n/10000000).toFixed(2) + "Cr";
  if (abs >= 100000) return "₹" + (n/100000).toFixed(2) + "L";
  return "₹" + n.toLocaleString("en-IN");
};

const calcRatios = (fields: Field[]): Ratio[] => {
  const ca = pv("cash",fields)+pv("rec",fields)+pv("inv",fields)+pv("cwip",fields)+pv("dta",fields);
  const cl = pv("std",fields)+pv("ap",fields);
  const ncl = pv("ltd",fields);
  const td = pv("std",fields)+pv("ltd",fields);
  const eq = pv("sc",fields)+pv("re",fields);
  const ta = ca+pv("ppe",fields)+pv("intang",fields);
  const rev = pv("rev",fields);
  const ebitda = pv("ebitda",fields);
  const pat = pv("pat",fields);
  const int_ = pv("int",fields);
  const wc = ca - cl;
  const cr = cl ? ca/cl : 0;
  const de = eq ? td/eq : 0;
  const em = rev ? (ebitda/rev)*100 : 0;
  const npm = rev ? (pat/rev)*100 : 0;
  const ic = int_ ? ebitda/int_ : 0;
  const roa = ta ? (pat/ta)*100 : 0;
  return [
    { label:"Current Ratio",      formula:"Current Assets ÷ Current Liabilities",          formulaDetail:`(${fmt(ca)}) ÷ (${fmt(cl)})`,             value:cr?cr.toFixed(2):"N/A",   benchmark:"> 1.5",  flag:cr>0&&cr<1.5,    unit:"x" },
    { label:"Debt to Equity",     formula:"Total Debt ÷ Net Worth",                         formulaDetail:`(${fmt(td)}) ÷ (${fmt(eq)})`,             value:de?de.toFixed(2):"N/A",   benchmark:"< 2.0",  flag:de>2,            unit:"x" },
    { label:"EBITDA Margin",      formula:"EBITDA ÷ Total Revenue × 100",                   formulaDetail:`(${fmt(ebitda)}) ÷ (${fmt(rev)}) × 100`,  value:em?em.toFixed(1):"N/A",   benchmark:"> 15%",  flag:em>0&&em<15,     unit:"%" },
    { label:"Net Profit Margin",  formula:"PAT ÷ Total Revenue × 100",                      formulaDetail:`(${fmt(pat)}) ÷ (${fmt(rev)}) × 100`,     value:npm?npm.toFixed(1):"N/A", benchmark:"> 5%",   flag:npm>0&&npm<5,    unit:"%" },
    { label:"Interest Coverage",  formula:"EBITDA ÷ Interest & Finance Costs",              formulaDetail:`(${fmt(ebitda)}) ÷ (${fmt(int_)})`,       value:ic?ic.toFixed(2):"N/A",   benchmark:"> 2x",   flag:ic>0&&ic<2,      unit:"x" },
    { label:"Return on Assets",   formula:"PAT ÷ Total Assets × 100",                       formulaDetail:`(${fmt(pat)}) ÷ (${fmt(ta)}) × 100`,      value:roa?roa.toFixed(1):"N/A", benchmark:"> 5%",   flag:roa>0&&roa<5,    unit:"%" },
    { label:"Working Capital",    formula:"Current Assets − Current Liabilities",            formulaDetail:`${fmt(ca)} − ${fmt(cl)}`,                  value:fmt(wc),                  benchmark:"> 0",    flag:wc<0,            unit:"" },
    { label:"Total Debt",         formula:"Short-term Debt + Long-term Debt",                formulaDetail:`${fmt(pv("std",fields))} + ${fmt(pv("ltd",fields))}`, value:fmt(td), benchmark:"",  flag:false,           unit:"" },
    { label:"Net Worth",          formula:"Share Capital + Retained Earnings",               formulaDetail:`${fmt(pv("sc",fields))} + ${fmt(pv("re",fields))}`,   value:fmt(eq), benchmark:"",  flag:false,           unit:"" },
    { label:"Total Assets",       formula:"Current Assets + Non-Current Assets",             formulaDetail:`${fmt(ca)} + ${fmt(pv("ppe",fields)+pv("intang",fields))}`, value:fmt(ta), benchmark:"", flag:false, unit:"" },
  ];
};

const now = () => new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit"});

const Badge = ({status,confidence}:{status:Confidence;confidence:number}) => {
  const m = {
    high:     {bg:"#052e16",color:"#4ade80",label:`✅ ${Math.round(confidence*100)}%`},
    medium:   {bg:"#431407",color:"#fb923c",label:`⚠ ${Math.round(confidence*100)}%`},
    low:      {bg:"#450a0a",color:"#f87171",label:`❌ ${Math.round(confidence*100)}%`},
    unmapped: {bg:"#1e1b4b",color:"#a78bfa",label:"UNMAPPED"},
  };
  const s = m[status];
  return <span style={{background:s.bg,color:s.color,fontSize:11,fontWeight:700,padding:"2px 7px",borderRadius:4,whiteSpace:"nowrap" as const}}>{s.label}</span>;
};
const PDFViewer = ({highlight,page,onPage}:{highlight:Field|null;page:number;onPage:(p:number)=>void}) => {
  const rows = PDF_PAGES[page]||PDF_PAGES[1];
  return (
    <div style={{display:"flex",flexDirection:"column" as const,height:"100%"}}>
      <div style={{background:"#0d1b2e",borderBottom:"1px solid #1a2744",padding:"6px 12px",display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:11,color:"#475569",fontWeight:700}}>DOCUMENT</span>
        {[1,2,3].map(p=>(
          <button key={p} onClick={()=>onPage(p)} style={{padding:"2px 8px",borderRadius:4,border:"none",cursor:"pointer",fontSize:11,background:page===p?"#1d4ed8":"#1a2744",color:page===p?"#fff":"#64748b"}}>{p}</button>
        ))}
        {highlight&&<span style={{marginLeft:"auto",fontSize:11,color:"#60a5fa"}}>Showing: {highlight.label}</span>}
      </div>
      <div style={{flex:1,overflowY:"auto" as const,background:"#fff",padding:20,fontFamily:"monospace",fontSize:12}}>
        <div style={{textAlign:"center",marginBottom:12,fontSize:10,color:"#666",borderBottom:"1px solid #ddd",paddingBottom:8}}>Page {page} of 3 — Financial Statement FY 2024-25</div>
        <table style={{width:"100%",borderCollapse:"collapse" as const}}>
          <tbody>
            {rows.map(([label,value],i)=>{
              const isHeader = value==="";
              const isHighlighted = highlight?.label===label && highlight?.page===page;
              return (
                <tr key={i} style={{background:isHighlighted?"#fef08a":"transparent",transition:"background 0.3s"}}>
                  <td style={{padding:"4px 8px",fontWeight:isHeader?700:400,paddingLeft:isHeader?0:16,fontSize:11,color:isHeader?"#1a1a1a":"#333"}}>
                    {isHighlighted&&<span style={{color:"#d97706",marginRight:4}}>►</span>}
                    {label}
                  </td>
                  <td style={{padding:"4px 8px",textAlign:"right" as const,fontWeight:isHighlighted?700:400,color:isHighlighted?"#92400e":"#1a1a1a"}}>{value}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ExtractionTable = ({fields,selected,filter,onSelect,onEdit,onAddRow}:{
  fields:Field[];selected:string|null;filter:string;
  onSelect:(f:Field)=>void;onEdit:(f:Field,val:string)=>void;onAddRow:(section:string,subsection:string)=>void;
}) => {
  const [editId,setEditId] = useState<string|null>(null);
  const [editVal,setEditVal] = useState("");
  const sections = ["Balance Sheet","Profit & Loss","Cash Flow"];
  const filtered = filter==="all"?fields:fields.filter(f=>f.status===filter);
  return (
    <div style={{height:"100%",overflowY:"auto" as const}}>
      {sections.map(sec=>{
        const secFields = filtered.filter(f=>f.section===sec);
        if(!secFields.length&&filter!=="all") return null;
        const subsections = [...new Set(fields.filter(f=>f.section===sec).map(f=>f.subsection))];
        return (
          <div key={sec}>
            <div style={{background:"#0d1b2e",padding:"6px 12px",fontSize:12,fontWeight:700,color:"#60a5fa",borderBottom:"1px solid #1a2744",position:"sticky" as const,top:0,zIndex:2}}>
              {sec} — {fields.filter(f=>f.section===sec).length} fields
            </div>
            {subsections.map(sub=>{
              const subFields = (filter==="all"?fields:filtered).filter(f=>f.section===sec&&f.subsection===sub);
              if(!subFields.length&&filter!=="all") return null;
              return (
                <div key={sub}>
                  <div style={{background:"#0a1628",padding:"4px 12px 4px 20px",fontSize:11,color:"#475569",fontWeight:600,borderBottom:"1px solid #111d33"}}>
                    {sub}
                  </div>
                  <table style={{width:"100%",borderCollapse:"collapse" as const}}>
                    <tbody>
                      {(filter==="all"?fields:filtered).filter(f=>f.section===sec&&f.subsection===sub).map(f=>{
                        const isSel = selected===f.id;
                        const isEditing = editId===f.id;
                        return (
                          <tr key={f.id}
                            onClick={()=>onSelect(f)}
                            style={{background:isSel?"#1e3a5f":"transparent",borderBottom:"1px solid #0f1f38",cursor:"pointer",transition:"background 0.15s"}}
                            onMouseEnter={e=>{if(!isSel)(e.currentTarget as HTMLTableRowElement).style.background="#111d33";}}
                            onMouseLeave={e=>{if(!isSel)(e.currentTarget as HTMLTableRowElement).style.background="transparent";}}>
                            <td style={{padding:"7px 8px 7px 28px",fontSize:13,color:f.corrected?"#34d399":f.isNew?"#a78bfa":"#e2e8f0",width:"44%"}}>
                              {f.label}
                              {f.corrected&&<span style={{fontSize:10,color:"#34d399",marginLeft:6}}>✓ corrected</span>}
                              {f.isNew&&<span style={{fontSize:10,color:"#a78bfa",marginLeft:6}}>★ new</span>}
                            </td>
                            <td style={{padding:"7px 8px",fontSize:12,color:"#94a3b8",textAlign:"right" as const,width:"25%",fontFamily:"monospace"}}>
                              {isEditing?(
                                <input autoFocus value={editVal}
                                  onChange={e=>setEditVal(e.target.value)}
                                  onKeyDown={e=>{if(e.key==="Enter"){onEdit(f,editVal);setEditId(null);}if(e.key==="Escape")setEditId(null);}}
                                  onBlur={()=>{if(editVal!==f.value)onEdit(f,editVal);setEditId(null);}}
                                  onClick={e=>e.stopPropagation()}
                                  style={{background:"#0f172a",border:"1px solid #60a5fa",borderRadius:4,color:"#e2e8f0",padding:"2px 6px",fontSize:12,width:120,fontFamily:"monospace",textAlign:"right" as const}}/>
                              ):(
                                <span onDoubleClick={e=>{e.stopPropagation();setEditId(f.id);setEditVal(f.value);}} title="Double-click to edit" style={{cursor:"text"}}>{f.value}</span>
                              )}
                            </td>
                            <td style={{padding:"7px 8px",textAlign:"center" as const,width:"18%"}}><Badge status={f.status} confidence={f.confidence}/></td>
                            <td style={{padding:"7px 8px",fontSize:11,color:"#334155",textAlign:"center" as const,width:"13%"}}>Pg {f.page}</td>
                          </tr>
                        );
                      })}
                      {filter==="all"&&(
                        <tr>
                          <td colSpan={4} style={{padding:"4px 28px"}}>
                            <button onClick={e=>{e.stopPropagation();onAddRow(sec,sub);}}
                              style={{background:"transparent",border:"1px dashed #1e3a5f",color:"#334155",fontSize:11,padding:"3px 10px",borderRadius:4,cursor:"pointer",width:"100%",textAlign:"left" as const}}>
                              + Add field to {sub}
                            </button>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

const RatioRow = ({ratio}:{ratio:Ratio}) => {
  const [expanded,setExpanded] = useState(false);
  return (
    <>
      <tr onClick={()=>setExpanded(e=>!e)} style={{borderBottom:"1px solid #0f1f38",cursor:"pointer",background:ratio.flag?"#1a0a0a":"transparent"}}
        onMouseEnter={e=>{(e.currentTarget as HTMLTableRowElement).style.background=ratio.flag?"#200d0d":"#111d33";}}
        onMouseLeave={e=>{(e.currentTarget as HTMLTableRowElement).style.background=ratio.flag?"#1a0a0a":"transparent";}}>
        <td style={{padding:"10px 12px",fontSize:13,color:"#e2e8f0",width:"26%"}}>
          <span style={{marginRight:6,color:"#334155",fontSize:10}}>{expanded?"▼":"▶"}</span>
          {ratio.label}
        </td>
        <td style={{padding:"10px 12px",fontSize:12,color:"#64748b",width:"34%",fontFamily:"monospace"}}>{ratio.formula}</td>
        <td style={{padding:"10px 12px",fontSize:16,fontWeight:700,color:ratio.flag?"#f87171":"#4ade80",textAlign:"right" as const,width:"16%"}}>
          {ratio.value}{ratio.unit&&ratio.value!=="N/A"?ratio.unit:""}
        </td>
        <td style={{padding:"10px 12px",fontSize:11,color:"#475569",textAlign:"center" as const,width:"12%"}}>{ratio.benchmark}</td>
        <td style={{padding:"10px 12px",textAlign:"center" as const,width:"12%"}}>
          {ratio.flag
            ?<span style={{background:"#450a0a",color:"#f87171",fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:4}}>⚠ BELOW</span>
            :ratio.benchmark?<span style={{background:"#052e16",color:"#4ade80",fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:4}}>✅ GOOD</span>
            :<span style={{color:"#334155",fontSize:11}}>—</span>
          }
        </td>
      </tr>
      {expanded&&(
        <tr style={{background:"#060d1a",borderBottom:"1px solid #0f1f38"}}>
          <td colSpan={5} style={{padding:"8px 12px 8px 32px"}}>
            <div style={{fontSize:12,color:"#64748b",marginBottom:4}}>Full Calculation:</div>
            <div style={{fontFamily:"monospace",fontSize:13,color:"#94a3b8",background:"#0a1628",padding:"8px 12px",borderRadius:6,borderLeft:"3px solid #1d4ed8"}}>
              {ratio.label} = {ratio.formulaDetail} = <span style={{color:ratio.flag?"#f87171":"#4ade80",fontWeight:700}}>{ratio.value}{ratio.unit&&ratio.value!=="N/A"?ratio.unit:""}</span>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

const AuditLog = ({entries}:{entries:AuditEntry[]}) => (
  <div style={{background:"#0f172a",borderRadius:6,padding:16,height:"100%",overflowY:"auto" as const}}>
    <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:12,letterSpacing:1,textTransform:"uppercase" as const}}>Audit Trail — {entries.length} events</div>
    {entries.length===0&&<div style={{color:"#334155",fontSize:12,textAlign:"center" as const,marginTop:40}}>No events yet. Start reviewing.</div>}
    {[...entries].reverse().map(e=>(
      <div key={e.id} style={{borderLeft:"2px solid #1e40af",paddingLeft:10,marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
          <span style={{fontSize:11,fontWeight:700,color:"#60a5fa"}}>{e.event}</span>
          <span style={{fontSize:10,color:"#475569"}}>{e.timestamp}</span>
        </div>
        <div style={{fontSize:11,color:"#94a3b8"}}>Field: <span style={{color:"#e2e8f0"}}>{e.field}</span></div>
        {e.originalValue&&<div style={{fontSize:11,color:"#94a3b8"}}>Before: <span style={{color:"#f87171"}}>{e.originalValue}</span></div>}
        {e.newValue&&<div style={{fontSize:11,color:"#94a3b8"}}>After: <span style={{color:"#4ade80"}}>{e.newValue}</span></div>}
        {e.method&&<div style={{fontSize:11,color:"#94a3b8"}}>Method: <span style={{color:"#a78bfa"}}>{e.method}</span></div>}
      </div>
    ))}
  </div>
);
export default function App() {
  const [screen, setScreen] = useState<1|2|3>(1);
  const [fields, setFields] = useState<Field[]>(SAMPLE_FIELDS);
  const [selected, setSelected] = useState<Field|null>(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [filter, setFilter] = useState("all");
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [uploaded, setUploaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string|null>(null);
  const [exported, setExported] = useState(false);
  const [expandedRatio, setExpandedRatio] = useState<string|null>(null);
  const [showCustomRatio, setShowCustomRatio] = useState(false);
  const [customRatios, setCustomRatios] = useState<Ratio[]>([]);
  const [crName, setCrName] = useState("");
  const [crNum, setCrNum] = useState("");
  const [crDen, setCrDen] = useState("");
  const [crMult, setCrMult] = useState("1");
  const auditRef = useRef(0);

  const addAudit = useCallback((e:Omit<AuditEntry,"id"|"timestamp">) => {
    setAudit(a=>[...a,{...e,id:String(++auditRef.current),timestamp:now()}]);
  },[]);

  const stats = {
    total:fields.length,
    high:fields.filter(f=>f.status==="high").length,
    medium:fields.filter(f=>f.status==="medium").length,
    low:fields.filter(f=>f.status==="low").length,
    unmapped:fields.filter(f=>f.status==="unmapped").length,
  };

  const handleSelect = (f:Field) => {
    setSelected(f);
    setPdfPage(f.page);
    addAudit({event:"VIEWED",field:f.label});
  };

  const handleEdit = (f:Field, newVal:string) => {
    if(newVal===f.value) return;
    setFields(prev=>prev.map(x=>x.id===f.id?{...x,value:newVal,confidence:1,status:"high" as Confidence,corrected:true}:x));
    addAudit({event:"CORRECTION",field:f.label,originalValue:f.value,newValue:newVal,method:"inline_edit"});
  };

  const handleAddRow = (section:string, subsection:string) => {
    const id = "new_"+Date.now();
    const newField:Field = {id,label:"New Field",value:"0",confidence:0,status:"unmapped",section,subsection,page:1,isNew:true};
    setFields(prev=>[...prev,newField]);
    addAudit({event:"NEW_FIELD_ADDED",field:`${section} > ${subsection}`});
  };

  const handleUpload = async (file:File) => {
    setUploading(true);
    setUploadError(null);
    addAudit({event:"DOCUMENT_UPLOADED",field:file.name});
    try {
      const result = await extractFromFile(file);
      if(result.error) { setUploadError(result.error); }
      else {
        setFields(result.tree as any);
        setUploaded(true);
        addAudit({event:"EXTRACTION_COMPLETE",field:file.name,newValue:`${result.tree.length} sections extracted`});
      }
    } catch(err) { setUploadError(String(err)); }
    setUploading(false);
  };

  const handleAddCustomRatio = () => {
    if(!crName||!crNum||!crDen) return;
    const numField = fields.find(f=>f.id===crNum);
    const denField = fields.find(f=>f.id===crDen);
    if(!numField||!denField) return;
    const numVal = parseFloat(numField.value.replace(/,/g,""))||0;
    const denVal = parseFloat(denField.value.replace(/,/g,""))||0;
    const mult = parseFloat(crMult)||1;
    const val = denVal ? (numVal/denVal)*mult : 0;
    const newRatio:Ratio = {
      label:crName,
      formula:`${numField.label} ÷ ${denField.label}${mult!==1?` × ${mult}`:""}`,
      formulaDetail:`${fmt(numVal)} ÷ ${fmt(denVal)}${mult!==1?` × ${mult}`:""}`,
      value:val.toFixed(2), benchmark:"", flag:false, unit:mult===100?"%":"x"
    };
    setCustomRatios(r=>[...r,newRatio]);
    addAudit({event:"CUSTOM_RATIO_CREATED",field:crName,newValue:newRatio.formula});
    setCrName(""); setCrNum(""); setCrDen(""); setCrMult("1");
    setShowCustomRatio(false);
  };

  const ratios = calcRatios(fields);
  const allRatios = [...ratios,...customRatios];
  const inputStyle = {background:"#0f172a",border:"1px solid #1e3a5f",borderRadius:6,color:"#e2e8f0",padding:"6px 10px",fontSize:13,width:"100%",boxSizing:"border-box" as const};
  const selectStyle = {...inputStyle};

  return (
    <div style={{fontFamily:"system-ui,sans-serif",background:"#060d1a",minHeight:"100vh",color:"#e2e8f0",display:"flex",flexDirection:"column" as const}}>

      {/* HEADER */}
      <div style={{background:"#0d1b2e",borderBottom:"1px solid #1e3a5f",padding:"10px 20px",display:"flex",alignItems:"center",gap:16,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:28,height:28,background:"linear-gradient(135deg,#1d4ed8,#0891b2)",borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"white",fontWeight:700}}>P</div>
          <span style={{fontWeight:700,fontSize:15,color:"#f1f5f9"}}>Perfios</span>
          <span style={{color:"#334155",fontSize:13}}>/ AI Spreading</span>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:4}}>
          {([{n:1,label:"01  Extract & Verify"},{n:2,label:"02  Ratios & Analysis"},{n:3,label:"03  Export"}] as const).map(({n,label})=>(
            <button key={n} onClick={()=>setScreen(n)} style={{padding:"6px 16px",borderRadius:6,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:screen===n?"#1d4ed8":"#1a2744",color:screen===n?"#fff":"#64748b"}}>
              {label}
            </button>
          ))}
        </div>
        <div style={{display:"flex",gap:12,marginLeft:16}}>
          {(["high","medium","low","unmapped"] as const).map(s=>({high:"#4ade80",medium:"#fb923c",low:"#f87171",unmapped:"#a78bfa"})[s]&&(
            <span key={s} style={{fontSize:11,color:{high:"#4ade80",medium:"#fb923c",low:"#f87171",unmapped:"#a78bfa"}[s]}}>
              {stats[s]} {s}
            </span>
          ))}
        </div>
      </div>

      {/* SCREEN 1 — EXTRACT & VERIFY */}
      {screen===1&&(
        <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 1fr",gridTemplateRows:"auto 1fr",minHeight:0}}>
          {/* Filter + upload bar */}
          <div style={{gridColumn:"1/-1",background:"#0d1b2e",borderBottom:"1px solid #1a2744",padding:"7px 16px",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
            <span style={{fontSize:11,color:"#475569"}}>FILTER:</span>
            {["all","high","medium","low","unmapped"].map(f=>(
              <button key={f} onClick={()=>setFilter(f)} style={{padding:"3px 10px",borderRadius:4,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,background:filter===f?"#1d4ed8":"#1a2744",color:filter===f?"#fff":"#64748b"}}>
                {f.toUpperCase()}{f!=="all"?` (${stats[f as keyof typeof stats]})` :""}
              </button>
            ))}
            <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:11,color:"#475569"}}>Click row → highlight in PDF  |  Double-click value → edit inline  |  + Add new field</span>
              <label style={{cursor:"pointer",background:uploading?"#1a2744":"#1d4ed8",color:uploading?"#475569":"white",padding:"4px 14px",borderRadius:6,fontSize:11,fontWeight:700,flexShrink:0}}>
                {uploading?"Processing...":"Upload Document"}
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)handleUpload(f);}}/>
              </label>
            </div>
          </div>

          {/* Extraction table */}
          <div style={{background:"#060d1a",borderRight:"1px solid #1a2744",overflow:"hidden",display:"flex",flexDirection:"column" as const,minHeight:0}}>
            <div style={{background:"#0a1628",borderBottom:"1px solid #1a2744",padding:"6px 12px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
              <span style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase" as const,letterSpacing:1}}>Extracted Data — {stats.total} fields</span>
              {uploadError&&<span style={{fontSize:11,color:"#f87171"}}>{uploadError}</span>}
            </div>
            <div style={{flex:1,overflowY:"auto" as const}}>
              <ExtractionTable fields={fields} selected={selected?.id||null} filter={filter} onSelect={handleSelect} onEdit={handleEdit} onAddRow={handleAddRow}/>
            </div>
          </div>

          {/* PDF viewer */}
          <div style={{background:"#1a1a2e",overflow:"hidden",display:"flex",flexDirection:"column" as const,minHeight:0}}>
            <PDFViewer highlight={selected} page={pdfPage} onPage={setPdfPage}/>
          </div>
        </div>
      )}

      {/* SCREEN 2 — RATIOS & ANALYSIS */}
      {screen===2&&(
        <div style={{flex:1,overflowY:"auto" as const,padding:28}}>
          <div style={{maxWidth:1100,margin:"0 auto"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <div>
                <div style={{fontSize:22,fontWeight:700,color:"#f1f5f9"}}>Financial Ratio Analysis</div>
                <div style={{fontSize:13,color:"#64748b",marginTop:4}}>Click any ratio to expand the full calculation  |  All values from verified extraction</div>
              </div>
              <button onClick={()=>setShowCustomRatio(s=>!s)} style={{background:"#1d4ed8",border:"none",color:"white",padding:"8px 18px",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:600}}>
                + Custom Ratio
              </button>
            </div>

            {/* Custom ratio builder */}
            {showCustomRatio&&(
              <div style={{background:"#0d1b2e",border:"1px solid #1e3a5f",borderRadius:10,padding:20,marginBottom:24}}>
                <div style={{fontSize:15,fontWeight:700,color:"#f1f5f9",marginBottom:16}}>Build a Custom Ratio</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12,marginBottom:16}}>
                  <div>
                    <div style={{fontSize:11,color:"#64748b",marginBottom:4}}>RATIO NAME</div>
                    <input value={crName} onChange={e=>setCrName(e.target.value)} placeholder="e.g. Net NPA Ratio" style={inputStyle}/>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:"#64748b",marginBottom:4}}>NUMERATOR</div>
                    <select value={crNum} onChange={e=>setCrNum(e.target.value)} style={selectStyle}>
                      <option value="">Select field...</option>
                      {fields.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:"#64748b",marginBottom:4}}>DENOMINATOR</div>
                    <select value={crDen} onChange={e=>setCrDen(e.target.value)} style={selectStyle}>
                      <option value="">Select field...</option>
                      {fields.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:"#64748b",marginBottom:4}}>MULTIPLY BY</div>
                    <select value={crMult} onChange={e=>setCrMult(e.target.value)} style={selectStyle}>
                      <option value="1">1 (ratio / absolute)</option>
                      <option value="100">100 (percentage %)</option>
                    </select>
                  </div>
                </div>
                {crNum&&crDen&&(()=>{
                  const nf=fields.find(f=>f.id===crNum);
                  const df=fields.find(f=>f.id===crDen);
                  if(!nf||!df) return null;
                  return <div style={{fontSize:13,color:"#60a5fa",background:"#0a1628",padding:"8px 12px",borderRadius:6,marginBottom:12,fontFamily:"monospace"}}>
                    Preview: {crName||"Ratio"} = {nf.label} ÷ {df.label}{crMult==="100"?" × 100":""}
                  </div>;
                })()}
                <div style={{display:"flex",gap:8}}>
                  <button onClick={handleAddCustomRatio} style={{background:"#1d4ed8",border:"none",color:"white",padding:"8px 18px",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:600}}>Add Ratio</button>
                  <button onClick={()=>setShowCustomRatio(false)} style={{background:"transparent",border:"1px solid #1e3a5f",color:"#64748b",padding:"8px 18px",borderRadius:6,cursor:"pointer",fontSize:13}}>Cancel</button>
                </div>
              </div>
            )}

            {/* Ratio table */}
            <div style={{background:"#0a1628",borderRadius:10,border:"1px solid #1a2744",overflow:"hidden"}}>
              <table style={{width:"100%",borderCollapse:"collapse" as const}}>
                <thead>
                  <tr style={{background:"#0d1b2e"}}>
                    <th style={{padding:"10px 12px",textAlign:"left" as const,fontSize:12,color:"#475569",fontWeight:600,width:"26%"}}>Ratio</th>
                    <th style={{padding:"10px 12px",textAlign:"left" as const,fontSize:12,color:"#475569",fontWeight:600,width:"34%"}}>Formula</th>
                    <th style={{padding:"10px 12px",textAlign:"right" as const,fontSize:12,color:"#475569",fontWeight:600,width:"16%"}}>Value</th>
                    <th style={{padding:"10px 12px",textAlign:"center" as const,fontSize:12,color:"#475569",fontWeight:600,width:"12%"}}>Benchmark</th>
                    <th style={{padding:"10px 12px",textAlign:"center" as const,fontSize:12,color:"#475569",fontWeight:600,width:"12%"}}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {allRatios.map(r=><RatioRow key={r.label} ratio={r}/>)}
                </tbody>
              </table>
            </div>

            {/* Summary cards */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16,marginTop:24}}>
              {[
                {label:"Fields Flagged Below Benchmark",value:allRatios.filter(r=>r.flag).length,color:"#f87171",bg:"#450a0a"},
                {label:"Ratios All Clear",value:allRatios.filter(r=>!r.flag&&r.benchmark).length,color:"#4ade80",bg:"#052e16"},
                {label:"Total Ratios Calculated",value:allRatios.length,color:"#60a5fa",bg:"#0f1f38"},
              ].map(c=>(
                <div key={c.label} style={{background:c.bg,border:`1px solid ${c.color}22`,borderRadius:10,padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:13,color:"#94a3b8"}}>{c.label}</span>
                  <span style={{fontSize:32,fontWeight:700,color:c.color}}>{c.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SCREEN 3 — EXPORT */}
      {screen===3&&(
        <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 1fr",minHeight:0}}>
          <div style={{padding:28,overflowY:"auto" as const}}>
            <div style={{fontSize:22,fontWeight:700,color:"#f1f5f9",marginBottom:4}}>Export Package</div>
            <div style={{fontSize:13,color:"#64748b",marginBottom:24}}>Review summary and download all files</div>
            {[
              {label:"Total Fields Extracted",value:stats.total,color:"#60a5fa"},
              {label:"Auto-Approved (≥ 90% confidence)",value:stats.high,color:"#4ade80"},
              {label:"Manually Corrected",value:audit.filter(e=>e.event==="CORRECTION").length,color:"#fb923c"},
              {label:"Ratios Calculated",value:allRatios.length,color:"#a78bfa"},
              {label:"Audit Trail Events",value:audit.length,color:"#34d399"},
            ].map(c=>(
              <div key={c.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",background:"#0f1f38",borderRadius:8,marginBottom:8,border:"1px solid #1a2744"}}>
                <span style={{fontSize:13,color:"#94a3b8"}}>{c.label}</span>
                <span style={{fontSize:24,fontWeight:700,color:c.color}}>{c.value}</span>
              </div>
            ))}
            <div style={{marginTop:24,display:"flex",flexDirection:"column" as const,gap:10}}>
              {[
                {icon:"📊",label:"Download CAM Report (.xlsx)",sub:"Populated Excel with all verified values",color:"#166534",bg:"#052e16"},
                {icon:"📋",label:"Download Audit Trail (.json)",sub:"Machine-readable log of every event",color:"#1e40af",bg:"#0f172a"},
                {icon:"📄",label:"Download Audit PDF (.pdf)",sub:"Formatted for regulators — MAS, OCC, EBA compliant",color:"#6d28d9",bg:"#0f0a1e"},
              ].map(b=>(
                <button key={b.label} onClick={()=>setExported(true)} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 18px",borderRadius:10,border:`1px solid ${b.color}`,background:b.bg,cursor:"pointer",color:"white",width:"100%",textAlign:"left" as const}}>
                  <span style={{fontSize:22}}>{b.icon}</span>
                  <div>
                    <div style={{fontSize:14,fontWeight:700}}>{b.label}</div>
                    <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{b.sub}</div>
                  </div>
                </button>
              ))}
            </div>
            {exported&&(
              <div style={{marginTop:16,padding:"12px 16px",background:"#052e16",border:"1px solid #166534",borderRadius:8,fontSize:13,color:"#4ade80"}}>
                ✅ Export complete — all files ready. Audit trail sealed.
              </div>
            )}
          </div>
          <div style={{padding:16,overflowY:"auto" as const}}>
            <AuditLog entries={audit}/>
          </div>
        </div>
      )}
    </div>
  );
}