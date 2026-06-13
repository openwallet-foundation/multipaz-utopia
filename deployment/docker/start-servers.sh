#!/bin/sh

# Multipaz Utopia Server Bundle Startup Script
# Starts all servers with configurable base URLs

set -e

# Base URL for proxy mode (nginx routes by path)
BASE_URL="${BASE_URL:-http://localhost:8100}"

no_protocol="${BASE_URL#*://}"      # strip protocol
host_port="${no_protocol%%/*}"     # strip path
host="${host_port%:*}"  # strip port

# Mode: "proxy" (default) routes through nginx; "direct" exposes ports directly
MODE="${MODE:-proxy}"

# Additional params that can be passed to all servers
EXTRA_PARAMS="${EXTRA_PARAMS:-}"

if [ -z "$ADMIN_PASS" ] ; then
  if [ "$BASE_URL" = "http://localhost:8100" ] ; then
    ADMIN_PASS=multipaz
    echo "Admin password is set to 'multipaz'"
  else
    echo "ADMIN_PASS must be set for non-test deployments"
  fi
fi

echo "=========================================="
echo "Multipaz Utopia Server Bundle"
echo "=========================================="
echo "Mode: ${MODE}"
echo "Base URL: ${BASE_URL}"
echo "=========================================="
echo ""

pids=""

service () {
  local service="$1"
  shift
  local instance="$1"
  shift
  local mainclass="$1"
  shift
  local port="$1"
  shift
  local extra="$EXTRA_PARAMS"
  if [ "records" = "$service" ] ; then
    extra="$extra -param ca_allow_enrollment=[\"$host\"]"
  else
    if [ "openid4vci" = "$service" ] ; then
      extra="$extra -param system_of_record_url=${BASE_URL}/registry"
    fi
    extra="$extra -param enrollment_server_url=${BASE_URL}/registry"
  fi
  echo "Starting $service service ($instance) at port $port..."
  java -cp "/app/jars/$instance.jar:/app/jars/multipaz-$service.jar:/app/libs/*" "$mainclass" \
    -param server_port=$port \
    -param base_url=${BASE_URL}/$instance \
    -param ca_trust_servers="[\"$host\"]" \
    -param server_trace_file="/app/logs/$instance-trace.log" \
    -param database_connection="jdbc:sqlite:/app/data/$instance.db" \
    -config "/etc/multipaz/$instance.conf" \
    $extra \
    $* \
    > "/app/logs/$instance.log" 2>&1 &
  pids="$pids $!"
  echo "  PID: $!"
}

# Start nginx if in proxy mode, must be first, as services will want to connect to each other
if [ "$MODE" = "proxy" ]; then
    echo "Starting nginx reverse proxy on port 8100..."
    nginx -g 'daemon off;' &
    NGINX_PID=$!
    echo "  PID: ${NGINX_PID}"
    pids="$pids ${NGINX_PID}"
fi

# Check if DB exists before launching services (DB may be mounted from outside)
if [ -r /app/data/registry.db ]
then
   INIT=0
else
   INIT=1
fi

# records server must be started first, as it processes enrollments
service records registry org.multipaz.records.server.Main 8004 -param admin_password=$ADMIN_PASS
service verifier upay org.multipaz.upay.server.Main 8009
service verifier brewery org.multipaz.brewery.server.Main 8010
service openid4vci bank_of_utopia org.multipaz.utopia.organizations.bankofutopia.server.Main 8001 -param admin_password=$ADMIN_PASS
service openid4vci dmv org.multipaz.utopia.organizations.dmv.server.Main 8002 -param admin_password=$ADMIN_PASS

if [ "$INIT" = "0" ]
then
echo "Registry database exists, not loading initial data"
else
echo "Loading initial data into the Registry..."
(
  echo '{'
  echo '"password": "'$ADMIN_PASS'",'
  echo '"identities":'
  cat /app/init/records.json
  echo '}'
) | curl --retry-connrefused --retry 5 -H "Content-Type: application/json" -d @- http://localhost:8004/identity/load
fi

echo ""
echo "All services started."

echo ""
echo "=========================================="
echo "Multipaz Utopia Server Bundle is running"
if [ "$MODE" = "proxy" ]; then
    echo "Access via: ${BASE_URL}"
else
    echo "Access services directly on ports 8001-8009"
fi
echo "=========================================="
echo ""

# Handle shutdown gracefully
cleanup() {
    echo "Shutting down, killing $pids..."
    kill $pids 2>/dev/null || true
    exit 0
}

trap cleanup TERM INT
wait

exit 1
