// Hand-authored to match supabase/migrations/*.sql for Phase 1.
// Once the Supabase project is live, regenerate with:
//   npx supabase gen types typescript --project-id <ref> > types/database.ts
// and this file becomes redundant — keep the shape identical so nothing
// downstream needs to change.

export type SchoolStatus = 'active' | 'suspended' | 'deactivated';
export type ProfileStatus = 'active' | 'suspended';

export interface Database {
  public: {
    Tables: {
      schools: {
        Row: Record<string, any> & {
          id: string;
          name: string;
          slug: string;
          school_type: string;
          education_levels: string[];
          address: string | null;
          region: string | null;
          district: string | null;
          phone: string | null;
          email: string | null;
          motto: string | null;
          logo_path: string | null;
          status: SchoolStatus;
          setup_step: number;
          setup_completed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['schools']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['schools']['Row']>;
        Relationships: [];
      };
      platform_admins: {
        Row: Record<string, any> & { profile_id: string; role: 'super_admin' | 'support'; created_at: string };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['platform_admins']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['platform_admins']['Row']>;
        Relationships: [];
      };
      profiles: {
        Row: Record<string, any> & {
          id: string;
          school_id: string | null;
          role_id: string | null;
          full_name: string;
          email: string;
          phone: string | null;
          avatar_path: string | null;
          status: ProfileStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['profiles']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['profiles']['Row']>;
        Relationships: [];
      };
      permissions: {
        Row: Record<string, any> & { id: string; code: string; module: string; action: string; description: string | null };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['permissions']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['permissions']['Row']>;
        Relationships: [];
      };
      roles: {
        Row: Record<string, any> & {
          id: string;
          school_id: string;
          name: string;
          description: string | null;
          is_system: boolean;
          created_at: string;
        };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['roles']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['roles']['Row']>;
        Relationships: [];
      };
      role_permissions: {
        Row: Record<string, any> & { role_id: string; permission_id: string };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['role_permissions']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['role_permissions']['Row']>;
        Relationships: [];
      };
      user_permission_overrides: {
        Row: Record<string, any> & { profile_id: string; permission_id: string; granted: boolean };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['user_permission_overrides']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['user_permission_overrides']['Row']>;
        Relationships: [];
      };
      academic_years: {
        Row: Record<string, any> & {
          id: string;
          school_id: string;
          name: string;
          start_date: string;
          end_date: string;
          is_current: boolean;
          created_at: string;
        };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['academic_years']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['academic_years']['Row']>;
        Relationships: [];
      };
      education_levels: {
        Row: Record<string, any> & { id: string; school_id: string; name: string; order_index: number; created_at: string };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['education_levels']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['education_levels']['Row']>;
        Relationships: [];
      };
      classes: {
        Row: Record<string, any> & {
          id: string;
          school_id: string;
          education_level_id: string;
          name: string;
          order_index: number;
          created_at: string;
        };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['classes']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['classes']['Row']>;
        Relationships: [];
      };
      streams: {
        Row: Record<string, any> & { id: string; school_id: string; class_id: string; name: string; created_at: string };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['streams']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['streams']['Row']>;
        Relationships: [];
      };
      subjects: {
        Row: Record<string, any> & { id: string; school_id: string; name: string; code: string | null; created_at: string };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['subjects']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['subjects']['Row']>;
        Relationships: [];
      };
      timetable_rooms: {
        Row: Record<string, any> & { id: string; school_id: string; name: string; room_type: string; capacity: number | null; available_days: number[]; available_period_ids: string[]; notes: string | null; created_by: string; created_at: string; updated_by: string | null; updated_at: string };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['timetable_rooms']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['timetable_rooms']['Row']>;
        Relationships: [];
      };
      timetable_periods: {
        Row: Record<string, any> & { id: string; school_id: string; name: string; starts_at: string; ends_at: string; order_index: number; is_break: boolean; created_by: string; created_at: string; updated_by: string | null; updated_at: string };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['timetable_periods']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['timetable_periods']['Row']>;
        Relationships: [];
      };
      timetables: {
        Row: Record<string, any> & { id: string; school_id: string; academic_year_id: string; term: string; name: string; level: string | null; status: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED'; is_dirty: boolean; created_by: string; created_at: string; updated_by: string | null; updated_at: string; published_at: string | null; published_by: string | null };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['timetables']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['timetables']['Row']>;
        Relationships: [];
      };
      timetable_entries: {
        Row: Record<string, any> & { id: string; timetable_id: string; school_id: string; class_id: string; subject_id: string; teacher_id: string | null; room_id: string | null; period_id: string; day_of_week: number; start_time: string | null; end_time: string | null; lesson_type: string; notes: string | null; created_by: string; created_at: string; updated_by: string | null; updated_at: string };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['timetable_entries']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['timetable_entries']['Row']>;
        Relationships: [];
      };
      timetable_rules: {
        Row: Record<string, any> & { id: string; school_id: string; name: string; rules: Record<string, unknown>; enabled: boolean; created_by: string; created_at: string; updated_by: string | null; updated_at: string };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['timetable_rules']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['timetable_rules']['Row']>;
        Relationships: [];
      };
      syllabus_topics: {
        Row: Record<string, any> & { id: string; school_id: string; subject_id: string; class_id: string; academic_year_id: string; title: string; description: string | null; target_lessons: number; order_index: number; created_at: string };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['syllabus_topics']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['syllabus_topics']['Row']>;
        Relationships: [];
      };
      syllabus_progress: {
        Row: Record<string, any> & { id: string; school_id: string; topic_id: string; lessons_completed: number; notes: string | null; updated_by: string | null; updated_at: string };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['syllabus_progress']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['syllabus_progress']['Row']>;
        Relationships: [];
      };
      grading_scales: {
        Row: Record<string, any> & { id: string; school_id: string; education_level_id: string | null; class_id: string | null; examination_type_id: string | null; academic_year_id: string | null; name: string; description: string | null; is_default: boolean; coverage_required: boolean; max_mark: number; minimum_pass_mark: number; status: 'active' | 'inactive'; effective_from: string | null; effective_to: string | null; version: number; created_at: string; updated_at: string };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['grading_scales']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['grading_scales']['Row']>;
        Relationships: [];
      };
      grade_bands: {
        Row: Record<string, any> & { id: string; grading_scale_id: string; grade_name: string; min_score: number; max_score: number; points: number | null; remark: string | null; passed: boolean; order_index: number; created_at: string };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['grade_bands']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['grade_bands']['Row']>;
        Relationships: [];
      };
      division_rules: {
        Row: Record<string, any> & { id: string; school_id: string; education_level_id: string | null; class_id: string | null; examination_type_id: string | null; academic_year_id: string | null; name: string; description: string | null; subjects_counted: number; minimum_subjects_required: number; maximum_subjects_allowed: number; selection_method: string; use_best_subjects: boolean; include_compulsory: boolean; auto_select_optional: boolean; include_subsidiary_subjects: boolean; allow_failed_subjects: boolean; compulsory_must_pass: boolean; failed_compulsory_fails_overall: boolean; division_zero_on_failure: boolean; minimum_passed_subjects: number; maximum_failed_subjects: number; principal_subjects_count: number | null; subsidiary_subjects_count: number | null; status: 'active' | 'inactive'; effective_from: string | null; effective_to: string | null; created_at: string };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['division_rules']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['division_rules']['Row']>;
        Relationships: [];
      };
      division_bands: {
        Row: Record<string, any> & { id: string; division_rule_id: string; division_name: string; min_points: number; max_points: number | null; description: string | null; passed: boolean; order_index: number; created_at: string };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['division_bands']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['division_bands']['Row']>;
        Relationships: [];
      };
      attendance_days: {
        Row: Record<string, any> & { id: string; school_id: string; attendance_date: string; approved: boolean; approved_by: string | null; approved_at: string | null; created_at: string };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['attendance_days']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['attendance_days']['Row']>;
        Relationships: [];
      };
      student_attendance: {
        Row: Record<string, any> & { id: string; school_id: string; attendance_day_id: string; student_id: string; class_id: string; stream_id: string | null; status: string; note: string | null; marked_by: string | null; created_at: string; updated_at: string };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['student_attendance']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['student_attendance']['Row']>;
        Relationships: [];
      };
      staff_attendance: {
        Row: Record<string, any> & { id: string; school_id: string; attendance_day_id: string; profile_id: string; signed_in_at: string | null; signed_out_at: string | null; created_at: string; updated_at: string };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['staff_attendance']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['staff_attendance']['Row']>;
        Relationships: [];
      };
      compulsory_subjects: {
        Row: Record<string, any> & { division_rule_id: string; subject_id: string; created_at: string };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['compulsory_subjects']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['compulsory_subjects']['Row']>;
        Relationships: [];
      };
      excluded_division_subjects: {
        Row: Record<string, any> & { division_rule_id: string; subject_id: string; created_at: string };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['excluded_division_subjects']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['excluded_division_subjects']['Row']>;
        Relationships: [];
      };
      examination_types: {
        Row: Record<string, any> & { id: string; school_id: string; name: string; contributes_to_final_result: boolean; contributes_to_division: boolean; created_at: string };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['examination_types']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['examination_types']['Row']>;
        Relationships: [];
      };
      exam_grading_configs: {
        Row: Record<string, any> & { id: string; school_id: string; examination_type_id: string; grading_scale_id: string | null; division_rule_id: string | null; use_standard_scale: boolean; contributes_to_final_result: boolean; contributes_to_division: boolean; created_at: string; updated_at: string };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['exam_grading_configs']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['exam_grading_configs']['Row']>;
        Relationships: [];
      };
      grading_configuration_versions: {
        Row: Record<string, any> & { id: string; school_id: string; grading_scale_id: string | null; division_rule_id: string | null; version_number: number; snapshot: Record<string, unknown>; created_by: string | null; created_at: string };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['grading_configuration_versions']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['grading_configuration_versions']['Row']>;
        Relationships: [];
      };
      student_exam_results: {
        Row: Record<string, any> & { id: string; school_id: string; examination_id: string; student_id: string; subject_count: number; pass_count: number; fail_count: number; aggregate: number | null; division: string | null; overall_remark: string | null; included_subject_ids: string[]; total_marks: number | null; average_mark: number | null; overall_status: string; position: number | null; configuration_version_id: string | null; status: 'DRAFT' | 'CALCULATED' | 'REVIEWED' | 'APPROVED' | 'PUBLISHED'; processed_at: string; updated_at: string };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['student_exam_results']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['student_exam_results']['Row']>;
        Relationships: [];
      };
      student_enrollments: {
        Row: Record<string, any> & { id: string; school_id: string; student_id: string; academic_year_id: string; class_id: string | null; stream_id: string | null; status: string; promoted_from_enrollment_id: string | null; placed_by: string | null; placed_at: string };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['student_enrollments']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['student_enrollments']['Row']>;
        Relationships: [];
      };
      student_transfer_requests: {
        Row: Record<string, any> & { id: string; source_school_id: string; target_school_id: string; source_student_id: string; target_student_id: string | null; student_snapshot: Record<string, unknown>; reason: string | null; status: string; requested_by: string; decided_by: string | null; requested_at: string; decided_at: string | null };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['student_transfer_requests']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['student_transfer_requests']['Row']>;
        Relationships: [];
      };
      exam_scheme_assignments: {
        Row: Record<string, any> & { id: string; school_id: string; examination_id: string; grading_scale_id: string | null; division_rule_id: string | null; created_by: string | null; created_at: string };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['exam_scheme_assignments']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['exam_scheme_assignments']['Row']>;
        Relationships: [];
      };
      audit_logs: {
        Row: Record<string, any> & {
          id: string;
          school_id: string | null;
          actor_id: string | null;
          action: string;
          resource_type: string;
          resource_id: string | null;
          metadata: Record<string, unknown>;
          ip_address: string | null;
          created_at: string;
        };
        Insert: Record<string, any> & Partial<Database['public']['Tables']['audit_logs']['Row']>;
        Update: Record<string, any> & Partial<Database['public']['Tables']['audit_logs']['Row']>;
        Relationships: [];
      };
    };
    Views: {};
    Functions: {
      register_school: {
        Args: {
          p_admin_user_id: string;
          p_school_name: string;
          p_slug: string;
          p_school_type: string;
          p_education_levels: string[];
          p_address: string | null;
          p_region: string | null;
          p_district: string | null;
          p_phone: string | null;
          p_email: string;
          p_motto: string | null;
          p_admin_full_name: string;
          p_school_id?: string;
          p_logo_path?: string | null;
        };
        Returns: string;
      };
      advance_setup_step: {
        Args: { p_step: number; p_completed?: boolean };
        Returns: undefined;
      };
      has_permission: { Args: { p_code: string }; Returns: boolean };
      current_school_id: { Args: Record<string, never>; Returns: string | null };
      is_super_admin: { Args: Record<string, never>; Returns: boolean };
      get_my_permission_codes: { Args: Record<string, never>; Returns: string[] };
      list_transfer_schools: { Args: Record<string, never>; Returns: { id: string; name: string; slug: string }[] };
      resolve_active_grading_configuration: {
        Args: { p_school_id: string; p_academic_year_id: string | null; p_education_level_id: string | null; p_class_id?: string | null; p_examination_type_id?: string | null };
        Returns: { grading_scale_id: string; division_rule_id: string | null }[];
      };
    };
    Enums: {};
    CompositeTypes: {};
  };
}
