import { TrackerStatus } from '@prisma/client';

/** History actions recorded in TrackerHistory.action. */
export const TrackerAction = {
  RECEIVED: 'RECEIVED',
  INSTALLED: 'INSTALLED',
  REMOVED: 'REMOVED',
  DECLARED_FAULTY: 'DECLARED_FAULTY',
  RETURNED: 'RETURNED',
  RESTOCKED: 'RESTOCKED',
} as const;

export type TrackerActionValue = (typeof TrackerAction)[keyof typeof TrackerAction];

/**
 * The single source of truth for manual status changes.
 *
 * IN_STOCK -> INSTALLED is intentionally absent: a tracker is only ever installed
 * by completing an intervention (see InterventionsService.complete), never by hand.
 */
export const TRACKER_TRANSITIONS: Record<
  TrackerStatus,
  Partial<Record<TrackerStatus, TrackerActionValue>>
> = {
  IN_STOCK: {
    FAULTY: TrackerAction.DECLARED_FAULTY,
  },
  INSTALLED: {
    RETURNED: TrackerAction.REMOVED,
    FAULTY: TrackerAction.DECLARED_FAULTY,
  },
  FAULTY: {
    RETURNED: TrackerAction.RETURNED,
  },
  RETURNED: {
    IN_STOCK: TrackerAction.RESTOCKED,
  },
};

/** Leaving INSTALLED always detaches the tracker from its vehicle. */
export const STATUSES_CLEARING_VEHICLE: TrackerStatus[] = [TrackerStatus.INSTALLED];

export function allowedTargetsFrom(status: TrackerStatus): TrackerStatus[] {
  return Object.keys(TRACKER_TRANSITIONS[status] ?? {}) as TrackerStatus[];
}
