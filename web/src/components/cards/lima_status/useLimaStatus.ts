import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { LIMA_DEMO_DATA, type LimaDemoData, type LimaInstance } from './demoData'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'

export interface LimaStatus {
  detected: boolean
  instances: LimaInstance[]
  totalNodes: number
  runningNodes: number
  stoppedNodes: number
  brokenNodes: number
  health: 'healthy' | 'degraded' | 'not-detected'
  totalCpuCores: number
  totalMemoryGB: number
  lastCheckTime: string
}

const INITIAL_DATA: LimaStatus = {
  detected: false,
  instances: [],
  totalNodes: 0,
  runningNodes: 0,
  stoppedNodes: 0,
  brokenNodes: 0,
  health: 'not-detected',
  totalCpuCores: 0,
  totalMemoryGB: 0,
  lastCheckTime: new Date().toISOString(),
}

const CACHE_KEY = 'lima-status'

/**
 * Backend response for GET /api/mcp/lima/status.
 */
interface BackendLimaStatus {
  detected?: boolean
  instances?: LimaInstance[]
  totalNodes?: number
  runningNodes?: number
  stoppedNodes?: number
  brokenNodes?: number
  health?: LimaStatus['health']
  totalCpuCores?: number
  totalMemoryGB?: number
  lastCheckTime?: string
}

/**
 * Fetch Lima VM status from backend aggregation endpoint.
 */
async function fetchLimaStatus(): Promise<LimaStatus> {
  const resp = await fetch('/api/mcp/lima/status', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`)
  }

  const body: BackendLimaStatus = await resp.json()
  const instances = Array.isArray(body.instances) ? body.instances : []
  const detected = body.detected ?? instances.length > 0
  const health = detected
    ? (body.health ?? (body.brokenNodes || body.stoppedNodes ? 'degraded' : 'healthy'))
    : 'not-detected'

  return {
    detected,
    instances,
    totalNodes: body.totalNodes ?? instances.length,
    runningNodes: body.runningNodes ?? instances.filter((instance) => instance.status === 'running').length,
    stoppedNodes: body.stoppedNodes ?? instances.filter((instance) => instance.status === 'stopped').length,
    brokenNodes: body.brokenNodes ?? instances.filter((instance) => instance.status === 'broken').length,
    health,
    totalCpuCores: body.totalCpuCores ?? instances.reduce((sum, instance) => sum + (instance.cpuCores || 0), 0),
    totalMemoryGB: body.totalMemoryGB ?? instances.reduce((sum, instance) => sum + (instance.memoryGB || 0), 0),
    lastCheckTime: body.lastCheckTime ?? new Date().toISOString(),
  }
}

function toDemoStatus(demo: LimaDemoData): LimaStatus {
  return {
    detected: demo.totalNodes > 0,
    instances: demo.instances,
    totalNodes: demo.totalNodes,
    runningNodes: demo.runningNodes,
    stoppedNodes: demo.stoppedNodes,
    brokenNodes: demo.brokenNodes,
    health: demo.health,
    totalCpuCores: demo.totalCpuCores,
    totalMemoryGB: demo.totalMemoryGB,
    lastCheckTime: demo.lastCheckTime,
  }
}

export interface UseLimaStatusResult {
  data: LimaStatus
  loading: boolean
  isRefreshing: boolean
  error: boolean
  consecutiveFailures: number
  showSkeleton: boolean
  showEmptyState: boolean
}

export function useLimaStatus(): UseLimaStatusResult {
  const { data, isLoading, isRefreshing, isFailed, consecutiveFailures, isDemoFallback } =
    useCache<LimaStatus>({
      key: CACHE_KEY,
      category: 'default',
      initialData: INITIAL_DATA,
      demoData: toDemoStatus(LIMA_DEMO_DATA),
      persist: true,
      fetcher: fetchLimaStatus,
    })

  const effectiveIsDemoData = isDemoFallback && !isLoading
  const hasAnyData = !data.detected ? true : data.totalNodes > 0

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading,
    isRefreshing,
    hasAnyData,
    isFailed,
    consecutiveFailures,
    isDemoData: effectiveIsDemoData,
  })

  return {
    data,
    loading: isLoading,
    isRefreshing,
    error: isFailed && !hasAnyData,
    consecutiveFailures,
    showSkeleton,
    showEmptyState,
  }
}
