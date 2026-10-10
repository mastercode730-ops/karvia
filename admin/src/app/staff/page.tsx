'use client';

import { dateTime, titleCase } from '@karvia/shared';
import { Fragment, useState } from 'react';
import { Shell, Table, Td } from '@/components/shell';
import { Button, ErrorBox, Field, Loading, Pill, Section, useToast } from '@/components/ui';
import { api, errMsg, useApi, useSession } from '@/lib/session';

export default function Staff() {
  const { user } = useSession();
  const { data, error, loading, reload } = useApi<any>('/admin/staff');
  const toast = useToast();
  const [add, setAdd] = useState({ phone: '', name: '', role: 'TELECALLER', staffRoleId: '' });
  const [editing, setEditing] = useState<any>(null);
  const run = async (fn: () => Promise<any>, ok: string) => {
    try {
      await fn();
      toast.show(ok);
      reload();
    } catch (e) {
      toast.show(errMsg(e), 'red');
    }
  };
  const groups = data ? [...new Set<string>(data.permissions.map((p: string) => p.split('.')[0]))] : [];

  return (
    <Shell title="Roles & staff">
      {toast.node}
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error.message} onRetry={reload} />}
      {data && (
        <>
          <Table head={['Staff member', 'Roles', 'Permission role', '2FA', 'Last login', '']} minWidth={760}>
            {data.users.map((u: any) => (
              <tr key={u.id}>
                <Td><b>{u.name ?? '—'}</b><span className="block text-xs text-muted">+91 {u.phone}</span></Td>
                <Td>{u.roles.filter((r: string) => ['ADMIN', 'SUBADMIN', 'TELECALLER'].includes(r)).map((r: string) => <Pill key={r} tone="blue">{r}</Pill>)}</Td>
                <Td>{u.staffRole?.name ?? '—'}</Td>
                <Td>{u.totpEnabled ? <Pill tone="green">On</Pill> : <Pill tone="amber">Not set up</Pill>}</Td>
                <Td className="text-muted">{u.lastLoginAt ? dateTime(u.lastLoginAt) : 'Never'}</Td>
                <Td>{u.id !== user?.id && u.roles.filter((r: string) => ['ADMIN', 'SUBADMIN', 'TELECALLER'].includes(r)).map((r: string) => <Button key={r} size="sm" variant="danger" onClick={() => run(() => api.post(`/admin/staff/${u.id}/remove`, { role: r }), 'Access removed')}>Remove {r.toLowerCase()}</Button>)}</Td>
              </tr>
            ))}
          </Table>
          <Section title="Add staff member">
            <form className="grid grid-cols-1 items-end gap-3 sm:grid-cols-5" onSubmit={(e) => { e.preventDefault(); run(() => api.post('/admin/staff', { ...add, staffRoleId: add.role === 'SUBADMIN' ? add.staffRoleId : null }), 'Staff added. They log in with their mobile and set up 2FA.').then(() => setAdd({ phone: '', name: '', role: 'TELECALLER', staffRoleId: '' })); }}>
              <Field label="Mobile" htmlFor="sp"><input id="sp" inputMode="numeric" maxLength={10} className="input" value={add.phone} onChange={(e) => setAdd({ ...add, phone: e.target.value.replace(/\D/g, '') })} /></Field>
              <Field label="Name" htmlFor="sn"><input id="sn" className="input" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} /></Field>
              <Field label="Role" htmlFor="sr"><select id="sr" className="input" value={add.role} onChange={(e) => setAdd({ ...add, role: e.target.value })}><option value="TELECALLER">Telecaller</option><option value="SUBADMIN">Sub-admin</option>{user?.activeRole === 'ADMIN' && <option value="ADMIN">Admin</option>}</select></Field>
              <Field label="Permission role" htmlFor="srr"><select id="srr" className="input" disabled={add.role !== 'SUBADMIN'} value={add.staffRoleId} onChange={(e) => setAdd({ ...add, staffRoleId: e.target.value })}><option value="">—</option>{data.roles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
              <Button type="submit" disabled={add.phone.length !== 10 || add.name.trim().length < 2 || (add.role === 'SUBADMIN' && !add.staffRoleId)}>Add</Button>
            </form>
          </Section>
          <Section title="Permission roles" action={<Button size="sm" variant="secondary" onClick={() => setEditing({ name: '', permissions: [] })}>+ New role</Button>}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-center text-xs">
                <thead><tr className="text-muted"><th className="border-b border-line p-2 text-left">Role</th>{data.permissions.map((p: string) => <th key={p} className="border-b border-line p-1 font-semibold">{p.replace('.', ' ')}</th>)}<th className="border-b border-line p-2">Users</th><th className="border-b border-line" /></tr></thead>
                <tbody>
                  {data.roles.map((r: any) => (
                    <tr key={r.id}><td className="border-b border-line p-2 text-left font-semibold">{r.name}</td>{data.permissions.map((p: string) => <td key={p} className="border-b border-line p-1">{r.permissions.includes(p) ? <span className="text-brand">●</span> : <span className="text-line-strong">—</span>}</td>)}<td className="border-b border-line">{r._count.users}</td><td className="border-b border-line"><button className="font-semibold text-brand" onClick={() => setEditing({ ...r })}>Edit</button></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            {editing && (
              <form className="flex flex-col gap-3 rounded-xl bg-canvas p-4" onSubmit={(e) => { e.preventDefault(); run(() => (editing.id ? api.patch(`/admin/staff-roles/${editing.id}`, { name: editing.name, permissions: editing.permissions }) : api.post('/admin/staff-roles', { name: editing.name, permissions: editing.permissions })), 'Role saved').then(() => setEditing(null)); }}>
                <Field label="Role name" htmlFor="rn"><input id="rn" className="input max-w-sm" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
                  {groups.map((g) => (
                    <Fragment key={g}>
                      {data.permissions.filter((p: string) => p.startsWith(`${g}.`)).map((p: string) => (
                        <label key={p} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.permissions.includes(p)} onChange={() => setEditing({ ...editing, permissions: editing.permissions.includes(p) ? editing.permissions.filter((x: string) => x !== p) : [...editing.permissions, p] })} />{titleCase(p.replace('.', ' '))}</label>
                      ))}
                    </Fragment>
                  ))}
                </div>
                <div className="flex gap-2"><Button type="submit" disabled={editing.name.trim().length < 2}>Save role</Button><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button></div>
              </form>
            )}
          </Section>
        </>
      )}
    </Shell>
  );
}
