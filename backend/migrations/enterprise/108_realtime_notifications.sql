CREATE OR REPLACE FUNCTION notify_erp_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE topic text;
BEGIN
  IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['updated_at','last_seen_at'])
    IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['updated_at','last_seen_at']) THEN
    RETURN NULL;
  END IF;
  FOREACH topic IN ARRAY TG_ARGV LOOP
    PERFORM pg_notify('erp_changes',topic);
  END LOOP;
  RETURN NULL;
END;
$$;

DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('students','students'),('enrollments','students'),('student_suspensions','students'),
    ('payments','payments'),('payment_details','payments'),('payment_history','payments'),
    ('payment_void_requests','payments'),('payment_correction_requests','payments'),
    ('transfer_payment_verifications','payments'),('receipts','payments'),
    ('service_transactions','payments'),('service_receipts','payments'),
    ('course_cycles','schedules'),('course_cycle_schedule_assignments','schedules'),
    ('course_cycle_seat_reservations','schedules'),('course_cycle_instructors','schedules'),
    ('referred_instructor_schedule_blocks','schedules'),('student_schedules','schedules'),
    ('schedules','schedules'),('additional_driving_practices','schedules'),
    ('practical_sessions','schedules'),('practical_session_reschedules','schedules'),
    ('practical_evaluations','schedules'),('practical_evaluation_scores','schedules'),
    ('practical_session_topic_records','schedules'),('attendance_offline_evidence','schedules'),
    ('instructor_availability','schedules'),('instructor_availability_overrides','schedules'),
    ('instructor_profiles','schedules'),('instructor_group_members','schedules'),
    ('instructor_groups','schedules'),('instructor_group_pending_assignments','schedules'),
    ('instructor_course_capabilities','schedules'),('instructor_branch_priorities','schedules'),
    ('enrollment_instructor_assignments','schedules'),('intensive_instructor_rotation_assignments','schedules'),
    ('branch_course_intensive_rotation','schedules'),('branch_course_weekend_overrides','schedules'),
    ('branch_course_weekend_override_instructors','schedules'),('branch_course_programs','schedules'),
    ('branch_course_schedule_templates','schedules'),('course_holidays','schedules'),
    ('theory_class_schedules','schedules'),('theory_course_groups','schedules'),
    ('theory_group_students','schedules'),('theory_attendance','schedules'),
    ('student_documents','documents'),('documents','documents'),('atm_authorization_documents','documents'),
    ('notifications','notifications'),('history','activity'),('audit_logs','activity'),
    ('incidents','admin'),('branches','admin'),('cities','admin'),('provinces','admin'),
    ('courses','admin'),('course_types','admin'),('document_types','admin'),
    ('branch_courses','admin'),('branch_services','admin'),('branch_payment_methods','admin'),
    ('branch_staff_coverages','admin'),('branch_theory_settings','admin'),('branch_workflows','admin'),
    ('settings','admin'),('service_catalog','admin'),('payment_methods','admin'),
    ('training_routes','admin'),('vehicles','admin'),('staff_vacations','admin'),
    ('users','admin'),('user_roles','authorization'),('user_permissions','authorization'),
    ('roles','authorization'),('role_permissions','authorization'),('permissions','authorization'),
    ('referral_campaigns','referrals'),('referral_leads','referrals'),
    ('referral_lead_history','referrals'),('staff_referral_codes','referrals')
  ) AS mapping(table_name,topic) LOOP
    IF to_regclass('public.'||item.table_name) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS erp_realtime_change ON public.%I',item.table_name);
      EXECUTE format('CREATE TRIGGER erp_realtime_change AFTER INSERT OR UPDATE OR DELETE ON public.%I
        FOR EACH ROW EXECUTE FUNCTION notify_erp_change(%L)',item.table_name,item.topic);
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION notify_erp_session_revocation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('erp_changes','authorization');
  RETURN NULL;
END;
$$;
CREATE TRIGGER erp_realtime_session_revoked AFTER UPDATE OF revoked_at ON user_sessions
  FOR EACH ROW WHEN (OLD.revoked_at IS DISTINCT FROM NEW.revoked_at)
  EXECUTE FUNCTION notify_erp_session_revocation();
CREATE TRIGGER erp_realtime_user_disabled AFTER UPDATE OF active ON users
  FOR EACH ROW WHEN (OLD.active IS DISTINCT FROM NEW.active)
  EXECUTE FUNCTION notify_erp_session_revocation();

CREATE TRIGGER erp_realtime_mobile_capture AFTER UPDATE ON mobile_document_upload_tokens
  FOR EACH ROW EXECUTE FUNCTION notify_erp_change('documents');
