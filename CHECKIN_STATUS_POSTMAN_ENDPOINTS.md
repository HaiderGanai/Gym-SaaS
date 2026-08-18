# Check-in Status — Postman Endpoints

Base URL: `http://localhost:3000/api/v1` (dev). See `CHECKIN_STATUS_OVERVIEW.md` for the design rationale.

---

## `GET /members/profile/checkin-status`

**Auth:** MemberJwt

**Query params:**
| Param | Required | Notes |
|---|---|---|
| `gym_id` | No | Defaults to the member's `primary_gym_id`. Must be one of the member's active `gym_ids` (403 otherwise). |

**Request body:** none.

**Example request:**
```
GET /api/v1/members/profile/checkin-status
Authorization: Bearer {{member_token}}
```
```
GET /api/v1/members/profile/checkin-status?gym_id=2e82ea95-3c50-48bf-93a1-251b7b807cd3
Authorization: Bearer {{member_token}}
```

**Response `200` — checked in today:**
```json
{
  "gym_id": "2e82ea95-3c50-48bf-93a1-251b7b807cd3",
  "checked_in_today": true,
  "checked_in_at": "2026-08-18T09:12:04.000Z",
  "last_check_in": {
    "date": "2026-08-18",
    "checked_in_at": "2026-08-18T09:12:04.000Z",
    "days_ago": 0,
    "label": "today"
  }
}
```

**Response `200` — not checked in today, last visit was 3 days ago:**
```json
{
  "gym_id": "2e82ea95-3c50-48bf-93a1-251b7b807cd3",
  "checked_in_today": false,
  "checked_in_at": null,
  "last_check_in": {
    "date": "2026-08-15",
    "checked_in_at": "2026-08-15T12:15:30.901Z",
    "days_ago": 3,
    "label": "3 days ago"
  }
}
```

**Response `200` — never checked in at this gym:**
```json
{
  "gym_id": "2e82ea95-3c50-48bf-93a1-251b7b807cd3",
  "checked_in_today": false,
  "checked_in_at": null,
  "last_check_in": null
}
```

**Errors:**
- `403` — `gym_id` (explicit or defaulted `primary_gym_id`) isn't one of the member's active gym affiliations.
- `401` — missing/invalid member JWT.
