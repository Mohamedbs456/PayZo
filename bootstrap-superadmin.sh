#!/usr/bin/env bash
#
# One-shot PayZo backoffice bootstrap.
#
# Run this AFTER `docker compose up -d` on a fresh stack (or after
# `docker compose down -v` resets the Keycloak + Postgres volumes).
# It does three things:
#
#   1. Grants the backend's service accounts the realm-management roles
#      they need to create / disable / delete users in both realms.
#   2. Creates a SUPERADMIN user in the `backoffice` realm with a known
#      password and assigns the SUPERADMIN realm role.
#   3. Restarts the backend container so DataInitializer auto-syncs
#      the SA into the local users table.
#
# After this, log in to the backoffice UI with:
#   username = superadmin
#   password = Superadmin123!
#
# Edit the two variables below if you want a different SA username / pw.

set -euo pipefail

SA_USERNAME="${SA_USERNAME:-superadmin}"
SA_PASSWORD="${SA_PASSWORD:-Superadmin123!}"
SA_EMAIL="${SA_EMAIL:-superadmin@payzo.tn}"

KC_URL="${KC_URL:-http://localhost:8080}"
KC_ADMIN_USER="${KC_ADMIN_USER:-admin}"
KC_ADMIN_PASS="${KC_ADMIN_PASS:-admin}"

echo "── 1/4 Acquiring master admin token ─────────────────────────────────"
TOKEN=$(curl -sf -X POST "$KC_URL/realms/master/protocol/openid-connect/token" \
  -d "username=$KC_ADMIN_USER" \
  -d "password=$KC_ADMIN_PASS" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
echo "ok"

grant_realm_management() {
  local REALM="$1"
  local CLIENT_ID="$2"
  echo
  echo "── Granting realm-management roles to ${CLIENT_ID}@${REALM} ──"
  CID=$(curl -sf -H "Authorization: Bearer $TOKEN" \
    "$KC_URL/admin/realms/${REALM}/clients?clientId=${CLIENT_ID}" \
    | python -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
  SVC=$(curl -sf -H "Authorization: Bearer $TOKEN" \
    "$KC_URL/admin/realms/${REALM}/clients/${CID}/service-account-user" \
    | python -c "import sys,json;print(json.load(sys.stdin)['id'])")
  RM_ID=$(curl -sf -H "Authorization: Bearer $TOKEN" \
    "$KC_URL/admin/realms/${REALM}/clients?clientId=realm-management" \
    | python -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
  ROLES=$(curl -sf -H "Authorization: Bearer $TOKEN" \
    "$KC_URL/admin/realms/${REALM}/clients/${RM_ID}/roles" \
    | python -c "
import sys,json
roles = json.load(sys.stdin)
wanted = {'manage-users','view-users','query-users','manage-realm','view-realm'}
print(json.dumps([{'id':r['id'],'name':r['name']} for r in roles if r['name'] in wanted]))
")
  curl -sf -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "$ROLES" \
    "$KC_URL/admin/realms/${REALM}/users/${SVC}/role-mappings/clients/${RM_ID}" >/dev/null
  echo "  ✓ ${CLIENT_ID}@${REALM} now has: manage-users, view-users, query-users, manage-realm, view-realm"
}

echo
echo "── 2/4 Granting service-account permissions ────────────────────────"
grant_realm_management "backoffice" "payzo-backend-bo"
grant_realm_management "clients"    "payzo-backend"

# The FE login client (`payzo-backoffice-app`) ships with
# `fullScopeAllowed=false`, which silently strips custom realm roles
# (SUPERADMIN/ADMIN/ANALYST) from the access token. Without this flag, the
# UI rejects every login with "This account is not authorized for the
# backoffice." Flip it once — Keycloak persists it.
echo
echo "── Enabling fullScopeAllowed on payzo-backoffice-app ──"
FE_CID=$(curl -sf -H "Authorization: Bearer $TOKEN" \
  "$KC_URL/admin/realms/backoffice/clients?clientId=payzo-backoffice-app" \
  | python -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
FE_REP=$(curl -sf -H "Authorization: Bearer $TOKEN" \
  "$KC_URL/admin/realms/backoffice/clients/${FE_CID}")
FE_UPDATED=$(echo "$FE_REP" | python -c "
import sys,json
c = json.load(sys.stdin)
c['fullScopeAllowed'] = True
print(json.dumps(c))
")
curl -sf -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "$FE_UPDATED" "$KC_URL/admin/realms/backoffice/clients/${FE_CID}" >/dev/null
echo "  ✓ payzo-backoffice-app now passes all realm roles into JWTs"

echo
echo "── 3/4 Creating SUPERADMIN user in backoffice realm ────────────────"

# Idempotent: if the user already exists with this username, we update its
# password + ensure the role is assigned, instead of erroring on 409.
EXISTING_ID=$(curl -sf -H "Authorization: Bearer $TOKEN" \
  "$KC_URL/admin/realms/backoffice/users?username=${SA_USERNAME}&exact=true" \
  | python -c "
import sys,json
users = json.load(sys.stdin)
print(users[0]['id'] if users else '')
")

if [ -n "$EXISTING_ID" ]; then
  echo "  user '${SA_USERNAME}' already exists in backoffice realm — id=${EXISTING_ID}"
  KCID="$EXISTING_ID"
else
  RESP_HEADERS=$(curl -sf -i -X POST \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{
      \"username\":\"${SA_USERNAME}\",
      \"email\":\"${SA_EMAIL}\",
      \"firstName\":\"Super\",
      \"lastName\":\"Admin\",
      \"enabled\":true,
      \"emailVerified\":true
    }" \
    "$KC_URL/admin/realms/backoffice/users")
  KCID=$(echo "$RESP_HEADERS" | grep -i '^Location:' | tr -d '\r' | sed 's|.*/||')
  echo "  ✓ created — keycloakId=${KCID}"
fi

# Set / reset the password so the script is repeatable.
curl -sf -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"type\":\"password\",\"value\":\"${SA_PASSWORD}\",\"temporary\":false}" \
  "$KC_URL/admin/realms/backoffice/users/${KCID}/reset-password"
echo "  ✓ password set"

# Assign realm role SUPERADMIN. Keycloak rejects the full role rep here
# (`containerId` confuses it), so we send a stripped {id, name} payload.
ROLE_PAYLOAD=$(curl -sf -H "Authorization: Bearer $TOKEN" \
  "$KC_URL/admin/realms/backoffice/roles/SUPERADMIN" \
  | python -c "import sys,json; r=json.load(sys.stdin); print(json.dumps([{'id':r['id'],'name':r['name']}]))")
curl -sf -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "${ROLE_PAYLOAD}" \
  "$KC_URL/admin/realms/backoffice/users/${KCID}/role-mappings/realm" >/dev/null
echo "  ✓ realm role SUPERADMIN assigned"

echo
echo "── 4/4 Restarting backend so DataInitializer syncs the SA ─────────"
docker restart backend >/dev/null
echo -n "  waiting for healthy"
for i in $(seq 1 40); do
  if curl -sf -m 2 "http://localhost:8081/actuator/health" >/dev/null 2>&1; then
    echo " — healthy"
    break
  fi
  sleep 2
  echo -n "."
done

echo
echo "═════════════════════════════════════════════════════════════════════"
echo " ✅ Bootstrap complete."
echo
echo "    Log in at:  http://localhost:5174"
echo "    Username:   ${SA_USERNAME}"
echo "    Password:   ${SA_PASSWORD}"
echo "═════════════════════════════════════════════════════════════════════"
