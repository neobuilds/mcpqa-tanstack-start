#!/usr/bin/env bash
#
# TanStack Taskboard end-to-end verification against a real production server.
#
# Runs, in order:
#   1. a fresh production build (`npm run build`)
#   2. smoke checks   — SSR HTML renders DB-seeded data + release marker
#   3. health checks  — liveness, readiness (with DB check), release markers
#   4. CRUD checks    — create / read / update / delete via /api/tasks
#   5. error checks   — validation 400, missing-resource 404, unknown route 404
#   6. persistence    — restart the server and confirm data survives
#
# Usage:
#   npm run verify           # default port 4487
#   VERIFY_PORT=8181 npm run verify
#
# Env overrides:
#   VERIFY_PORT  TCP port for the test server   (default 4487)
#   VERIFY_HOST  bind host for the test server  (default 127.0.0.1)
#
# The script only terminates its own server process and cleans up its own
# temporary database. It never touches other processes.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERIFY_PORT="${VERIFY_PORT:-4487}"
VERIFY_HOST="${VERIFY_HOST:-127.0.0.1}"
BASE_URL="http://${VERIFY_HOST}:${VERIFY_PORT}"

TMP_DIR="$(mktemp -d)"
DB_PATH="${TMP_DIR}/verify.db"
SERVER_PID=""
PASS=0
FAIL=0

note() { printf '%s\n' "$*"; }
ok()   { printf '  PASS  %s\n' "$1"; PASS=$((PASS + 1)); }
fail() { printf '  FAIL  %s\n' "$1" >&2; FAIL=$((FAIL + 1)); }

cleanup() {
  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

#############################
# Helpers
#############################

# status_of <label> <callback-body>
# Runs the curl command in $2 and asserts the HTTP status equals $1.
status_of() {
  local label="$1"
  local expected="$2"
  local method="$3"
  local url="$4"
  local data="${5:-}"

  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' -X "${method}" \
    ${data:+-H 'Content-Type: application/json' -d "${data}"} \
    "${url}")"

  if [[ "${code}" == "${expected}" ]]; then
    ok "${label} -> HTTP ${expected}"
  else
    fail "${label} -> expected HTTP ${expected}, got ${code}"
  fi
}

wait_for_ready() {
  local tries=60
  while ((tries > 0)); do
    local code
    code="$(curl -s -o /dev/null -w '%{http_code}' \
      "${BASE_URL}/api/health/ready" || true)"
    if [[ "${code}" == "200" ]]; then
      return 0
    fi
    sleep 0.5
    tries=$((tries - 1))
  done
  return 1
}

start_server() {
  note "Starting production server on ${BASE_URL}..."
  DATABASE_PATH="${DB_PATH}" PORT="${VERIFY_PORT}" HOST="${VERIFY_HOST}" \
    node "${ROOT_DIR}/.output/server/index.mjs" \
    >"${TMP_DIR}/server.log" 2>"${TMP_DIR}/server.err" &
  SERVER_PID=$!

  if ! wait_for_ready; then
    fail "server did not become ready within 30s"
    note "--- server stderr ---"
    cat "${TMP_DIR}/server.err" >&2 || true
    exit 1
  fi

  ok "server: /api/health/ready returned 200"
}

stop_server() {
  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}"
    wait "${SERVER_PID}" 2>/dev/null || true
    SERVER_PID=""
  fi
}

#############################
# 1. Build
#############################

note "==> Building production bundle"
npm --prefix "${ROOT_DIR}" run build >"${TMP_DIR}/build.log" 2>&1
if [[ ! -f "${ROOT_DIR}/.output/server/index.mjs" ]]; then
  note "build failed: ${ROOT_DIR}/.output/server/index.mjs missing" >&2
  cat "${TMP_DIR}/build.log" >&2
  exit 1
fi
ok "npm run build produced .output/server/index.mjs"

#############################
# 2 & 3. Smoke + health
#############################

start_server

note "==> Smoke: SSR HTML renders DB data server-side"
PAGE_HTML="$(curl -sL "${BASE_URL}/" | tr -d '\000')"

for expected in \
  "TanStack Taskboard" \
  "tanstack-taskboard OK" \
  "Design the board layout" \
  "Build the SSR task list"; do
  if printf "%s" "${PAGE_HTML}" | grep -q "${expected}"; then
    ok "SSR HTML contains: ${expected}"
  else
    fail "SSR HTML missing: ${expected}"
  fi
done

note "==> Health checks"
status_of "liveness"        200 GET "${BASE_URL}/api/health/live"
status_of "readiness"       200 GET "${BASE_URL}/api/health/ready"
status_of "combined health" 200 GET "${BASE_URL}/api/health"

HEALTH_JSON="$(curl -s "${BASE_URL}/api/health")"
for expected in \
  '"app":"tanstack-taskboard"' \
  '"version":"1.0.0"' \
  '"marker":"tanstack-taskboard OK"'; do
  if printf "%s" "${HEALTH_JSON}" | grep -q "${expected}"; then
    ok "health payload contains release: ${expected}"
  else
    fail "health payload missing: ${expected}"
  fi
done

#############################
# 4. CRUD via /api/tasks
#############################

note "==> CRUD checks"

CREATE_JSON="$(curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"title":"verify-create-task","priority":"high"}' \
  "${BASE_URL}/api/tasks")"

CREATED_ID="$(printf "%s" "${CREATE_JSON}" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)"
if [[ -n "${CREATED_ID}" ]] \
  && printf "%s" "${CREATE_JSON}" | grep -q '"title":"verify-create-task"'; then
  ok "POST /api/tasks created task id=${CREATED_ID}"
else
  FAIL=$((FAIL + 1))
  fail "POST /api/tasks did not return a created task: ${CREATE_JSON}"
fi

if [[ -n "${CREATED_ID}" ]]; then
  LIST_JSON="$(curl -s "${BASE_URL}/api/tasks")"
  if printf "%s" "${LIST_JSON}" | grep -q '"title":"verify-create-task"'; then
    ok "GET /api/tasks lists the created task"
  else
    fail "created task missing from GET /api/tasks"
  fi

  PATCH_JSON="$(curl -s -X PATCH -H 'Content-Type: application/json' \
    -d "{\"id\":${CREATED_ID},\"status\":\"done\"}" \
    "${BASE_URL}/api/tasks")"
  if printf "%s" "${PATCH_JSON}" | grep -q '"status":"done"'; then
    ok "PATCH /api/tasks updated task ${CREATED_ID} to done"
  else
    fail "PATCH /api/tasks did not update status: ${PATCH_JSON}"
  fi

  DONE_FILTER="$(curl -s "${BASE_URL}/api/tasks?status=done")"
  if printf "%s" "${DONE_FILTER}" | grep -q "\"id\":${CREATED_ID}"; then
    ok "GET /api/tasks?status=done includes task ${CREATED_ID}"
  else
    fail "status filter does not include updated task"
  fi

  status_of "DELETE existing task" 200 DELETE \
    "${BASE_URL}/api/tasks?id=${CREATED_ID}"

  AFTER_DELETE="$(curl -s "${BASE_URL}/api/tasks")"
  if printf "%s" "${AFTER_DELETE}" | grep -q "\"id\":${CREATED_ID}"; then
    fail "deleted task still present after DELETE"
  else
    ok "deleted task disappears from GET /api/tasks"
  fi
fi

#############################
# 5. Error handling
#############################

note "==> Error checks"

status_of "create with empty title" 400 POST \
  "${BASE_URL}/api/tasks" '{"title":""}'
status_of "patch missing task"      404 PATCH \
  "${BASE_URL}/api/tasks" '{"id":999999,"title":"nope"}'
status_of "delete missing task"     404 DELETE \
  "${BASE_URL}/api/tasks?id=999999"
status_of "invalid status filter"   400 GET \
  "${BASE_URL}/api/tasks?status=bogus"
status_of "unknown route"           404 GET \
  "${BASE_URL}/definitely-not-a-route"

#############################
# 6. Persistence across restart
#############################

note "==> Persistence across restart"

PERSIST_TITLE="verify-persist-$(date +%s)-$$"
PERSIST_JSON="$(curl -s -X POST -H 'Content-Type: application/json' \
  -d "{\"title\":\"${PERSIST_TITLE}\",\"priority\":\"low\"}" \
  "${BASE_URL}/api/tasks")"
PERSIST_ID="$(printf "%s" "${PERSIST_JSON}" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)"

if [[ -z "${PERSIST_ID}" ]]; then
  fail "could not create task for persistence test"
else
  ok "created persistence task id=${PERSIST_ID}"

  stop_server
  ok "stopped server for restart"

  start_server

  RESTART_LIST="$(curl -s "${BASE_URL}/api/tasks")"
  if printf "%s" "${RESTART_LIST}" | grep -q "\"id\":${PERSIST_ID}" \
    && printf "%s" "${RESTART_LIST}" | grep -q "\"title\":\"${PERSIST_TITLE}\""; then
    ok "task id=${PERSIST_ID} survived server restart (SQLite persistence)"
  else
    fail "task id=${PERSIST_ID} missing after restart"
  fi
fi

#############################
# Summary
#############################

note ""
note "==> Results: ${PASS} passed, ${FAIL} failed"

if ((FAIL > 0)); then
  note "Server log tail:"
  tail -20 "${TMP_DIR}/server.err" >&2 || true
  exit 1
fi

note "All checks passed."