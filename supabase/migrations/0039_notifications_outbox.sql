drop policy if exists school_notifications_select_recipient on school_notifications;
create policy school_notifications_select_recipient on school_notifications
  for select using (
    school_id = current_school_id()
    and (
      created_by = auth.uid()
      or exists (
        select 1 from school_notification_recipients recipient
        where recipient.notification_id = school_notifications.id
          and recipient.profile_id = auth.uid()
      )
    )
  );

create or replace function send_school_notification(
  p_kind text,
  p_title text,
  p_body text,
  p_recipient_profile_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid := current_school_id();
  v_notification_id uuid;
begin
  if v_school_id is null or not has_permission('manage_notifications') then
    raise exception 'Not authorized to send notifications';
  end if;
  if p_kind not in ('notification', 'announcement') then
    raise exception 'Choose a notification or announcement';
  end if;
  if length(trim(coalesce(p_title, ''))) not between 2 and 160
     or length(trim(coalesce(p_body, ''))) not between 1 and 5000 then
    raise exception 'Enter a valid title and message';
  end if;

  if p_recipient_profile_id is not null and not exists (
    select 1 from profiles
    where id = p_recipient_profile_id and school_id = v_school_id and status = 'active'
  ) then
    raise exception 'The selected recipient is not an active user in this school';
  end if;

  insert into school_notifications (school_id, created_by, kind, title, body)
  values (v_school_id, auth.uid(), p_kind, trim(p_title), trim(p_body))
  returning id into v_notification_id;

  if p_recipient_profile_id is null then
    insert into school_notification_recipients (notification_id, profile_id)
    select v_notification_id, id from profiles
    where school_id = v_school_id and status = 'active';
  else
    insert into school_notification_recipients (notification_id, profile_id)
    values (v_notification_id, p_recipient_profile_id);
  end if;

  update school_notification_recipients
  set read_at = now()
  where notification_id = v_notification_id and profile_id = auth.uid();

  return v_notification_id;
end;
$$;