# Plan Management Guide

This document explains how to change a customer's subscription plan.

---

## Plans Available

| Plan       | Customers | Users | Vans |
|------------|-----------|-------|------|
| free       | 10        | 2     | 1    |
| starter    | 50        | 5     | 3    |
| pro        | 200       | 15    | 8    |
| enterprise | Unlimited | Unlimited | Unlimited |

---

## What You Need

1. **The customer's server URL** — e.g. `https://customer-domain.com`
2. **Your VENDOR_SECRET** — the secret you set in the customer's `server/.env` file

The VENDOR_SECRET for each deployment is in their `server/.env` file under `VENDOR_SECRET=`.

---

## How to Change a Plan

Run this command in any terminal (Command Prompt, PowerShell, or Git Bash):

### Windows — PowerShell

```powershell
Invoke-WebRequest -Uri "https://CUSTOMER-SERVER/api/plan" `
  -Method PUT `
  -Headers @{ "X-Vendor-Secret" = "VENDOR_SECRET_HERE"; "Content-Type" = "application/json" } `
  -Body '{"planKey":"pro"}' `
  -UseBasicParsing
```

### Mac / Linux — curl

```bash
curl -X PUT https://CUSTOMER-SERVER/api/plan \
  -H "X-Vendor-Secret: VENDOR_SECRET_HERE" \
  -H "Content-Type: application/json" \
  -d '{"planKey":"pro"}'
```

Replace:
- `CUSTOMER-SERVER` with the customer's server address
- `VENDOR_SECRET_HERE` with the VENDOR_SECRET from their `.env`
- `"pro"` with the plan key you want to set (`free`, `starter`, `pro`, `enterprise`)

---

## Example — This Installation (Local)

Server URL: `http://localhost:3000`
VENDOR_SECRET: stored in `server/.env`

```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/plan" `
  -Method PUT `
  -Headers @{ "X-Vendor-Secret" = "a7ac6351e7c485ae2d7ad530675f9f959270ab0e5b1cf45ab5dcb565801e02e5"; "Content-Type" = "application/json" } `
  -Body '{"planKey":"pro"}' `
  -UseBasicParsing
```

---

## Successful Response

```json
{
  "success": true,
  "plan": {
    "key": "pro",
    "name": "Pro",
    "maxCustomers": 200,
    "maxUsers": 15,
    "maxVans": 8
  }
}
```

If successful, the plan changes immediately — no server restart needed.

---

## Error Responses

| Message | Cause | Fix |
|---|---|---|
| `VENDOR_SECRET not configured` | `VENDOR_SECRET` missing from `.env` | Add it to `server/.env` and restart |
| `Invalid vendor secret` | Wrong secret in your command | Check the secret in their `server/.env` |
| `Unknown plan` | Typo in planKey | Use: `free`, `starter`, `pro`, `enterprise` |

---

## Verify the Change

After running the command, open the customer's app in a browser:

**Settings → System → Plan & Usage**

The plan badge and usage limits will update immediately.

---

## Notes

- The plan change is instant — no restart required
- The customer (admin) can **see** their plan but **cannot change it** — there are no buttons in the UI
- Each customer deployment has its own `VENDOR_SECRET` — keep a record of which secret belongs to which customer
- The change is recorded in the audit log as `config.update` by user `vendor`
