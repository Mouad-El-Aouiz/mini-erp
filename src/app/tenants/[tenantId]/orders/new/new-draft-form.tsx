"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { EntityPicker, type EntityOption } from "../entity-picker";
import styles from "../../business.module.css";
export function NewDraftForm({tenantId}:{tenantId:string}) {
  const router=useRouter();const [customer,setCustomer]=useState<EntityOption|null>(null);
  const [pending,setPending]=useState(false),[error,setError]=useState("");
  const attempt=useRef<{customerId:string;requestId:string}|null>(null);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(pending)return;
    if(!customer){setError("Choose a customer.");return;}
    if(attempt.current?.customerId!==customer.id)attempt.current={customerId:customer.id,requestId:crypto.randomUUID()};
    setPending(true);setError("");
    try {
      const response=await fetch(`/api/tenants/${tenantId}/orders`,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(attempt.current)});
      const body=await response.json();if(!response.ok){setError(body.error??"Unable to create draft.");return;}
      router.replace(`/tenants/${tenantId}/orders/${body.order.id}`);router.refresh();
    } catch {setError("Unable to reach the server. Keep the same customer and retry to avoid creating a second draft.");}
    finally{setPending(false);}
  }
  return <form onSubmit={submit} noValidate className={styles.form} aria-busy={pending}>
    <p>Choose the business customer. You can add product lines after creating the draft.</p>
    <EntityPicker tenantId={tenantId} kind="customers" label="Customer" value={customer?.id??""} selectedLabel={customer?.label} onChange={setCustomer} disabled={pending}/>
    <p role="alert" className={styles.error}>{error}</p>
    <div className={styles.actions}><button disabled={pending} type="submit">{pending?"Creating...":"Create draft"}</button></div>
  </form>;
}
