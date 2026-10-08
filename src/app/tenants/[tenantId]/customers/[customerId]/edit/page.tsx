import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCustomerPageAccess } from "@/lib/customer-page-access";
import { getCustomer, CustomerNotFoundError } from "@/lib/customer-data";
import { customerIdSchema } from "@/lib/validation/customer";
import { CustomerForm } from "../../customer-form";
import styles from "@/app/dashboard/workspace.module.css";

export default async function EditCustomerPage({ params }: {
  params: Promise<{ tenantId: string; customerId: string }>;
}) {
  const { tenantId, customerId } = await params;
  const access = await requireCustomerPageAccess(tenantId);
  if (!customerIdSchema.safeParse(customerId).success) notFound();
  const customer = await getCustomer(access, customerId).catch((error: unknown) => {
    if (error instanceof CustomerNotFoundError) notFound();
    throw error;
  });
  return (
    <main className={styles.workspace}>
      <Link href={`/tenants/${access.tenantId}/customers`} prefetch={false}>Back to customers</Link>
      <h1>Edit customer</h1>
      <p>Company: {access.tenantName}</p>
      <CustomerForm tenantId={access.tenantId} customer={{
        id: customer.id, companyName: customer.companyName, contactName: customer.contactName,
        email: customer.email, phone: customer.phone, address: customer.address,
      }} />
    </main>
  );
}
