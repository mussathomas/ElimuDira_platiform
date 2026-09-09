-- Syllabus topics and the latest teaching coverage for each topic.

create table syllabus_topics (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references schools (id) on delete cascade,
  subject_id        uuid not null references subjects (id) on delete cascade,
  class_id          uuid not null references classes (id) on delete cascade,
  academic_year_id  uuid not null references academic_years (id) on delete cascade,
  title             text not null,
  description       text,
  target_lessons    int not null default 1 check (target_lessons > 0),
  order_index       int not null default 0,
  created_at        timestamptz not null default now(),
  unique (school_id, subject_id, class_id, academic_year_id, title)
);

create index syllabus_topics_school_idx on syllabus_topics (school_id);
create index syllabus_topics_class_idx on syllabus_topics (class_id);
create index syllabus_topics_subject_idx on syllabus_topics (subject_id);

create table syllabus_progress (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references schools (id) on delete cascade,
  topic_id          uuid not null unique references syllabus_topics (id) on delete cascade,
  lessons_completed int not null default 0 check (lessons_completed >= 0),
  notes             text,
  updated_by        uuid references profiles (id) on delete set null,
  updated_at        timestamptz not null default now()
);

create index syllabus_progress_school_idx on syllabus_progress (school_id);

alter table syllabus_topics enable row level security;
alter table syllabus_progress enable row level security;

create policy syllabus_topics_select on syllabus_topics
  for select using (school_id = current_school_id() and has_permission('view_syllabus') or is_super_admin());
create policy syllabus_topics_write on syllabus_topics
  for all using (school_id = current_school_id() and has_permission('edit_syllabus'))
  with check (school_id = current_school_id());

create policy syllabus_progress_select on syllabus_progress
  for select using (school_id = current_school_id() and has_permission('view_syllabus') or is_super_admin());
create policy syllabus_progress_write on syllabus_progress
  for all using (school_id = current_school_id() and has_permission('edit_syllabus'))
  with check (school_id = current_school_id());

create trigger syllabus_progress_set_updated_at
  before update on syllabus_progress
  for each row execute function set_updated_at();