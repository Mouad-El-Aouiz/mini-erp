"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { EntityPicker, type EntityOption } from "../entity-picker";
import type { DraftView } from "@/lib/order-types";
import { calculateDraftTotals } from "@/lib/order-money";
import { updateDraftSchema, orderQuantityTextSchema } from "@/lib/validation/order";
import { formatUsd } from "@/lib/validation/product";
import styles from "../../business.module.css";
type Line=DraftView["items"][number]&{quantityText:string};
const quantityValue=(text:string)=>{const result=orderQuantityTextSchema.safeParse(text);return result.success?result.data:NaN;};
const linesFor=(order:DraftView)=>order.items.map(item=>({...item,quantityText:String(item.quantity)}));
export function DraftEditor({tenantId,initial}:{tenantId:string;initial:DraftView}) {
  const router=useRouter();const [draft,setDraft]=useState(initial),[lines,setLines]=useState<Line[]>(linesFor(initial));
  const [customer,setCustomer]=useState<EntityOption>({id:initial.customerId,label:initial.customer.companyName});
  const [product,setProduct]=useState<EntityOption|null>(null),[pending,setPending]=useState(false);
  const [error,setError]=useState(""),[notice,setNotice]=useState("");
  const api=`/api/tenants/${tenantId}/orders/${draft.id}`;
  const dirty=customer.id!==draft.customerId||JSON.stringify(lines.map(line=>[line.productId,line.quantityText]))!==JSON.stringify(draft.items.map(line=>[line.productId,String(line.quantity)]));
  let totals:DraftView["totals"]|null=null;
  try {totals=calculateDraftTotals(lines.map(line=>({quantity:quantityValue(line.quantityText),unitPriceCents:line.unitPriceCents})),draft.totals.taxRateBps);}catch{}
  async function reload() {
    const response=await fetch(api,{credentials:"same-origin",cache:"no-store"});const body=await response.json();
    if(!response.ok)throw new Error(body.error??"Unable to reload draft.");
    const order=body.order as DraftView;setDraft(order);setLines(linesFor(order));setCustomer({id:order.customerId,label:order.customer.companyName});setProduct(null);router.refresh();
  }
  async function perform(url:string,method:string,input:unknown,message:string) {
    if(pending)return;setPending(true);setError("");setNotice("");
    try {
      const response=await fetch(url,{method,credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)});
      const body=await response.json();if(!response.ok){setError(body.error??"Unable to save draft.");return;}
      await reload();setNotice(message);
    } catch(error){setError(error instanceof Error&&error.message!=="Failed to fetch"?error.message:"Unable to complete the request. Reload the draft before retrying.");}
    finally{setPending(false);}
  }
  function addProduct() {
    if(!product)return;
    const existing=lines.find(line=>line.productId===product.id);
    if(existing){const quantity=quantityValue(existing.quantityText);if(!Number.isInteger(quantity)||quantity<1||quantity>=1000000){setError("Correct the quantity before adding this product again.");return;}
      setLines(lines.map(line=>line.productId===product.id?{...line,quantityText:String(quantity+1)}:line));
    } else {
      if(lines.length>=100){setError("A draft can contain at most 100 product lines.");return;}
      setLines([...lines,{productId:product.id,productName:product.name!,productSku:product.sku!,quantity:1,quantityText:"1",
        unitPriceCents:product.unitPriceCents!,currentUnitPriceCents:product.unitPriceCents!,priceChanged:false,lineTotalCents:product.unitPriceCents!}]);
    }
    setProduct(null);setError("");setNotice("");
  }
  function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();const input=updateDraftSchema.safeParse({version:draft.version,customerId:customer.id,
      items:lines.map(line=>({productId:line.productId,quantity:quantityValue(line.quantityText)}))});
    if(!input.success){setError("Choose a customer and use whole quantities from 1 to 1000000; at most 100 distinct products.");return;}
    void perform(api,"PUT",input.data,"Draft saved.");
  }
  return <>
    <p>Status: Draft · Version: {draft.version}. Drafts do not reserve or consume stock.</p>
    <form onSubmit={save} noValidate aria-busy={pending}>
      <fieldset disabled={pending} className={styles.fields}>
        <legend className="sr-only">Draft order details</legend>
        <EntityPicker tenantId={tenantId} kind="customers" label="Customer" value={customer.id} selectedLabel={customer.label} onChange={option=>setCustomer(option??{id:"",label:""})} disabled={pending}/>
        <section><h2>Product lines</h2>
          {lines.length===0?<p>No product lines yet.</p>:<ul className={styles.list} aria-label="Draft lines">{lines.map(line=><li key={line.productId} className={styles.card}>
            <h3>{line.productName}</h3><p>SKU: {line.productSku}</p><p>Captured unit price: {formatUsd(line.unitPriceCents)} USD</p>
            {line.priceChanged&&<p className={styles.notice}>Catalog price changed: {formatUsd(line.currentUnitPriceCents)} USD. The captured price is retained.</p>}
            <div className={styles.field}><label htmlFor={`quantity-${line.productId}`}>Quantity for {line.productName}</label>
              <input id={`quantity-${line.productId}`} value={line.quantityText} type="text" inputMode="numeric" maxLength={7} required onChange={event=>setLines(lines.map(item=>item.productId===line.productId?{...item,quantityText:event.target.value}:item))}/>
            </div>
            <div className={styles.actions}><button type="button" aria-label={`Remove ${line.productName}`} onClick={()=>setLines(lines.filter(item=>item.productId!==line.productId))}>Remove line</button></div>
          </li>)}</ul>}
          <div className={styles.card}><EntityPicker tenantId={tenantId} kind="products" label="Product to add" value={product?.id??""} selectedLabel={product?.label} onChange={setProduct} disabled={pending}/>
            <div className={styles.actions}><button type="button" disabled={!product||pending} onClick={addProduct}>Add product</button></div>
          </div>
        </section>
        <section className={styles.card} aria-labelledby="totals-title"><h2 id="totals-title">Draft totals preview</h2>
          <p>The server recalculates saved totals. The current company tax rate applies to draft previews.</p>
          {totals?<><p>Subtotal: {formatUsd(totals.subtotalCents)} USD</p><p>Tax ({(totals.taxRateBps/100).toFixed(2)}%): {formatUsd(totals.taxCents)} USD</p><p><strong>Total: {formatUsd(totals.totalCents)} USD</strong></p></>:<p className={styles.error}>Correct quantities or reduce the subtotal to display totals.</p>}
        </section>
      </fieldset>
      <div className={styles.actions}><button type="submit" disabled={pending||!totals}>{pending?"Saving...":"Save draft"}</button></div>
    </form>
    <section><h2>Catalog prices</h2><p>Save your edits before accepting current catalog prices. Review the old and current prices above.</p>
      <button type="button" disabled={pending||dirty||!draft.items.some(item=>item.priceChanged)} onClick={()=>void perform(`${api}/refresh-prices`,"POST",{version:draft.version,prices:draft.items.map(item=>({productId:item.productId,unitPriceCents:item.currentUnitPriceCents}))},"Catalog prices accepted.")}>Accept current catalog prices</button>
    </section>
    <div className={styles.actions}><button type="button" disabled={pending} onClick={async()=>{setPending(true);setError("");setNotice("");try{await reload();setNotice("Draft reloaded.");}catch(error){setError(error instanceof Error?error.message:"Unable to reload draft.");}finally{setPending(false);}}}>Reload draft</button><span>Reload discards unsaved edits and fetches current catalog prices and tax settings.</span></div>
    <p role="alert" className={styles.error}>{error}</p><p role="status" className={styles.notice}>{notice}</p>
  </>;
}
