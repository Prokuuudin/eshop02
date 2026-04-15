# B2B API Documentation

## Overview

The B2B API provides integrations for professional customers (distributors and enterprises) to:

-   Browse and search the product catalog
-   Create and manage orders programmatically
-   Track invoices and record payments
-   Access purchase history and analytics

## Authentication

### API Key Authentication

Use API key in the `x-api-key` header:

```bash
curl -H "x-api-key: your-api-key-here" \
  https://api.example.com/api/v1/products
```

For company-scoped endpoints add `x-company-id`:

```bash
curl -H "x-api-key: your-api-key-here" \
  -H "x-company-id: company_123" \
  https://api.example.com/api/v1/invoices
```

### Session Authentication

Existing session users with `distributor` or `enterprise` role can access APIs directly.

## Base URL

```
https://example.com/api/v1
```

## Response Format

All responses follow this format:

```json
{
    "success": true,
    "data": {
        /* response data */
    },
    "timestamp": "2024-04-13T10:30:00Z"
}
```

Errors:

```json
{
    "error": "Error message",
    "timestamp": "2024-04-13T10:30:00Z"
}
```

## Rate Limiting

-   API key: 1000 requests/hour
-   Session auth: 500 requests/hour

## Endpoints

### Products

#### GET /products

List all products with role-specific pricing.

**Query Parameters:**

-   `page` (number, default: 1)
-   `limit` (number, default: 20, max: 100)
-   `category` (string, optional)
-   `search` (string, optional)
-   `minPrice` (number, optional)
-   `maxPrice` (number, optional)

**Example Request:**

```bash
GET /api/v1/products?category=skincare&limit=10 HTTP/1.1
x-api-key: your-api-key
```

**Example Response:**

```json
{
    "success": true,
    "data": {
        "products": [
            {
                "id": "p1",
                "title": "Крем Revitaluxe 50ml",
                "brand": "BeautyBrand",
                "sku": "REVIT-50-001",
                "price": 2400,
                "stock": 150,
                "rating": 4.8,
                "technicalSpecs": {
                    "volume": "50ml",
                    "type": "cream"
                },
                "bulkPricingTiers": [
                    { "quantity": 10, "pricePerUnit": 2400 },
                    { "quantity": 25, "pricePerUnit": 2300 }
                ]
            }
        ],
        "pagination": {
            "page": 1,
            "limit": 10,
            "total": 150,
            "pages": 15
        }
    }
}
```

### Orders

#### GET /orders

List company orders.

**Query Parameters:**

-   `page` (number, default: 1)
-   `limit` (number, default: 20, max: 100)
-   `status` (string, optional) - pending, processing, shipped, delivered, cancelled
-   `sortBy` (string, optional) - date, total, status
-   `sortOrder` (string, optional) - asc, desc

**Example:**

```bash
GET /api/v1/orders?status=delivered&sortBy=date&sortOrder=desc
x-api-key: your-api-key
```

#### POST /orders

Create a new order (API key required).

**Body:**

```json
{
    "items": [
        { "productId": "p1", "quantity": 5 },
        { "productId": "p2", "quantity": 2 }
    ],
    "address": {
        "street": "123 Main St",
        "city": "Saint Petersburg",
        "postCode": "190000",
        "country": "Russia"
    },
    "payment": "transfer",
    "notes": "Please ship ASAP"
}
```

**Response:**

```json
{
    "success": true,
    "data": {
        "orderId": "ORD-1712990400000-ABCDEF",
        "status": "processing",
        "createdAt": "2024-04-13T10:30:00Z"
    }
}
```

### Invoices

#### GET /invoices

List company invoices.

**Query Parameters:**

-   `page` (number, default: 1)
-   `limit` (number, default: 20, max: 100)
-   `status` (string, optional) - issued, paid, overdue, draft, cancelled
-   `sortBy` (string, optional) - date, amount, status

**Example:**

```bash
GET /api/v1/invoices?status=issued&sortBy=date
x-api-key: your-api-key
```

**Response:**

```json
{
    "success": true,
    "data": {
        "invoices": [
            {
                "id": "inv-123",
                "invoiceNumber": "INV-2024-001234",
                "orderId": "ORD-123",
                "status": "issued",
                "issuedDate": "2024-04-01T10:00:00Z",
                "dueDate": "2024-05-01T10:00:00Z",
                "subtotal": 10000,
                "tax": 1200,
                "total": 11200,
                "remaining": 11200
            }
        ],
        "summary": {
            "paidTotal": 50000,
            "pendingTotal": 11200,
            "overdueTotal": 5600
        }
    }
}
```

#### GET /invoices/:id

Get single invoice details.

#### POST /invoices/:id/payments

Record payment for an invoice (API key required).

**Body:**

```json
{
    "amount": 5000,
    "method": "bank_transfer",
    "reference": "TXN-2024-04-13-001"
}
```

**Response:**

```json
{
    "success": true,
    "data": {
        "invoiceId": "inv-123",
        "paymentRecorded": 5000,
        "remaining": 6200
    }
}
```

## Error Codes

| Code | Meaning                              |
| ---- | ------------------------------------ |
| 200  | OK                                   |
| 201  | Created                              |
| 400  | Bad Request                          |
| 401  | Unauthorized                         |
| 403  | Forbidden (insufficient permissions) |
| 404  | Not Found                            |
| 500  | Internal Server Error                |

## Common Errors

```json
{
    "error": "Invalid API key",
    "timestamp": "2024-04-13T10:30:00Z"
}
```

```json
{
    "error": "API access not available for your role",
    "timestamp": "2024-04-13T10:30:00Z"
}
```

## Examples

### Using cURL

**Get all products:**

```bash
curl -H "x-api-key: your-api-key" \
  https://api.example.com/api/v1/products
```

**Create an order:**

```bash
curl -X POST \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [{"productId": "p1", "quantity": 5}],
    "address": {"street": "123 Main", "city": "SPb"},
    "payment": "transfer"
  }' \
  https://api.example.com/api/v1/orders
```

### Using JavaScript/Node.js

```javascript
// Create order
const response = await fetch('https://api.example.com/api/v1/orders', {
    method: 'POST',
    headers: {
        'x-api-key': 'your-api-key',
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        items: [{ productId: 'p1', quantity: 5 }],
        address: { street: '123 Main', city: 'SPb' },
        payment: 'transfer',
    }),
});

const data = await response.json();
console.log('Order created:', data.data.orderId);
```

### Using Python

```python
import requests

headers = {'x-api-key': 'your-api-key'}

# Get products
response = requests.get(
  'https://api.example.com/api/v1/products',
  headers=headers,
  params={'limit': 20, 'category': 'skincare'}
)
products = response.json()['data']['products']

# Create order
order_data = {
  'items': [{'productId': 'p1', 'quantity': 5}],
  'address': {'street': '123 Main', 'city': 'SPb'},
  'payment': 'transfer'
}
response = requests.post(
  'https://api.example.com/api/v1/orders',
  headers=headers,
  json=order_data
)
order = response.json()['data']
```

## Webhooks (Phase 6.2)

Implemented endpoints:

-   `GET /api/v1/webhooks` - list endpoints and recent deliveries
-   `POST /api/v1/webhooks` - create endpoint
-   `DELETE /api/v1/webhooks?id=<endpointId>` - delete endpoint

Supported events:

-   `order.created`
-   `order.shipped`
-   `order.cancelled`
-   `payment.recorded`
-   `invoice.issued`

Create endpoint body:

```json
{
    "url": "https://example.com/hooks/orders",
    "events": ["order.created", "payment.recorded"],
    "secret": "optional-shared-secret",
    "testNow": true
}
```

Signature headers for delivery:

-   `x-webhook-event`
-   `x-webhook-signature` (HMAC-SHA256)
-   `x-webhook-delivery-attempt` (1..3)

## Support

For API support, contact: api-support@example.com
