import React, { useState } from 'react';
import { Plus, Pencil, Trash2, LayoutGrid, Check, X } from 'lucide-react';
import { GanttBoard, UserAccess } from '../types';
import { Modal, Button, Field, Input, Textarea, Badge, Tooltip, cn } from './ui';

interface BoardManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  boards: GanttBoard[];
  activeBoardId: string;
  currentUser: UserAccess;
  onSelectBoard: (id: string) => void;
  onCreateBoard: (input: { name: string; description?: string }) => void;
  onRenameBoard: (id: string, name: string) => void;
  onDeleteBoard: (id: string) => void;
}

export const BoardManagementModal: React.FC<BoardManagementModalProps> = ({
  isOpen,
  onClose,
  boards,
  activeBoardId,
  currentUser,
  onSelectBoard,
  onCreateBoard,
  onRenameBoard,
  onDeleteBoard
}) => {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canEdit = currentUser.role === 'admin' || currentUser.role === 'editor';
  const isAdmin = currentUser.role === 'admin';

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onCreateBoard({ name: newName.trim(), description: newDesc.trim() });
    setNewName('');
    setNewDesc('');
    setCreating(false);
  };

  return (
    <Modal
      open={isOpen}
      onOpenChange={(o) => !o && onClose()}
      title="ניהול בחר לוח"
      description={`${boards.length} בחר לוח`}
      footer={
        <>
          {canEdit && !creating && (
            <Button variant="secondary" className="me-auto" onClick={() => setCreating(true)}>
              <Plus className="h-5 w-5" />
              לוח חדש
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            סגור
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {creating && (
          <form onSubmit={create} className="flex flex-col gap-3 rounded-lg bg-canvas p-3">
            <span className="text-base font-semibold text-ink">לוח חדש</span>
            <Field label="שם הלוח" required htmlFor="bm-name">
              <Input
                id="bm-name"
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="גאנט קמפיינים 2029"
              />
            </Field>
            <Field label="תיאור" htmlFor="bm-desc">
              <Textarea id="bm-desc" rows={2} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" variant="primary" size="sm" disabled={!newName.trim()}>
                יצירה
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
                בטל שינוי בשם הלוח
              </Button>
            </div>
          </form>
        )}

        <ul className="flex flex-col gap-1.5">
          {boards.map((b) => {
            const active = b.id === activeBoardId;
            const renaming = renamingId === b.id;
            const deleting = deletingId === b.id;

            return (
              <li
                key={b.id}
                className={cn(
                  'flex min-w-0 items-start gap-3 rounded-lg border px-3 py-3 transition-colors',
                  active ? 'border-primary-line bg-primary-soft/50' : 'border-line hover:bg-canvas'
                )}
              >
                <span
                  className={cn(
                    'grid h-9 w-9 shrink-0 place-items-center rounded-lg',
                    active ? 'bg-primary text-white' : 'bg-canvas text-ink-tertiary'
                  )}
                >
                  <LayoutGrid className="h-5 w-5" />
                </span>

                {renaming ? (
                  <form
                    className="flex flex-1 items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (renameValue.trim()) onRenameBoard(b.id, renameValue.trim());
                      setRenamingId(null);
                    }}
                  >
                    <Input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
                    <Button type="submit" variant="primary" size="sm" iconOnly aria-label="שמור את שם הלוח">
                      <Check className="h-5 w-5" />
                    </Button>
                    <Button variant="ghost" size="sm" iconOnly onClick={() => setRenamingId(null)} aria-label="בטל שינוי בשם הלוח">
                      <X className="h-5 w-5" />
                    </Button>
                  </form>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        onSelectBoard(b.id);
                        onClose();
                      }}
                      className="flex min-w-0 flex-1 flex-col gap-0.5 text-start"
                    >
                      <span className="flex w-full min-w-0 items-center gap-2">
                        <span className="truncate text-base font-semibold text-ink">{b.name}</span>
                        {active && <Badge tone="primary">פעיל</Badge>}
                      </span>
                      {b.description && (
                        <span className="w-full text-sm leading-snug text-ink-tertiary">
                          {b.description}
                        </span>
                      )}
                    </button>

                    <span className="mt-1 hidden shrink-0 text-sm text-ink-tertiary tnum sm:block">{b.eventCount} אירועים</span>

                    {deleting ? (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="text-sm text-ink-secondary">להעביר לארכיון?</span>
                        <Button variant="ghost" size="sm" onClick={() => setDeletingId(null)}>
                          לא
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            onDeleteBoard(b.id);
                            setDeletingId(null);
                          }}
                        >
                          העבר לארכיון
                        </Button>
                      </div>
                    ) : (
                      canEdit && (
                        <div className="flex shrink-0 items-center gap-0.5 self-start">
                          <Tooltip label="שנה שם">
                            <Button
                              variant="ghost"
                              size="sm"
                              iconOnly
                              aria-label={`שנה את השם של ${b.name}`}
                              onClick={() => {
                                setRenamingId(b.id);
                                setRenameValue(b.name);
                              }}
                            >
                              <Pencil className="h-5 w-5" />
                            </Button>
                          </Tooltip>

                          {isAdmin && boards.length > 1 && (
                            <Tooltip label="העבר לארכיון">
                              <Button
                                variant="ghost"
                                size="sm"
                                iconOnly
                                aria-label={`העבר את ${b.name} לארכיון`}
                                onClick={() => setDeletingId(b.id)}
                              >
                                <Trash2 className="h-5 w-5" />
                              </Button>
                            </Tooltip>
                          )}
                        </div>
                      )
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
};
