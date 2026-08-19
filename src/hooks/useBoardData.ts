import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { api, ApiError, type EventInput, type TaskInput } from '../services/api';
import { EventItem, TaskItem } from '../types';

/** Query keys in one place so a mutation can never invalidate the wrong cache entry. */
export const keys = {
  boards: ['boards'] as const,
  users: ['users'] as const,
  events: (boardId: string, from: string, to: string) => ['events', boardId, from, to] as QueryKey,
  comments: (eventId: string) => ['comments', eventId] as QueryKey,
  activity: (eventId: string) => ['activity', eventId] as QueryKey
};

export function useBoards(enabled = true) {
  return useQuery({ queryKey: keys.boards, queryFn: api.boards.list, staleTime: 30_000, enabled });
}

export function useUsers() {
  return useQuery({ queryKey: keys.users, queryFn: api.users.list, staleTime: 5 * 60_000 });
}

export function useEvents(boardId: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: keys.events(boardId ?? '', from, to),
    queryFn: () => api.events.list(boardId!, from, to),
    enabled: Boolean(boardId),
    // Keep the previous window on screen while the next one loads — no flash.
    placeholderData: (prev) => prev
  });
}

export function useComments(eventId: string | undefined) {
  return useQuery({
    queryKey: keys.comments(eventId ?? ''),
    queryFn: () => api.comments.list(eventId!),
    enabled: Boolean(eventId)
  });
}

/**
 * Every mutation below writes to the server first and reconciles the cache from
 * the response. The prototype did the opposite — it painted the change locally
 * and let failures vanish into console.error.
 */
export function useBoardMutations() {
  const qc = useQueryClient();
  const invalidateBoards = () => qc.invalidateQueries({ queryKey: keys.boards });

  return {
    create: useMutation({ mutationFn: api.boards.create, onSuccess: invalidateBoards }),
    update: useMutation({
      mutationFn: (v: { id: string; name?: string; description?: string; archived?: boolean }) =>
        api.boards.update(v.id, v),
      onSuccess: invalidateBoards
    }),
    duplicate: useMutation({
      mutationFn: (v: { id: string; name?: string }) => api.boards.duplicate(v.id, v.name),
      onSuccess: () => {
        invalidateBoards();
        qc.invalidateQueries({ queryKey: ['events'] });
      }
    }),
    archive: useMutation({ mutationFn: api.boards.archive, onSuccess: invalidateBoards })
  };
}

export function useEventMutations(boardId: string | undefined, from: string, to: string) {
  const qc = useQueryClient();
  const key = keys.events(boardId ?? '', from, to);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['events'] });
    qc.invalidateQueries({ queryKey: keys.boards });
  };

  /** Replace one event in place so the open modal updates without a refetch flash. */
  const patchCache = (updated: EventItem) => {
    qc.setQueryData<EventItem[]>(key, (prev) =>
      prev?.map((e) => (e.id === updated.id ? { ...updated, tasks: updated.tasks ?? e.tasks } : e))
    );
  };

  return {
    create: useMutation({
      mutationFn: (input: EventInput) => api.events.create(boardId!, input),
      onSuccess: refresh
    }),

    /**
     * Optimistic: the change lands on screen the moment it is made, then the
     * server's answer replaces it. Without this a dragged kanban card sits still
     * for a whole round-trip and then jumps, which reads as a broken interface.
     */
    update: useMutation({
      mutationFn: (v: { id: string; version: number; changes: Partial<EventInput> }) =>
        api.events.update(v.id, v.version, v.changes),

      onMutate: async (v) => {
        // Stop an in-flight refetch from overwriting what we are about to paint.
        await qc.cancelQueries({ queryKey: ['events'] });
        const snapshot = qc.getQueriesData<EventItem[]>({ queryKey: ['events'] });

        qc.setQueriesData<EventItem[]>({ queryKey: ['events'] }, (prev) =>
          prev?.map((e) => (e.id === v.id ? { ...e, ...v.changes } : e))
        );

        return { snapshot };
      },

      onError: (_err, _v, context) => {
        // Put every cache entry back exactly as it was.
        context?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
      },

      onSuccess: (updated) => patchCache(updated),

      // Reconcile either way: the server owns the version number.
      onSettled: () => qc.invalidateQueries({ queryKey: ['events'] })
    }),

    archive: useMutation({ mutationFn: api.events.archive, onSuccess: refresh }),

    createTask: useMutation({
      mutationFn: (v: { eventId: string; input: TaskInput }) => api.tasks.create(v.eventId, v.input),
      onSuccess: (task) => {
        qc.setQueryData<EventItem[]>(key, (prev) =>
          prev?.map((e) => (e.id === task.eventId ? { ...e, tasks: [...e.tasks, task] } : e))
        );
        qc.invalidateQueries({ queryKey: ['events'] });
      }
    }),

    updateTask: useMutation({
      mutationFn: (v: { id: string; version: number; changes: Partial<TaskInput> }) =>
        api.tasks.update(v.id, v.version, v.changes),

      onMutate: async (v) => {
        await qc.cancelQueries({ queryKey: ['events'] });
        const snapshot = qc.getQueriesData<EventItem[]>({ queryKey: ['events'] });
        qc.setQueriesData<EventItem[]>({ queryKey: ['events'] }, (prev) =>
          prev?.map((e) => ({
            ...e,
            tasks: e.tasks.map((t) => (t.id === v.id ? { ...t, ...v.changes } : t))
          }))
        );
        return { snapshot };
      },

      onError: (_err, _v, context) => {
        context?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
      },

      onSuccess: (task: TaskItem) => {
        qc.setQueryData<EventItem[]>(key, (prev) =>
          prev?.map((e) =>
            e.id === task.eventId ? { ...e, tasks: e.tasks.map((t) => (t.id === task.id ? task : t)) } : e
          )
        );
      },

      onSettled: () => qc.invalidateQueries({ queryKey: ['events'] })
    }),

    deleteTask: useMutation({
      mutationFn: (v: { id: string; eventId: string }) => api.tasks.remove(v.id),
      onSuccess: (_r, v) => {
        qc.setQueryData<EventItem[]>(key, (prev) =>
          prev?.map((e) =>
            e.id === v.eventId ? { ...e, tasks: e.tasks.filter((t) => t.id !== v.id) } : e
          )
        );
        qc.invalidateQueries({ queryKey: ['events'] });
      }
    }),

    createComment: useMutation({
      mutationFn: (v: { eventId: string; body: string }) =>
        api.comments.create(v.eventId, { body: v.body }),
      onSuccess: (_c, v) => qc.invalidateQueries({ queryKey: keys.comments(v.eventId) })
    })
  };
}

/** Turns any thrown value into something a person can read. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isConflict) return 'מישהו אחר שינה את זה בינתיים. רענן את הדף';
    if (error.details?.length) return error.details.map((d) => d.message).join(' · ');
    return error.message;
  }
  if (error instanceof TypeError) return 'לא הצלחנו להתחבר. נסה שוב בעוד רגע';
  return 'משהו השתבש. נסה שוב';
}

/* ---------------- people ---------------- */

export function usePeople(enabled: boolean) {
  return useQuery({ queryKey: ['people'], queryFn: api.people.list, enabled });
}

export function usePeopleMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['people'] });
    qc.invalidateQueries({ queryKey: keys.users });
  };

  return {
    add: useMutation({ mutationFn: api.people.create, onSuccess: refresh }),
    update: useMutation({
      mutationFn: (v: { id: string; name?: string; role?: 'admin' | 'editor' | 'viewer' }) =>
        api.people.update(v.id, v),
      onSuccess: refresh
    }),
    remove: useMutation({ mutationFn: api.people.remove, onSuccess: refresh }),
    grant: useMutation({
      mutationFn: (v: { boardId: string; userId: string; role: 'editor' | 'viewer' }) =>
        api.people.grantBoard(v.boardId, v.userId, v.role),
      onSuccess: refresh
    }),
    revoke: useMutation({
      mutationFn: (v: { boardId: string; userId: string }) =>
        api.people.revokeBoard(v.boardId, v.userId),
      onSuccess: refresh
    })
  };
}

export function usePermissions(enabled: boolean) {
  return useQuery({ queryKey: ['permissions'], queryFn: api.permissions.get, enabled });
}

export function usePermissionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { role: 'admin' | 'editor' | 'viewer'; permission: string; allowed: boolean }) =>
      api.permissions.set(v.role, v.permission, v.allowed),
    // Tick immediately; the server's answer replaces it. A checkbox that waits
    // for a round-trip feels broken.
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ['permissions'] });
      const snapshot = qc.getQueryData(['permissions']);
      qc.setQueryData(['permissions'], (prev: unknown) => {
        const p = prev as { matrix: Record<string, Record<string, boolean>> } | undefined;
        if (!p) return prev;
        return { ...p, matrix: { ...p.matrix, [v.role]: { ...p.matrix[v.role], [v.permission]: v.allowed } } };
      });
      return { snapshot };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(['permissions'], ctx?.snapshot),
    onSettled: () => qc.invalidateQueries({ queryKey: ['permissions'] })
  });
}

/** Holidays never change for a given range, so they are cached hard. */
export function useHolidays(from: string, to: string, enabled: boolean) {
  return useQuery({
    queryKey: ['holidays', from, to],
    queryFn: () => api.holidays.list(from, to),
    enabled,
    staleTime: 24 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000
  });
}

/**
 * Runs only when asked. The old behaviour searched on every keystroke and
 * silently filtered the board, which left people unsure what had happened.
 */
export function useSearch(boardId: string | undefined, query: string) {
  return useQuery({
    queryKey: ['search', boardId, query],
    queryFn: () => api.events.search(boardId!, query),
    enabled: Boolean(boardId) && query.trim().length >= 2,
    staleTime: 30_000
  });
}
