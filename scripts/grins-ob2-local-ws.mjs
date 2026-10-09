// Isolated local websocket transport ONLY. Never used by production commands.
// A separately prepared wsproxy/v1 must forward to the local PgBouncer port.
import { neonConfig } from '@neondatabase/serverless'
if (process.env.GRINS_OB2_LOCAL_WS !== 'explicitly-approved-local-test') throw new Error('local_ws_test_not_confirmed')
neonConfig.wsProxy = (host, port) => {
  if (host !== 'ob2-stage.local' || String(port) !== '6432') throw new Error('local_ws_destination_rejected')
  return '127.0.0.1:8080/v1?address=127.0.0.1:6432'
}
neonConfig.useSecureWebSocket = false // loopback-only isolated laboratory
neonConfig.pipelineConnect = false
