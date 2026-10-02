import { requireSchoolSession } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { ActionForm } from '@/components/ui/action-form';
import { Input } from '@/components/ui/input';
import { Label, Select, Textarea } from '@/components/ui/field';
import { sendSchoolNotification, markSchoolNotificationRead } from '@/lib/actions/notifications';

export default async function NotificationsPage() {
  const session = await requireSchoolSession();
  const supabase = await createServerSupabaseClient();
  const canSend = session.permissions.has('manage_notifications');
  const [deliveriesResult, usersResult] = await Promise.all([
    supabase.from('school_notification_recipients').select('notification_id, read_at').eq('profile_id', session.userId),
    canSend
      ? supabase.from('profiles').select('id, full_name, email').eq('school_id', session.school.id).eq('status', 'active').neq('id', session.userId).order('full_name')
      : Promise.resolve({ data: [], error: null }),
  ]);
  const deliveries = deliveriesResult.data;
  const users = usersResult.data;
  const { data: notifications, error: notificationsError } = await supabase
    .from('school_notifications')
    .select('id, created_by, kind, title, body, created_at')
    .eq('school_id', session.school.id)
    .order('created_at', { ascending: false })
    .limit(100);
  const deliveryByNotification = new Map((deliveries ?? []).map((delivery) => [delivery.notification_id, delivery]));
  const unreadCount = (deliveries ?? []).filter((delivery) => !delivery.read_at).length;
  const hasLoadError = Boolean(deliveriesResult.error || usersResult.error || notificationsError);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink">Notifications</h2>
        <p className="help-text">{unreadCount ? `${unreadCount} unread message${unreadCount === 1 ? '' : 's'}` : 'You are all caught up.'}</p>
      </div>

      {hasLoadError && <Card><p className="text-sm text-danger">Messages could not be loaded. Check that the latest Supabase notification migrations are applied and your role has access.</p></Card>}

      {canSend && <Card>
        <CardHeader><CardTitle>Send a notification or announcement</CardTitle></CardHeader>
        <ActionForm action={sendSchoolNotification} submitLabel="Send" className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="notification_kind">Message type</Label><Select id="notification_kind" name="kind" defaultValue="notification"><option value="notification">Notification</option><option value="announcement">Announcement</option></Select></div>
            <div><Label htmlFor="notification_recipient">Recipient</Label><Select id="notification_recipient" name="recipient_profile_id" defaultValue=""><option value="">All active school users</option>{(users ?? []).map((user) => <option key={user.id} value={user.id}>{user.full_name} · {user.email}</option>)}</Select></div>
          </div>
          <div><Label htmlFor="notification_title">Title</Label><Input id="notification_title" name="title" maxLength={160} required /></div>
          <div><Label htmlFor="notification_body">Message</Label><Textarea id="notification_body" name="body" rows={4} maxLength={5000} required /></div>
        </ActionForm>
      </Card>}

      <Card>
        <CardHeader>
          <CardTitle>Your messages</CardTitle>
        </CardHeader>
        {notifications?.length ? (
          <ul className="divide-y divide-line">
            {notifications.map((notification) => {
              const delivery = deliveryByNotification.get(notification.id);
              const unread = Boolean(delivery && !delivery.read_at);
              return <li key={notification.id} className="flex flex-wrap items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className={`text-sm ${unread ? 'font-semibold text-ink' : 'font-medium text-ink'}`}>{notification.title}</h3>
                    <span className="rounded-sm bg-paper px-2 py-0.5 text-xs capitalize text-ink-soft">{notification.kind}</span>
                    <span className="text-xs text-muted">{notification.created_by === session.userId ? 'Sent by you' : 'Received'}</span>
                    {unread && <span className="text-xs font-semibold text-brand-dark">Unread</span>}
                    {delivery?.read_at && <span className="text-xs text-muted">Read</span>}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{notification.body}</p>
                  <p className="mt-2 help-text">{new Date(notification.created_at).toLocaleString()}</p>
                </div>
                {unread && <ActionForm action={markSchoolNotificationRead} submitLabel="Mark as read" className="shrink-0">
                  <input type="hidden" name="notification_id" value={notification.id} />
                </ActionForm>}
              </li>
            })}
          </ul>
        ) : (
          <p className="help-text">No messages have been sent to you yet.</p>
        )}
      </Card>
    </div>
  );
}
