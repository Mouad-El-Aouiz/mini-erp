"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../../business.module.css";

export function DeliveryAction({tenantId,orderId,version}:{tenantId:string;orderId:string;version:number}) {
  const router=useRouter();const [pending,setPending]=useState(false),[error,setError]=useState("");
  async function deliver() {
    if(pending)return;setPending(true);setError("");
    try {
      const response=await fetch(`/api/tenants/${tenantId}/orders/${orderId}/deliver`,{method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},body:JSON.stringify({version})});
      const body=await response.json();
      if(!response.ok){setError(body.error??"Unable to record delivery.");return;}
      router.refresh();
    }catch{setError("Unable to complete the request. Reload the order to check whether delivery was recorded before retrying.");}
    finally{setPending(false);}
  }
  return <section className={styles.card} aria-busy={pending}><h2>Complete delivery</h2>
    <p>Record this only when the complete order has been handed over. All ordered quantities will leave physical stock and their reservations will be consumed.</p>
    <div className={styles.actions}><button type="button" disabled={pending} onClick={()=>void deliver()}>{pending?"Recording...":"Record complete delivery"}</button>
      <button type="button" disabled={pending} onClick={()=>{setError("");router.refresh();}}>Reload order</button></div>
    <p role="alert" className={styles.error}>{error}</p>
  </section>;
}
