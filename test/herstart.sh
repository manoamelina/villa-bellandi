#!/bin/sh
# Start (of herstart) de Worker lokaal op poort 8790 met workerd.
# workerd: https://github.com/cloudflare/workerd/releases — geef het pad mee met WORKERD=/pad/naar/workerd
cd "$(dirname "$0")"
MAP="$(cd .. && pwd)"
sed "s#@@MAP@@#$MAP#g" workerd.sjabloon.capnp > workerd.capnp
if [ -f .pid ]; then kill "$(cat .pid)" 2>/dev/null; sleep 0.5; fi
mkdir -p .do-opslag
setsid nohup "${WORKERD:-workerd}" serve workerd.capnp > workerd.log 2>&1 < /dev/null &
echo $! > .pid
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null http://127.0.0.1:8790/robots.txt && break; sleep 0.3; done
curl -s -o /dev/null -w "workerd %{http_code}\n" http://127.0.0.1:8790/robots.txt
