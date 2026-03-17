import { useState, useEffect, useRef } from 'react';
import { UserPlus, Mail, Trash2, Edit, Save, AlertTriangle } from 'lucide-react';
import Card, { CardHeader, CardTitle } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Avatar from '../../components/ui/Avatar';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import PageLoading from '../../components/ui/PageLoading';
import { dataService } from '../../services/dataService';
import { useTenant } from '../../contexts/TenantContext';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    dataService.getUsers()
      .then(data => { if (mounted) setUsers(data); })
      .catch(err => { if (mounted) setError(err.message); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'viewer', name: '' });
  const [sending, setSending] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { organization } = useTenant();

  useEffect(() => {
    return () => {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    };
  }, []);

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const VALID_ROLES = ['admin', 'operator', 'escalation', 'viewer'];

  const validateField = (name, value) => {
    switch (name) {
      case 'email':
        if (!value.trim()) return 'Email es requerido';
        if (!EMAIL_REGEX.test(value.trim())) return 'Formato de email inválido';
        return null;
      case 'name':
        if (!value.trim()) return 'Nombre es requerido';
        if (value.trim().length < 2) return 'Mínimo 2 caracteres';
        return null;
      case 'role':
        if (!VALID_ROLES.includes(value)) return 'Selecciona un rol válido';
        return null;
      default:
        return null;
    }
  };

  const validateForm = (form) => {
    const errors: Record<string, string> = {};
    const emailErr = validateField('email', form.email);
    if (emailErr) errors.email = emailErr;
    const nameErr = validateField('name', form.name);
    if (nameErr) errors.name = nameErr;
    const roleErr = validateField('role', form.role);
    if (roleErr) errors.role = roleErr;
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInvite = async () => {
    if (!validateForm(inviteForm)) return;
    setSending(true);
    setActionError(null);
    try {
      // Demo mode: simulated delay — connect to real API when available
      await new Promise(r => setTimeout(r, 800));
      setUsers(prev => [...prev, {
        id: `usr-${Date.now()}`,
        name: inviteForm.name.trim() || inviteForm.email.trim().split('@')[0],
        email: inviteForm.email.trim(),
        role: inviteForm.role,
        status: 'invited',
        lastLogin: null,
      }]);
      setShowInviteModal(false);
      setInviteForm({ email: '', role: 'viewer', name: '' });
      setFieldErrors({});
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Error al enviar invitación');
    } finally {
      setSending(false);
    }
  };

  const handleEdit = (user) => {
    setEditingUser({ ...user });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!validateForm(editingUser)) return;
    setSending(true);
    setActionError(null);
    try {
      // Demo mode: simulated delay — connect to real API when available
      await new Promise(r => setTimeout(r, 600));
      setUsers(prev => prev.map(u => u.id === editingUser.id ? editingUser : u));
      setShowEditModal(false);
      setEditingUser(null);
      setFieldErrors({});
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Error al guardar cambios');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id) => {
    if (deleteConfirm === id) {
      setActionError(null);
      try {
        // Demo mode: simulated delay — connect to real API when available
        await new Promise(r => setTimeout(r, 500));
        setUsers(prev => prev.filter(u => u.id !== id));
        setDeleteConfirm(null);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Error al eliminar usuario');
      }
    } else {
      setDeleteConfirm(id);
      deleteTimerRef.current = setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  const roleVariant = (role) => {
    const map = { admin: 'danger', operator: 'primary', escalation: 'warning', viewer: 'default' };
    return map[role] || 'default';
  };

  if (loading) return <PageLoading message="Cargando usuarios..." />;

  if (error) return (
    <div className="max-w-4xl">
      <EmptyState icon={AlertTriangle} title="Error al cargar usuarios" description={error} />
    </div>
  );

  return (
    <div className="max-w-4xl">
      {actionError && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm flex items-center gap-2">
          <AlertTriangle size={14} className="flex-shrink-0" />
          {actionError}
          <button type="button" onClick={() => setActionError(null)} className="ml-auto opacity-60 hover:opacity-100">×</button>
        </div>
      )}
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
                  <button type="button" onClick={() => handleEdit(user)} className="p-1.5 rounded-lg hover:bg-surface-tertiary text-text-tertiary hover:text-text-primary transition-colors" title="Editar">
                    <Edit size={14} />
                  </button>
                  <button type="button" onClick={() => handleDelete(user.id)} className={`p-1.5 rounded-lg transition-colors ${deleteConfirm === user.id ? 'bg-danger-100 text-danger-600' : 'hover:bg-danger-50 text-text-tertiary hover:text-danger-600'}`} title={deleteConfirm === user.id ? 'Confirmar eliminación' : 'Eliminar'}>
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
        onClose={() => { setShowInviteModal(false); setFieldErrors({}); }}
        title="Invitar Usuario"
        description="El usuario recibirá un email con instrucciones para unirse"
        footer={
          <>
            <Button variant="outline" onClick={() => { setShowInviteModal(false); setFieldErrors({}); }}>Cancelar</Button>
            <Button icon={Mail} loading={sending} onClick={handleInvite}>
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
            error={fieldErrors.name}
          />
          <Input
            label="Email"
            type="email"
            value={inviteForm.email}
            onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
            placeholder="usuario@empresa.com"
            icon={Mail}
            error={fieldErrors.email}
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
            error={fieldErrors.role}
          />
        </div>
      </Modal>
      {/* Edit Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => { setShowEditModal(false); setEditingUser(null); setFieldErrors({}); }}
        title="Editar Usuario"
        description="Modifica la información del usuario"
        footer={
          <>
            <Button variant="outline" onClick={() => { setShowEditModal(false); setEditingUser(null); setFieldErrors({}); }}>Cancelar</Button>
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
              error={fieldErrors.name}
            />
            <Input
              label="Email"
              type="email"
              value={editingUser.email}
              onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
              error={fieldErrors.email}
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
              error={fieldErrors.role}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
