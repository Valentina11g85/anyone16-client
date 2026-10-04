ALTER TYPE public.favor_status ADD VALUE IF NOT EXISTS 'ai_processing' AFTER 'draft';
ALTER TYPE public.favor_status ADD VALUE IF NOT EXISTS 'ready_for_review' AFTER 'ai_processing';
ALTER TYPE public.favor_status ADD VALUE IF NOT EXISTS 'ready_to_publish' AFTER 'ready_for_review';
ALTER TYPE public.favor_status ADD VALUE IF NOT EXISTS 'offer_received' AFTER 'receiving_offers';