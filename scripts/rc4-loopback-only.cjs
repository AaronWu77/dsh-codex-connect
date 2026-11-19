// Lab fixture guard, not a system-wide firewall. Allow only loopback TCP and local IPC.
const net = require('node:net')
const dns = require('node:dns')
const { syncBuiltinESMExports } = require('node:module')
const local = (host) => host === undefined || host === '' || host === 'localhost'
  || host === '::1' || host === '::ffff:127.0.0.1' || host === '127.0.0.1'
const assertLocal = (host) => {
  if (!local(host)) throw Object.assign(new Error('Non-loopback networking is disabled for RC4 validation'), { code: 'RC4_TEST_OFFLINE' })
}
const connect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
  const normalized = Array.isArray(args[0]) ? args[0] : args
  const endpoint = normalized[0]
  if (typeof endpoint === 'object' && endpoint !== null && endpoint.path === undefined) assertLocal(endpoint.host)
  if (typeof endpoint === 'number') assertLocal(typeof normalized[1] === 'string' ? normalized[1] : undefined)
  return Reflect.apply(connect, this, args)
}
for (const resolver of [dns, dns.promises, dns.Resolver.prototype, dns.promises.Resolver.prototype]) {
  for (const method of Object.getOwnPropertyNames(resolver).filter(key => key === 'lookup' || key.startsWith('resolve'))) {
    const original = resolver[method]
    if (typeof original !== 'function') continue
    resolver[method] = function (hostname, ...args) {
      assertLocal(hostname)
      return Reflect.apply(original, this, [hostname, ...args])
    }
  }
}
syncBuiltinESMExports()
