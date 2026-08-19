import React, { useState } from 'react';
import { X, UserPlus, Users, Shield, Trash2, CheckCircle2, UserCheck, Mail, ShieldAlert } from 'lucide-react';
import { UserAccess, UserRole } from '../types';

interface UserPermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: UserAccess[];
  currentUser: UserAccess;
  onAddUser: (newUser: UserAccess) => void;
  onUpdateUserRole: (userId: string, newRole: UserRole) => void;
  onRemoveUser: (userId: string) => void;
  onSwitchActiveUser: (user: UserAccess) => void;
}

export const UserPermissionsModal: React.FC<UserPermissionsModalProps> = ({
  isOpen,
  onClose,
  users,
  currentUser,
  onAddUser,
  onUpdateUserRole,
  onRemoveUser,
  onSwitchActiveUser
}) => {
  if (!isOpen) return null;

  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('editor');

  const isAdmin = currentUser.role === 'admin';

  const avatarColors = ['#F7414B', '#5059FF', '#2FA36B', '#FF732D', '#9A9291', '#3A3534'];

  const handleAddUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;

    // Check if email already exists
    if (users.some((u) => u.email.toLowerCase() === newEmail.trim().toLowerCase())) {
      alert('משתמש עם כתובת מייל זו כבר קיים במערכת');
      return;
    }

    const randomColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];

    const newUser: UserAccess = {
      id: `user-${Date.now()}`,
      email: newEmail.trim().toLowerCase(),
      name: newName.trim() || newEmail.split('@')[0],
      role: newRole,
      avatarBg: randomColor,
      addedAt: new Date().toISOString().slice(0, 10),
      accessibleBoards: ['all']
    };

    onAddUser(newUser);
    setNewEmail('');
    setNewName('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white border-2 border-[#3A3534] rounded-[28px] max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col xtra-sticker-shadow-lg text-right">
        {/* Header */}
        <div className="p-6 border-b-2 border-[#3A3534] bg-[#FAF8F7] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#5059FF] border-2 border-[#3A3534] xtra-sticker-shadow-sm flex items-center justify-center text-white">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-[#3A3534]">
                ניהול משתמשים והרשאות לפי מייל
              </h2>
              <p className="text-xs text-[#6B6362]">
                הענקת גישת עריכה או צפייה לחברי צוות ושותפים
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full border-2 border-[#3A3534] bg-white hover:bg-[#FFE7E8] text-[#3A3534] hover:text-[#F7414B] transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6 text-xs">
          {/* Active User Switcher Bar (Test & Simulation) */}
          <div className="bg-[#E6E7FF] border border-[#5059FF] rounded-2xl p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#5059FF] flex items-center gap-1.5">
                <UserCheck className="w-4 h-4" />
                <span>משתמש מחובר כעת במערכת (לבדיקת הרשאות):</span>
              </span>
              <span className="bg-white text-[#5059FF] font-bold px-2 py-0.5 rounded-full border border-[#C8CAFF] text-[11px]">
                {currentUser.role === 'admin' ? 'מנהל ראשי' : currentUser.role === 'editor' ? 'עורך' : 'צופה בלבד'}
              </span>
            </div>
            <p className="text-[#3A3534] text-[11px]">
              ניתן להחליף משתמש כדי לבדוק כיצד הגאנט מוצג עבור צופה בלבד (Viewer) או עורך (Editor):
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => onSwitchActiveUser(u)}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all border ${
                    u.email === currentUser.email
                      ? 'bg-[#3A3534] text-white border-[#3A3534] xtra-sticker-shadow-sm'
                      : 'bg-white text-[#3A3534] border-[#C7C1C0] hover:border-[#3A3534]'
                  }`}
                >
                  <span>{u.name} ({u.role})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Invite User by Email Form */}
          {isAdmin && (
            <form
              onSubmit={handleAddUserSubmit}
              className="bg-[#FAF8F7] border-2 border-[#3A3534] rounded-2xl p-4 flex flex-col gap-3"
            >
              <div className="flex items-center gap-2 text-sm font-extrabold text-[#F7414B]">
                <UserPlus className="w-4 h-4" />
                <span>מתן גישה למשתמש חדש לפי כתובת מייל</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="font-bold text-[#3A3534] block mb-1">כתובת אימייל: *</label>
                  <input
                    type="email"
                    required
                    placeholder="user@company.co.il"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-[#C7C1C0] bg-white font-mono text-[#3A3534]"
                  />
                </div>

                <div>
                  <label className="font-bold text-[#3A3534] block mb-1">שם מלא / תפקיד:</label>
                  <input
                    type="text"
                    placeholder="לדוגמה: שירה - מנהלת רווחה"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-[#C7C1C0] bg-white text-[#3A3534]"
                  />
                </div>

                <div>
                  <label className="font-bold text-[#3A3534] block mb-1">רמת הרשאה:</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                    className="w-full p-2.5 rounded-xl border border-[#C7C1C0] bg-white font-bold text-[#3A3534]"
                  >
                    <option value="editor">עורך מורשה (הוספה ועריכת משימות)</option>
                    <option value="viewer">צופה בלבד (צפייה וייצוא)</option>
                    <option value="admin">מנהל ראשי (ניהול מלא והרשאות)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full border-2 border-[#3A3534] bg-[#F7414B] hover:bg-[#DE2A34] text-white font-bold text-xs xtra-sticker-shadow-sm cursor-pointer"
                >
                  הוסף משתמש
                </button>
              </div>
            </form>
          )}

          {/* List of Authorized Users */}
          <div className="flex flex-col gap-3">
            <span className="text-sm font-extrabold text-[#3A3534]">
              רשימת בעלי גישה לגאנט ({users.length})
            </span>

            <div className="divide-y divide-[#E6E2E1] border border-[#E6E2E1] rounded-2xl bg-white overflow-hidden">
              {users.map((u) => {
                const isCurrentUser = u.email === currentUser.email;

                return (
                  <div
                    key={u.id}
                    className="p-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-[#FAF8F7] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs border border-[#3A3534]"
                        style={{ backgroundColor: u.avatarBg }}
                      >
                        {u.name.charAt(0)}
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#3A3534]">{u.name}</span>
                          {isCurrentUser && (
                            <span className="bg-[#FFE7E8] text-[#F7414B] font-bold text-[10px] px-2 py-0.5 rounded-full">
                              אתה
                            </span>
                          )}
                        </div>
                        <span className="text-[#6B6362] font-mono text-[11px]">{u.email}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {isAdmin && !isCurrentUser ? (
                        <select
                          value={u.role}
                          onChange={(e) => onUpdateUserRole(u.id, e.target.value as UserRole)}
                          className="px-2.5 py-1 rounded-lg border border-[#C7C1C0] bg-white font-bold text-[#3A3534]"
                        >
                          <option value="admin">מנהל ראשי</option>
                          <option value="editor">עורך מורשה</option>
                          <option value="viewer">צופה בלבד</option>
                        </select>
                      ) : (
                        <span
                          className={`px-3 py-1 rounded-full text-[11px] font-bold ${
                            u.role === 'admin'
                              ? 'bg-[#FFE7E8] text-[#F7414B]'
                              : u.role === 'editor'
                              ? 'bg-[#E6E7FF] text-[#5059FF]'
                              : 'bg-[#FAF8F7] text-[#6B6362]'
                          }`}
                        >
                          {u.role === 'admin' ? 'מנהל ראשי' : u.role === 'editor' ? 'עורך מורשה' : 'צופה בלבד'}
                        </span>
                      )}

                      {isAdmin && !isCurrentUser && (
                        <button
                          onClick={() => {
                            if (confirm(`האם להסיר את הגישה עבור ${u.email}?`)) {
                              onRemoveUser(u.id);
                            }
                          }}
                          className="p-1.5 rounded-lg hover:bg-[#FFE7E8] text-[#9A9291] hover:text-[#DE2A34]"
                          title="הסרת משתמש"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t-2 border-[#3A3534] bg-[#FAF8F7] flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-full bg-[#3A3534] hover:bg-[#241F1F] text-white font-bold text-xs xtra-sticker-shadow-sm cursor-pointer"
          >
            סיום וסגירה
          </button>
        </div>
      </div>
    </div>
  );
};
