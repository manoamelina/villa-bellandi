# Lokale testopstelling: draait dezelfde Worker en hetzelfde Durable Object als op Cloudflare.
using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (name = "main", worker = .villa),
    (name = "assets", disk = (path = "@@MAP@@/public", writable = false)),
    (name = "do-opslag", disk = (path = "@@MAP@@/test/.do-opslag", writable = true)),
  ],
  sockets = [ (name = "http", address = "127.0.0.1:8790", http = (), service = "main") ],
);

const villa :Workerd.Worker = (
  modules = [
    (name = "worker.js", esModule = embed "../src/worker.js"),
    (name = "villa.js", esModule = embed "../src/villa.js"),
    (name = "spel.js", esModule = embed "../src/spel.js"),
  ],
  compatibilityDate = "2025-10-01",
  bindings = [
    (name = "ASSETS", service = "assets"),
    (name = "VILLA", durableObjectNamespace = "Villa"),
  ],
  durableObjectNamespaces = [ (className = "Villa", uniqueKey = "villa-bellandi-lokaal", enableSql = true) ],
  durableObjectStorage = (localDisk = "do-opslag"),
);
