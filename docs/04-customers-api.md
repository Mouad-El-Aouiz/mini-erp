# Customers API

All endpoints require a valid session and active membership in the tenant named in the URL. Both ADMIN and EMPLOYEE may use them. Responses are private and not cacheable.

## Endpoints

| Method | Path | Success |
| --- | --- | --- |
| GET | /api/tenants/{tenantId}/customers?page=1 | 200: customer list and pagination |
| POST | /api/tenants/{tenantId}/customers | 201: created customer |
| GET | /api/tenants/{tenantId}/customers/{customerId} | 200: customer |
| PUT | /api/tenants/{tenantId}/customers/{customerId} | 200: replaced customer |

Identifiers must use UUID syntax. GET list accepts one page parameter, from 1 to 9999, default 1. Page size is 20. Order is companyName ascending, then id ascending. Unknown page numbers are not interpreted as cursors.

List response:

```json
{
  "customers": [],
  "page": 1,
  "pageSize": 20,
  "hasNextPage": false
}
```

POST, PUT and GET item return `{ "customer": { ... } }`. Customer fields are id, companyName, contactName, email, phone, address, createdAt and updatedAt. Timestamps are serialized as ISO date strings.

## Write Contract

POST and PUT require `Content-Type: application/json` and an exact `Origin` matching the origin of BETTER_AUTH_URL, including scheme and port. Missing, malformed and foreign origins are rejected. CLI clients must send the header explicitly and authenticate separately; an Origin header alone never grants access.

```json
{
  "companyName": "Atlas Computers",
  "contactName": "Jane Smith",
  "email": "buyer@example.com",
  "phone": "+212 0612 345678",
  "address": "10 Business Street"
}
```

The server chooses tenantId. Client-supplied tenantId, id, timestamps and any other unexpected fields are rejected. Company name is required; optional fields can be omitted or null. Empty strings become null after trimming. Duplicate company names are allowed.

PUT is a full replacement of editable coordinates, not a partial update: omitted optional fields are cleared. Company name must always be supplied. Record identity, ownership and creation timestamp remain unchanged.

## Errors

| Status | Meaning |
| --- | --- |
| 400 | Invalid tenant/customer identifier, page parameter or JSON body |
| 401 | Authentication required |
| 403 | Access denied or request origin not allowed |
| 404 | No customer with this ID in the authorized tenant |
| 405 | Method not implemented, including DELETE |
| 415 | Write body is not application/json |
| 422 | Customer validation failed |

An inaccessible customer is indistinguishable from a missing customer within an authorized tenant. Validation errors have this shape:

```json
{
  "error": "Invalid customer data.",
  "fieldErrors": {
    "companyName": ["Company name is required."]
  }
}
```

Unexpected server failures remain server errors; database error details are not included in the application error contract.
