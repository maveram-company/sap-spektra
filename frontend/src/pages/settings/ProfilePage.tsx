import { useState } from 'react';
import { Save, User, Lock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import Card, { CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';

export default function ProfilePage() {
  const { user } = useAuth();
  const { organization } = useTenant();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: '',
    language: 'es',
  });
  const [passwordForm, setPasswordForm] = useState({
    current: '',
    newPassword: '',
    confirm: '',
  });

  const handleSaveProfile = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 600));
    setSaving(false);
  };

  const handleChangePassword = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 600));
    setPasswordForm({ current: '', newPassword: '', confirm: '' });
    setSaving(false);
  };

  const roleLabels = {
    admin: 'Administrador',
    operator: 'Operador',
    escalation: 'Escalación',
    viewer: 'Visualizador',
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-text-primary">Mi Perfil</h2>
        <p className="text-sm text-text-secondary mt-1">Gestiona tu información personal y preferencias</p>
      </div>

      <div className="space-y-6">
        {/* Profile Header */}
        <Card>
          <div className="flex items-center gap-4">
            <Avatar name={user?.name || user?.username} size="lg" />
            <div>
              <h3 className="text-lg font-semibold text-text-primary">{user?.name || user?.username}</h3>
              <p className="text-sm text-text-secondary">{user?.email}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="primary" size="sm" className="capitalize">{roleLabels[user?.role] || user?.role}</Badge>
                <span className="text-xs text-text-tertiary">{organization?.name}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Personal Info */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Información Personal</CardTitle>
              <CardDescription>Actualiza tus datos de contacto</CardDescription>
            </div>
            <User size={18} className="text-text-tertiary" />
          </CardHeader>
          <div className="space-y-4">
            <Input
              label="Nombre completo"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Input
              label="Teléfono"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+57 300 000 0000"
            />
          </div>
          <div className="flex justify-end mt-4">
            <Button icon={Save} loading={saving} onClick={handleSaveProfile}>Guardar Cambios</Button>
          </div>
        </Card>

        {/* Change Password */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Cambiar Contraseña</CardTitle>
              <CardDescription>Actualiza tu contraseña de acceso</CardDescription>
            </div>
            <Lock size={18} className="text-text-tertiary" />
          </CardHeader>
          <div className="space-y-4">
            <Input
              label="Contraseña actual"
              type="password"
              value={passwordForm.current}
              onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
            />
            <Input
              label="Nueva contraseña"
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
            />
            <Input
              label="Confirmar contraseña"
              type="password"
              value={passwordForm.confirm}
              onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
            />
          </div>
          <div className="flex justify-end mt-4">
            <Button
              variant="outline"
              icon={Lock}
              loading={saving}
              onClick={handleChangePassword}
              disabled={!passwordForm.current || !passwordForm.newPassword || passwordForm.newPassword !== passwordForm.confirm}
            >
              Cambiar Contraseña
            </Button>
          </div>
        </Card>

        {/* Session Info */}
        <Card>
          <CardHeader>
            <CardTitle>Sesión Activa</CardTitle>
          </CardHeader>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-text-tertiary uppercase tracking-wider mb-1">Último acceso</p>
              <p className="text-text-primary">{new Date().toLocaleString('es-CO')}</p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary uppercase tracking-wider mb-1">IP</p>
              <p className="text-text-primary font-mono">192.168.1.100</p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary uppercase tracking-wider mb-1">Navegador</p>
              <p className="text-text-primary">Chrome 124</p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary uppercase tracking-wider mb-1">SO</p>
              <p className="text-text-primary">macOS</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
