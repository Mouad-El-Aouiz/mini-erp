# Products API

## Scope and permissions

Products belong to one tenant. All endpoints require an authenticated user with
an active membership in the URL's tenant. ADMIN and EMPLOYEE can read. Only
ADMIN can create or replace products, including prices. Browser controls do not
replace server authorization. Writes also require an Origin exactly matching
BETTER_AUTH_URL's origin. Responses use Cache-Control: private, no-store.

## Editable fields

| Field | Rule |
| --- | --- |
| sku | Required string, trimmed, ASCII letters/numbers/dot/hyphen/underscore, 1–64 characters, first character alphanumeric; normalized to uppercase |
| name | Required string, trimmed, 1–200 characters |
| unitPriceCents | Required integer JSON number, 0–2147483647; tax-exclusive USD cents |

Extra keys, including id, tenantId and timestamps, are rejected. Tenant ownership
comes from verified server access. Zero is accepted; negative and fractional
cents are rejected. The UI accepts decimal USD strings with at most two decimal
places and converts their digit components to cents without rounding. The
maximum supported unit price is 21474836.47 USD. Comma decimals, scientific
notation and leading zeros except the single zero are rejected in the form.

```json
{ "sku": "LAPTOP-01", "name": "Business laptop", "unitPriceCents": 12999 }
```

SKU uniqueness applies to (tenant_id, sku). The same SKU may exist in another
tenant. A database unique constraint handles concurrent writes; duplicates
return 409 with a field error, without leaking the other product's details.

## Endpoints

| Method | Path | Result |
| --- | --- | --- |
| GET | /api/tenants/{tenantId}/products?page=1 | 200: products, page, pageSize, hasNextPage |
| POST | /api/tenants/{tenantId}/products | 201: product |
| GET | /api/tenants/{tenantId}/products/{productId} | 200: product |
| PUT | /api/tenants/{tenantId}/products/{productId} | 200: product |

POST and PUT require application/json. PUT replaces all three editable fields;
it is not a partial update. Product records include id, sku, name,
unitPriceCents, createdAt and updatedAt. Timestamps serialize as ISO strings.
The API does not expose tenantId in the record.

Lists use 20 records per page, ordered by name then id. The single page parameter
accepts integers 1–9999 and defaults to 1. Pages past the end are empty. This is
offset pagination, not a snapshot across concurrent catalog changes.

## Expected errors

| Status | Meaning |
| --- | --- |
| 400 | Invalid identifier, page parameter or JSON |
| 401 | Authentication required |
| 403 | Missing/inactive membership, insufficient role or untrusted Origin |
| 404 | Product absent from the authorized tenant |
| 405 | Unsupported method, including DELETE and PATCH |
| 409 | SKU already used within this tenant |
| 415 | Content-Type is not application/json |
| 422 | Editable fields fail validation; fieldErrors explain individual fields |

Missing and other-tenant product IDs both return the same 404 within an
authorized tenant. Unexpected errors follow the framework's server-error path.

## Write consistency

Creation and replacement run in database transactions. The shared membership
row lock rechecks active status and ADMIN role, then holds that authorization
through the write. Revocation and role changes cannot commit in the middle of
an authorized mutation. Two administrators editing the same product use
last-write-wins semantics; optimistic edit conflict detection is deferred.

Catalog price edits do not implement order pricing. Orders must later capture
and validate their own price snapshots according to the business scope. Tax,
stock quantities, retirement, deletion, search and serial numbers are deferred.
