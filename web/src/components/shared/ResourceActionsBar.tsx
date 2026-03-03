import { useState, useRef } from 'react'
import {
  RefreshCw,
  Terminal,
  FileText,
  Trash2,
  Play,
  Pause,
  Box,
  ChevronDown,
  History,
  GitCompare,
  Code,
  FileCode2,
  X,
} from 'lucide-react'
import { createTwoFilesPatch } from 'diff'
import { clsx } from 'clsx'
import {
  useDeleteResource,
  useTriggerCronJob,
  useSuspendCronJob,
  useResumeCronJob,
  useRestartWorkload,
  useWorkloadRevisions,
  useRollbackWorkload,
  useFluxReconcile,
  useFluxSyncWithSource,
  useFluxSuspend,
  useFluxResume,
  useArgoSync,
  useArgoRefresh,
  useArgoSuspend,
  useArgoResume,
} from '../../api/client'
import type { WorkloadRevision } from '../../api/client'
import { ForceDeleteConfirmDialog } from '../ui/ForceDeleteConfirmDialog'
import type { SelectedResource } from '../../types'
import { formatKindName } from '../resources/drawer-components'
import { useOpenTerminal, useOpenLogs, useOpenWorkloadLogs } from '../dock'
import { PortForwardButton } from '../portforward/PortForwardButton'
import { useCanExec, useCanViewLogs, useCanPortForward } from '../../contexts/CapabilitiesContext'
import { useToast } from '../ui/Toast'

// ============================================================================
// ACTIONS BAR - Interactive buttons that change based on resource kind
// ============================================================================

interface ResourceActionsBarProps {
  resource: SelectedResource
  data: any
  onClose?: () => void
  hideLogs?: boolean
  showYaml?: boolean
  onToggleYaml?: () => void
}

export function ResourceActionsBar({ resource, data, onClose, hideLogs, showYaml, onToggleYaml }: ResourceActionsBarProps) {
  const { showCopied } = useToast()
  const openTerminal = useOpenTerminal()
  const openLogs = useOpenLogs()
  const openWorkloadLogs = useOpenWorkloadLogs()
  const kind = resource.kind.toLowerCase()

  // Check capabilities
  const canExec = useCanExec()
  const canViewLogs = useCanViewLogs()
  const canPortForward = useCanPortForward()

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const deleteMutation = useDeleteResource()

  // CronJob mutations
  const triggerCronJobMutation = useTriggerCronJob()
  const suspendCronJobMutation = useSuspendCronJob()
  const resumeCronJobMutation = useResumeCronJob()

  // Workload restart and rollback mutations
  const restartWorkloadMutation = useRestartWorkload()
  const rollbackMutation = useRollbackWorkload()
  const [showRevisions, setShowRevisions] = useState(false)
  const isRollbackKind = ['deployments', 'statefulsets', 'daemonsets'].includes(kind)
  const { data: revisionsList } = useWorkloadRevisions(kind, resource.namespace, resource.name, isRollbackKind)
  const hasMultipleRevisions = (revisionsList?.length ?? 0) > 1

  function handleDeleteConfirm(force: boolean) {
    deleteMutation.mutate(
      { kind: resource.kind, namespace: resource.namespace, name: resource.name, force },
      {
        onSuccess: () => {
          setShowDeleteConfirm(false)
          onClose?.()
        },
      }
    )
  }

  const isRunning = kind === 'pods' ? data?.status?.phase === 'Running' : true
  const containers = data?.spec?.containers?.map((c: any) => c.name) || []

  const handleOpenTerminal = () => {
    if (resource.namespace && resource.name && containers.length > 0) {
      openTerminal({
        namespace: resource.namespace,
        podName: resource.name,
        containerName: containers[0],
        containers,
      })
    }
  }

  const handleOpenLogs = (containerName?: string) => {
    if (resource.namespace && resource.name && containers.length > 0) {
      openLogs({
        namespace: resource.namespace,
        podName: resource.name,
        containers,
        containerName,
      })
    }
  }

  const [showLogsMenu, setShowLogsMenu] = useState(false)
  const logsMenuTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleLogsMouseEnter = () => {
    if (logsMenuTimeout.current) clearTimeout(logsMenuTimeout.current)
    if (containers.length > 1) setShowLogsMenu(true)
  }
  const handleLogsMouseLeave = () => {
    logsMenuTimeout.current = setTimeout(() => setShowLogsMenu(false), 150)
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 flex-wrap">
      {/* Kind-specific actions (left) */}
      {kind === 'pods' && (
        <>
          {isRunning && canExec && (
            <button
              onClick={handleOpenTerminal}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <Terminal className="w-3.5 h-3.5" />
              Terminal
            </button>
          )}
          {canViewLogs && !hideLogs && (
            <div
              className="relative"
              onMouseEnter={handleLogsMouseEnter}
              onMouseLeave={handleLogsMouseLeave}
            >
              <button
                onClick={() => handleOpenLogs(containers.length === 1 ? containers[0] : undefined)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-600 hover:bg-slate-500 rounded-lg transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                Logs
                {containers.length > 1 && <ChevronDown className="w-3 h-3 ml-0.5" />}
              </button>
              {showLogsMenu && containers.length > 1 && (
                <div className="absolute top-full left-0 mt-1 min-w-[160px] py-1 bg-theme-surface border border-theme-border rounded-lg shadow-lg z-50">
                  {containers.map((container: string) => (
                    <button
                      key={container}
                      onClick={() => {
                        handleOpenLogs(container)
                        setShowLogsMenu(false)
                      }}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-theme-text-primary hover:bg-theme-hover transition-colors text-left"
                    >
                      <Box className="w-3 h-3 text-theme-text-tertiary shrink-0" />
                      <span className="truncate">{container}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {isRunning && canPortForward && resource.namespace && resource.name && (
            <PortForwardButton
              type="pod"
              namespace={resource.namespace}
              name={resource.name}
              className="!px-3 !py-1.5 !text-xs"
            />
          )}
        </>
      )}

      {/* Service actions */}
      {kind === 'services' && !data?.apiVersion?.includes('serving.knative.dev') && canPortForward && resource.namespace && resource.name && (
        <PortForwardButton
          type="service"
          namespace={resource.namespace}
          name={resource.name}
          className="!px-3 !py-1.5 !text-xs"
        />
      )}

      {/* Workload actions - restart, rollback, and logs */}
      {['deployments', 'statefulsets', 'daemonsets', 'rollouts'].includes(kind) && (
        <>
          <button
            onClick={() => restartWorkloadMutation.mutate({
              kind: resource.kind,
              namespace: resource.namespace,
              name: resource.name,
            })}
            disabled={restartWorkloadMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-600 hover:bg-slate-500 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${restartWorkloadMutation.isPending ? 'animate-spin' : ''}`} />
            {restartWorkloadMutation.isPending ? 'Restarting...' : 'Restart'}
          </button>
          {isRollbackKind && (
            <button
              onClick={() => setShowRevisions(true)}
              disabled={!hasMultipleRevisions}
              title={hasMultipleRevisions ? 'View revision history and rollback' : 'Only one revision exists'}
              className={clsx(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
                hasMultipleRevisions
                  ? "text-white bg-amber-600 hover:bg-amber-700"
                  : "text-theme-text-disabled bg-theme-elevated"
              )}
            >
              <History className="w-3.5 h-3.5" />
              Rollback
            </button>
          )}
          {canViewLogs && !hideLogs && ['deployments', 'statefulsets', 'daemonsets'].includes(kind) && (
            <button
              onClick={() => openWorkloadLogs({
                namespace: resource.namespace,
                workloadKind: kind,
                workloadName: resource.name,
              })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-600 hover:bg-slate-500 rounded-lg transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              Logs
            </button>
          )}
        </>
      )}

      {/* CronJob actions */}
      {kind === 'cronjobs' && (
        <>
          <button
            onClick={() => triggerCronJobMutation.mutate({
              namespace: resource.namespace,
              name: resource.name,
            })}
            disabled={triggerCronJobMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <Play className={`w-3.5 h-3.5 ${triggerCronJobMutation.isPending ? 'animate-pulse' : ''}`} />
            {triggerCronJobMutation.isPending ? 'Triggering...' : 'Trigger'}
          </button>
          {data?.spec?.suspend ? (
            <button
              onClick={() => resumeCronJobMutation.mutate({
                namespace: resource.namespace,
                name: resource.name,
              })}
              disabled={resumeCronJobMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              {resumeCronJobMutation.isPending ? 'Resuming...' : 'Resume'}
            </button>
          ) : (
            <button
              onClick={() => suspendCronJobMutation.mutate({
                namespace: resource.namespace,
                name: resource.name,
              })}
              disabled={suspendCronJobMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-600 hover:bg-slate-500 rounded-lg transition-colors disabled:opacity-50"
            >
              <Pause className="w-3.5 h-3.5" />
              {suspendCronJobMutation.isPending ? 'Suspending...' : 'Suspend'}
            </button>
          )}
        </>
      )}

      {/* FluxCD actions */}
      {['gitrepositories', 'ocirepositories', 'helmrepositories', 'kustomizations', 'helmreleases', 'alerts'].includes(kind) && (
        <FluxActions resource={resource} data={data} />
      )}

      {/* ArgoCD actions */}
      {kind === 'applications' && (
        <ArgoActions resource={resource} data={data} />
      )}

      {/* Job logs */}
      {kind === 'jobs' && (
        <button
          onClick={(e) => showCopied(
            `kubectl logs job/${resource.name} -n ${resource.namespace} -f`,
            'Logs command copied',
            e
          )}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-600 hover:bg-slate-500 rounded-lg transition-colors"
        >
          <FileText className="w-3.5 h-3.5" />
          Logs
        </button>
      )}

      {/* Spacer pushes universal actions to the right */}
      <div className="flex-1" />

      {/* Universal actions (right-aligned) */}
      {onToggleYaml && (
        <button
          onClick={onToggleYaml}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
            showYaml
              ? 'text-white bg-blue-600 hover:bg-blue-700'
              : 'text-theme-text-secondary hover:text-theme-text-primary border border-theme-border hover:bg-theme-elevated'
          )}
          title="Toggle YAML view"
        >
          <FileCode2 className="w-3.5 h-3.5" />
          YAML
        </button>
      )}

      <button
        onClick={() => setShowDeleteConfirm(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-white hover:bg-red-600 border border-red-400/50 hover:border-red-600 rounded-lg transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Delete
      </button>

      <ForceDeleteConfirmDialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteConfirm}
        resourceName={resource.name}
        resourceKind={formatKindName(resource.kind)}
        namespaceName={resource.namespace}
        isLoading={deleteMutation.isPending}
      />

      {showRevisions && ['deployments', 'statefulsets', 'daemonsets'].includes(kind) && (
        <RevisionHistoryDialog
          kind={resource.kind}
          namespace={resource.namespace}
          name={resource.name}
          open={showRevisions}
          onClose={() => setShowRevisions(false)}
          rollbackMutation={rollbackMutation}
        />
      )}
    </div>
  )
}

// ============================================================================
// FLUX ACTIONS
// ============================================================================

function FluxActions({ resource, data }: { resource: SelectedResource; data: any }) {
  const reconcileMutation = useFluxReconcile()
  const syncWithSourceMutation = useFluxSyncWithSource()
  const suspendMutation = useFluxSuspend()
  const resumeMutation = useFluxResume()

  const isSuspended = data?.spec?.suspend === true
  const hasSource = resource.kind === 'kustomizations' || resource.kind === 'helmreleases'

  return (
    <>
      <button
        onClick={() => reconcileMutation.mutate({
          kind: resource.kind,
          namespace: resource.namespace,
          name: resource.name,
        })}
        disabled={reconcileMutation.isPending || isSuspended}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
        title={isSuspended ? 'Cannot reconcile while suspended' : 'Trigger reconciliation'}
      >
        <RefreshCw className={`w-3.5 h-3.5 ${reconcileMutation.isPending ? 'animate-spin' : ''}`} />
        {reconcileMutation.isPending ? 'Reconciling...' : 'Reconcile'}
      </button>

      {hasSource && (
        <button
          onClick={() => syncWithSourceMutation.mutate({
            kind: resource.kind,
            namespace: resource.namespace,
            name: resource.name,
          })}
          disabled={syncWithSourceMutation.isPending || isSuspended}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50"
          title={isSuspended ? 'Cannot sync while suspended' : 'Fetch latest from source, then reconcile'}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncWithSourceMutation.isPending ? 'animate-spin' : ''}`} />
          {syncWithSourceMutation.isPending ? 'Syncing...' : 'Sync with Source'}
        </button>
      )}

      {isSuspended ? (
        <button
          onClick={() => resumeMutation.mutate({
            kind: resource.kind,
            namespace: resource.namespace,
            name: resource.name,
          })}
          disabled={resumeMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5" />
          {resumeMutation.isPending ? 'Resuming...' : 'Resume'}
        </button>
      ) : (
        <button
          onClick={() => suspendMutation.mutate({
            kind: resource.kind,
            namespace: resource.namespace,
            name: resource.name,
          })}
          disabled={suspendMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-600 hover:bg-slate-500 rounded-lg transition-colors disabled:opacity-50"
        >
          <Pause className="w-3.5 h-3.5" />
          {suspendMutation.isPending ? 'Suspending...' : 'Suspend'}
        </button>
      )}
    </>
  )
}

// ============================================================================
// ARGO ACTIONS
// ============================================================================

function ArgoActions({ resource, data }: { resource: SelectedResource; data: any }) {
  const syncMutation = useArgoSync()
  const refreshMutation = useArgoRefresh()
  const suspendMutation = useArgoSuspend()
  const resumeMutation = useArgoResume()

  const hasAutomatedSync = !!data?.spec?.syncPolicy?.automated

  return (
    <>
      <button
        onClick={() => syncMutation.mutate({
          namespace: resource.namespace,
          name: resource.name,
        })}
        disabled={syncMutation.isPending}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
        title="Sync application"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
        {syncMutation.isPending ? 'Syncing...' : 'Sync'}
      </button>

      <button
        onClick={() => refreshMutation.mutate({
          namespace: resource.namespace,
          name: resource.name,
          hard: false,
        })}
        disabled={refreshMutation.isPending}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-600 hover:bg-slate-500 rounded-lg transition-colors disabled:opacity-50"
        title="Refresh (re-read from git)"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
        {refreshMutation.isPending ? 'Refreshing...' : 'Refresh'}
      </button>

      {hasAutomatedSync ? (
        <button
          onClick={() => suspendMutation.mutate({
            namespace: resource.namespace,
            name: resource.name,
          })}
          disabled={suspendMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-600 hover:bg-slate-500 rounded-lg transition-colors disabled:opacity-50"
        >
          <Pause className="w-3.5 h-3.5" />
          {suspendMutation.isPending ? 'Suspending...' : 'Suspend'}
        </button>
      ) : (
        <button
          onClick={() => resumeMutation.mutate({
            namespace: resource.namespace,
            name: resource.name,
          })}
          disabled={resumeMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5" />
          {resumeMutation.isPending ? 'Enabling...' : 'Enable Auto-Sync'}
        </button>
      )}
    </>
  )
}

// ============================================================================
// REVISION HISTORY DIALOG
// ============================================================================

export function RevisionHistoryDialog({ kind, namespace, name, open, onClose, rollbackMutation }: {
  kind: string
  namespace: string
  name: string
  open: boolean
  onClose: () => void
  rollbackMutation: ReturnType<typeof useRollbackWorkload>
}) {
  const { data: revisions, isLoading, error } = useWorkloadRevisions(kind, namespace, name, open)
  const [confirmRevision, setConfirmRevision] = useState<number | null>(null)
  const [diffRevision, setDiffRevision] = useState<number | null>(null)

  if (!open) return null

  const currentRevision = revisions?.find(r => r.isCurrent)
  const selectedRevision = revisions?.find(r => r.number === diffRevision)
  const hasDiffData = currentRevision?.template && selectedRevision?.template

  function handleRollback(revision: number) {
    rollbackMutation.mutate(
      { kind, namespace, name, revision },
      {
        onSuccess: () => {
          setConfirmRevision(null)
          setDiffRevision(null)
          onClose()
        },
      }
    )
  }

  function formatTimeAgo(dateStr: string): string {
    const date = new Date(dateStr)
    const now = new Date()
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  function getImageTag(image: string): string {
    if (!image) return '-'
    const parts = image.split(':')
    if (parts.length > 1) return parts[parts.length - 1]
    const slashParts = image.split('/')
    return slashParts[slashParts.length - 1]
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={rollbackMutation.isPending ? undefined : () => { setDiffRevision(null); onClose() }}
      />

      <div className={clsx(
        "relative bg-theme-surface border border-theme-border rounded-lg shadow-2xl mx-4 outline-none flex flex-col",
        diffRevision ? "max-w-5xl w-full max-h-[85vh]" : "max-w-lg w-full"
      )}>
        <div className="flex items-center justify-between p-4 border-b border-theme-border shrink-0">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-amber-500" />
            <h3 className="text-lg font-semibold text-theme-text-primary">Revision History</h3>
            {diffRevision && currentRevision && (
              <span className="flex items-center gap-1 ml-2 px-2 py-0.5 text-xs bg-blue-500/15 text-blue-400 rounded">
                <GitCompare className="w-3 h-3" />
                #{currentRevision.number} vs #{diffRevision}
              </span>
            )}
          </div>
          <button
            onClick={() => { setDiffRevision(null); onClose() }}
            disabled={rollbackMutation.isPending}
            className="p-1 text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-elevated rounded disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className={clsx("p-4 overflow-y-auto", diffRevision ? "max-h-48 shrink-0" : "max-h-80")}>
            {isLoading && (
              <div className="flex items-center justify-center py-8 text-theme-text-secondary text-sm">
                Loading revisions...
              </div>
            )}

            {error && (
              <div className="flex items-center justify-center py-8 text-red-400 text-sm">
                Failed to load revisions: {error instanceof Error ? error.message : 'Unknown error'}
              </div>
            )}

            {revisions && revisions.length === 0 && (
              <div className="flex items-center justify-center py-8 text-theme-text-secondary text-sm">
                No revisions found
              </div>
            )}

            {revisions && revisions.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-theme-text-secondary text-left text-xs uppercase tracking-wider">
                    <th className="pb-2 pr-3 font-medium">Rev</th>
                    <th className="pb-2 pr-3 font-medium">Image</th>
                    <th className="pb-2 pr-3 font-medium">Age</th>
                    <th className="pb-2 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {revisions.map((rev: WorkloadRevision) => (
                    <tr
                      key={rev.number}
                      className={clsx(
                        "border-t border-theme-border/50",
                        diffRevision === rev.number && "bg-blue-500/10"
                      )}
                    >
                      <td className="py-2 pr-3 text-theme-text-primary font-mono">
                        #{rev.number}
                      </td>
                      <td className="py-2 pr-3 text-theme-text-secondary font-mono truncate max-w-[180px]" title={rev.image}>
                        {getImageTag(rev.image)}
                      </td>
                      <td className="py-2 pr-3 text-theme-text-secondary whitespace-nowrap">
                        {formatTimeAgo(rev.createdAt)}
                      </td>
                      <td className="py-2 text-right">
                        <div className="flex items-center gap-1 justify-end">
                          {!rev.isCurrent && rev.template && currentRevision?.template && (
                            <button
                              onClick={() => setDiffRevision(diffRevision === rev.number ? null : rev.number)}
                              className={clsx(
                                "px-2 py-0.5 text-xs font-medium rounded transition-colors flex items-center gap-1",
                                diffRevision === rev.number
                                  ? "bg-blue-500/20 text-blue-400 border border-blue-400/50"
                                  : "text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 border border-transparent"
                              )}
                              title={`Compare with current revision`}
                            >
                              <GitCompare className="w-3 h-3" />
                              Diff
                            </button>
                          )}
                          {rev.isCurrent ? (
                            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-green-500/20 text-green-400 rounded">
                              Current
                            </span>
                          ) : confirmRevision === rev.number ? (
                            <>
                              <button
                                onClick={() => handleRollback(rev.number)}
                                disabled={rollbackMutation.isPending}
                                className="px-2 py-0.5 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 rounded transition-colors disabled:opacity-50"
                              >
                                {rollbackMutation.isPending ? 'Rolling back...' : 'Confirm'}
                              </button>
                              <button
                                onClick={() => setConfirmRevision(null)}
                                disabled={rollbackMutation.isPending}
                                className="px-2 py-0.5 text-xs font-medium text-theme-text-secondary hover:text-theme-text-primary rounded transition-colors disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setConfirmRevision(rev.number)}
                              className="px-2 py-0.5 text-xs font-medium text-amber-400 hover:text-white hover:bg-amber-600 border border-amber-400/50 hover:border-amber-600 rounded transition-colors"
                            >
                              Rollback
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {diffRevision && hasDiffData && (
            <RevisionDiffView
              currentTemplate={currentRevision!.template!}
              selectedTemplate={selectedRevision!.template!}
              currentRevision={currentRevision!.number}
              selectedRevision={diffRevision}
            />
          )}
        </div>

        <div className="flex items-center justify-end p-4 border-t border-theme-border shrink-0">
          <button
            onClick={() => { setDiffRevision(null); onClose() }}
            disabled={rollbackMutation.isPending}
            className="px-4 py-2 text-sm font-medium text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-elevated rounded-lg transition-colors disabled:opacity-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// REVISION DIFF VIEW
// ============================================================================

function stripAutoLabels(templateYaml: string): string {
  return templateYaml
    .split('\n')
    .filter(line => !line.match(/^\s+pod-template-hash:/))
    .join('\n')
}

function RevisionDiffView({ currentTemplate, selectedTemplate, currentRevision, selectedRevision }: {
  currentTemplate: string
  selectedTemplate: string
  currentRevision: number
  selectedRevision: number
}) {
  const [expanded, setExpanded] = useState(false)

  const cleanCurrent = stripAutoLabels(currentTemplate)
  const cleanSelected = stripAutoLabels(selectedTemplate)

  const patch = createTwoFilesPatch(
    `Revision #${currentRevision} (current)`,
    `Revision #${selectedRevision}`,
    cleanCurrent,
    cleanSelected,
    '', '',
    expanded ? { context: 999999 } : { context: 3 }
  )

  const lines = patch.split('\n')
  const diffLines = lines.filter(line =>
    !line.startsWith('===') && !line.startsWith('Index:')
  )

  const hasChanges = diffLines.some(l => (l.startsWith('+') && !l.startsWith('+++')) || (l.startsWith('-') && !l.startsWith('---')))

  return (
    <div className="border-t border-theme-border flex flex-col shrink-0">
      <div className="flex items-center justify-between px-4 py-2 bg-theme-elevated/50 text-xs text-theme-text-secondary shrink-0">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-red-500/20 border border-red-500/50 rounded" /> Revision #{currentRevision} (current)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-green-500/20 border border-green-500/50 rounded" /> Revision #{selectedRevision}
          </span>
        </div>
        {hasChanges && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 px-2 py-0.5 text-xs text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-elevated rounded transition-colors"
          >
            <Code className="w-3 h-3" />
            {expanded ? 'Show changes only' : 'Show full spec'}
          </button>
        )}
      </div>
      <div className="overflow-auto max-h-[400px]">
        {hasChanges ? (
          <pre className="text-xs font-mono p-0 m-0">
            {diffLines.map((line, index) => {
              const isAddition = line.startsWith('+') && !line.startsWith('+++')
              const isDeletion = line.startsWith('-') && !line.startsWith('---')
              const isHeader = line.startsWith('@@') || line.startsWith('---') || line.startsWith('+++')

              return (
                <div
                  key={index}
                  className={clsx(
                    'flex',
                    isAddition && 'bg-green-500/10',
                    isDeletion && 'bg-red-500/10',
                    isHeader && 'bg-blue-500/10'
                  )}
                >
                  <span className="w-10 shrink-0 text-right pr-2 py-0.5 text-theme-text-disabled select-none border-r border-theme-border/50">
                    {index + 1}
                  </span>
                  <span
                    className={clsx(
                      'flex-1 px-3 py-0.5 whitespace-pre',
                      isAddition && 'text-green-400',
                      isDeletion && 'text-red-400',
                      isHeader && 'text-blue-400 font-medium',
                      !isAddition && !isDeletion && !isHeader && 'text-theme-text-secondary'
                    )}
                  >
                    {line || ' '}
                  </span>
                </div>
              )
            })}
          </pre>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-theme-text-tertiary">
            <GitCompare className="w-8 h-8 mb-2 text-theme-text-disabled" />
            <span className="text-sm">Templates are identical</span>
          </div>
        )}
      </div>
    </div>
  )
}
