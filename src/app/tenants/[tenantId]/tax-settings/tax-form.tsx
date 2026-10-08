"use client";
import { useState, type FormEvent } from "react";
import { taxPercentSchema } from "@/lib/validation/order";
import styles from "../business.module.css";
export function TaxForm({tenantId,initial}:{tenantId:string;initial:{version:number;taxRateBps:number}}) {
  const [settings,setSettings]=useState(initial),[value,setValue]=useState((initial.taxRateBps/100).toFixed(2));
  const [pending,setPending]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(pending)return;setError("");setNotice("");const rate=taxPercentSchema.safeParse(value);
    if(!rate.success){setError(rate.error.issues[0].message);return;}setPending(true);
    try{
      const response=await fetch(`/api/tenants/${tenantId}/tax-settings`,{method:"PUT",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({version:settings.version,taxRateBps:rate.data})});
      const body=await response.json();if(!response.ok){setError(body.error??"Unable to save tax settings.");return;}setSettings(body);setValue((body.taxRateBps/100).toFixed(2));setNotice("Tax settings saved.");
    }catch{setError("Unable to complete the request. Reload the page before retrying.");}finally{setPending(false);}
  }
  return <form onSubmit={submit} noValidate className={styles.form} aria-busy={pending}>
    <p>Demonstration tax rate from 0 to 100%, with two decimal places. This does not establish fiscal compliance.</p>
    <div className={styles.field}><label htmlFor="taxRate">Tax rate (%)</label><input id="taxRate" type="text" inputMode="decimal" maxLength={6} value={value} onChange={event=>setValue(event.target.value)} disabled={pending}/></div>
    <p role="alert" className={styles.error}>{error}</p><p role="status" className={styles.notice}>{notice}</p>
    <div className={styles.actions}><button type="submit" disabled={pending}>{pending?"Saving...":"Save tax settings"}</button></div>
  </form>;
}
