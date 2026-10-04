ALTER TYPE public.favor_status ADD VALUE IF NOT EXISTS 'ready_for_confirmation' AFTER 'near_destination';
ALTER TYPE public.favor_status ADD VALUE IF NOT EXISTS 'code_entered' AFTER 'ready_for_confirmation';
ALTER TYPE public.dispute_state ADD VALUE IF NOT EXISTS 'evidence_collection' AFTER 'open';
ALTER TYPE public.dispute_state ADD VALUE IF NOT EXISTS 'additional_info_required' AFTER 'under_review';
ALTER TYPE public.dispute_state ADD VALUE IF NOT EXISTS 'appealed' AFTER 'resolved';
ALTER TYPE public.dispute_state ADD VALUE IF NOT EXISTS 'closed' AFTER 'appealed';