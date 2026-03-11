import { useState } from 'react';
import { UserPlus, Mail, Trash2, Edit, Save } from 'lucide-react';
import Card, { CardHeader, CardTitle } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Avatar from '../../components/ui/Avatar';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import { mockUsers } from '../../lib/mockData';
import { useTenant } from '../../contexts/TenantContext';

export default function UsersPage() {
  const [users, setUsers] = useState(mockUsers);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'viewer', name: '' });
  const [sending, setSending] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const { organization } = useTenant();

  const handleInvite = async () => {
    setSending(true);
    await new Promise(r => setTimeout(r, 800));
    setUsers(prev => [...prev, {
      id: `usr-${Date.now()}`,
      name: inviteForm.name || inviteForm.email.split('@')[0],
      email: inviteForm.email,
      role: inviteForm.role,
      status: 'invited',
      lastLogin: null,
    }]);
    setShowInviteModal(false);
    setInviteForm({ email: '', role: 'viewer', name: '' });
    setSending(false);
  };

  const handleEdit = (user) => {
    setEditingUser({ ...user });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    setSending(true);
    await new Promise(r => setTimeout(r, 600));
    setUsers(prev => prev.map(u => u.id === editingUser.id ? editingUser : u));
    setShowEditModal(false);
    setEditingUser(null);
    setSending(false);
  };

  const handleDelete = async (id) => {
    if (deleteConfirm === id) {
      await new Promise(r => setTimeout(r, 500));
      setUsers(prev => prev.filter(u => u.id !== id));
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  const roleVariant = (role) => {
    const map = { admin: 'danger', operator: 'primary', escalation: 'warning', viewer: 'default' };
    return map[role] || 'default';
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Usuarios</h2>
          <p className="text-sm text-text-secondary mt-1">
            {users.length} de {organization.limits.maxUsers} usuarios
          </p>
        </div>
        <Button icon={UserPlus} onClick={() => setShowInviteModal(true)}>Invitar Usuario</Button>
      </div>

      <Table>
        <TableHeader>
          <tr>
            <TableHead>Usuario</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Último Acceso</TableHead>
            <TableHead className="w-12"></TableHead>
          </tr>
        </TableHeader>
        <TableBody>
          {users.map(user => (
            <TableRow key={user.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar name={user.name} size="sm" />
                  <div>
                    <p className="text-sm font-medium text-text-primary">{user.name}</p>
                    <p className="text-xs text-text-tertiary">{user.email}</p>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={roleVariant(user.role)} size="sm" className="capitalize">{user.role}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={user.status === 'active' ? 'success' : 'warning'} size="sm" dot>
                  {user.status === 'active' ? 'Activo' : 'Invitado'}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-text-secondary">
                {user.lastLogin ? new Date(user.lastLogin).toLocaleString('es-CO', { hour12: false }) : '—'}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleEdit(user)} className="p-1.5 rounded-lg hover:bg-surface-tertiary text-text-tertiary hover:text-text-primary transition-colors" title="Editar">
                    <Edit size={14} />
                  </button>
                  <button onClick={() => handleDelete(user.id)} className={`p-1.5 rounded-lg transition-colors ${deleteConfirm === user.id ? 'bg-danger-100 text-danger-600' : 'hover:bg-danger-50 text-text-tertiary hover:text-danger-600'}`} title={deleteConfirm === user.id ? 'Confirmar eliminación' : 'Eliminar'}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Invite Modal */}
      <Modal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        title="Invitar Usuario"
        description="El usuario recibirá un email con instrucciones para unirse"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowInviteModal(false)}>Cancelar</Button>
            <Button icon={Mail} loading={sending} onClick={handleInvite} disabled={!inviteForm.email}>
              Enviar Invitación
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Nombre completo"
            value={inviteForm.name}
            onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
            placeholder="Juan Pérez"
          />
          <Input
            label="Email"
            type="email"
            value={inviteForm.email}
            onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
            placeholder="usuario@empresa.com"
            icon={Mail}
          />
          <Select
            label="Rol"
            value={inviteForm.role}
            onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
            options={[
              { value: 'admin', label: 'Administrador — Acceso total' },
              { value: 'operator', label: 'Operador — Monitoreo y ejecución' },
              { value: 'escalation', label: 'Escalación — Operador avanzado' },
              { value: 'viewer', label: 'Viewer — Solo lectura' },
            ]}
          />
        </div>
      </Modal>
      {/* Edit Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => { setShowEditModal(false); setEditingUser(null); }}
        title="Editar Usuario"
        description="Modifica la información del usuario"
        footer={
          <>
            <Button variant="outline" onClick={() => { setShowEditModal(false); setEditingUser(null); }}>Cancelar</Button>
            <Button icon={Save} loading={sending} onClick={handleSaveEdit}>Guardar Cambios</Button>
          </>
        }
      >
        {editingUser && (
          <div className="space-y-4">
            <Input
              label="Nombre completo"
              value={editingUser.name}
              onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
            />
            <Input
              label="Email"
              type="email"
              value={editingUser.email}
              onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
            />
            <Select
              label="Rol"
              value={editingUser.role}
              onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
              options={[
                { value: 'admin', label: 'Administrador — Acceso total' },
                { value: 'operator', label: 'Operador — Monitoreo y ejecución' },
                { value: 'escalation', label: 'Escalación — Operador avanzado' },
                { value: 'viewer', label: 'Viewer — Solo lectura' },
              ]}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
