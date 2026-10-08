export type DraftView = {
  status:"DRAFT"|"CONFIRMED"|"DELIVERED"; id:string; version:number; customerId:string; customer:{id:string;companyName:string};
  items:{productId:string;productName:string;productSku:string;quantity:number;unitPriceCents:number;currentUnitPriceCents:number;priceChanged:boolean;lineTotalCents:number}[];
  totals:{subtotalCents:number;taxCents:number;totalCents:number;taxRateBps:number}; taxVersion:number;
};
