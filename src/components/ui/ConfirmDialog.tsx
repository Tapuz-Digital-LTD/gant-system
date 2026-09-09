import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { Modal } from './Dialog';

/**
 * The question you ask before something that cannot be taken back.
 *
 * Deliberately rare. A confirmation in front of a reversible action taxes the
 * ninety-nine people who meant it in order to protect the one who did not —
 * undo is the right shape for those. This is for the ones with no undo.
 *
 * `body` should say what goes, not restate the button. "Delete project" does
 * not make anybody picture the events and tasks underneath it.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open
      onOpenChange={(next) => !next && onCancel()}
      title={title}
      size="sm"
      footer={
        <>
          {/* Cancel first, and it is the plain one: the safe way out should be
              the easy one to hit by accident. */}
          <Button variant="secondary" onClick={onCancel}>
            ביטול
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="flex items-start gap-2.5 text-base text-ink">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-late" aria-hidden="true" />
        {body}
      </p>
    </Modal>
  );
}
