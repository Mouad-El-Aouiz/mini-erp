"use client";
import { useEffect, useState } from "react";
import styles from "../business.module.css";
export type EntityOption={id:string;label:string;name?:string;sku?:string;unitPriceCents?:number};
export function EntityPicker({tenantId,kind,label,value,selectedLabel,onChange,disabled=false}:{
  tenantId:string;kind:"customers"|"products";label:string;value:string;selectedLabel?:string;
  onChange:(option:EntityOption|null)=>void;disabled?:boolean;
}) {
  const [page,setPage]=useState(1),[options,setOptions]=useState<EntityOption[]>([]);
  const [hasNext,setHasNext]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    async function load() {
      setLoading(true);setError("");
      try {
        const response=await fetch(`/api/tenants/${tenantId}/${kind}?page=${page}`,{credentials:"same-origin",signal:controller.signal});
        const body=await response.json();if(!response.ok) throw new Error(body.error??"Unable to load options.");
        setOptions(body[kind].map((row:{id:string;companyName?:string;name?:string;sku?:string;unitPriceCents?:number})=>
          ({...row,label:kind==="customers"?row.companyName:`${row.name} (${row.sku})`})));
        setHasNext(body.hasNextPage);
      } catch(error) {if(!controller.signal.aborted) setError(error instanceof Error?error.message:"Unable to load options.");}
      finally {if(!controller.signal.aborted) setLoading(false);}
    }
    void load();return()=>controller.abort();
  },[tenantId,kind,page,retry]);
  const id=`${kind}-picker`;
  return <div className={styles.field}>
    <label htmlFor={id}>{label}</label>
    <select id={id} value={value} disabled={disabled||loading||Boolean(error)} onChange={event=>{
      const option=options.find(option=>option.id===event.target.value);onChange(option??null);
    }}>
      <option value="">Choose {kind==="customers"?"a customer":"a product"}</option>
      {value&&!options.some(option=>option.id===value)&&<option value={value}>{selectedLabel??"Selected record"}</option>}
      {options.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
    <div className={styles.actions}>
      {page>1&&<button type="button" disabled={disabled||loading} onClick={()=>setPage(page-1)}>Previous {kind}</button>}
      <span>{kind==="customers"?"Customer":"Product"} page {page}{loading?" — Loading...":""}</span>
      {hasNext&&page<9999&&<button type="button" disabled={disabled||loading} onClick={()=>setPage(page+1)}>Next {kind}</button>}
    </div>
    {error&&<><p role="alert" className={styles.error}>{error}</p><button type="button" disabled={disabled} onClick={()=>setRetry(retry+1)}>Retry loading {kind}</button></>}
    {!loading&&!error&&options.length===0&&<p>No {kind} on this page. Add records from the company workspace.</p>}
  </div>;
}
