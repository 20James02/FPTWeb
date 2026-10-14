BEGIN;
CREATE TABLE private.marketing_links(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL CHECK(kind IN ('content','voucher')),
 slug text NOT NULL CHECK(slug ~ '^[a-z0-9-]{3,50}$'), payload jsonb NOT NULL,
 version int NOT NULL DEFAULT 1, created_by uuid, creator_name text NOT NULL DEFAULT 'Không xác định',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 tracked_from timestamptz NOT NULL DEFAULT now(), UNIQUE(kind,slug)
);
CREATE TABLE private.marketing_link_revisions(
 link_id uuid NOT NULL REFERENCES private.marketing_links(id), version int NOT NULL,
 payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(link_id,version)
);
CREATE TABLE private.link_daily(
 link_id uuid NOT NULL REFERENCES private.marketing_links(id), day date NOT NULL, source_version int NOT NULL DEFAULT 1,
 raw_clicks bigint NOT NULL DEFAULT 0, bot_clicks bigint NOT NULL DEFAULT 0,
 measured_visits bigint NOT NULL DEFAULT 0, timed_visits bigint NOT NULL DEFAULT 0, engaged_ms bigint NOT NULL DEFAULT 0,
 forms bigint NOT NULL DEFAULT 0, closed bigint NOT NULL DEFAULT 0, installed bigint NOT NULL DEFAULT 0,
 invalid bigint NOT NULL DEFAULT 0, erased bigint NOT NULL DEFAULT 0,
 measured_forms bigint NOT NULL DEFAULT 0, measured_closed bigint NOT NULL DEFAULT 0,
 PRIMARY KEY(link_id,day,source_version), FOREIGN KEY(link_id,source_version) REFERENCES private.marketing_link_revisions(link_id,version), CHECK(least(raw_clicks,bot_clicks,measured_visits,timed_visits,engaged_ms,forms,closed,installed,invalid,erased,measured_forms,measured_closed)>=0)
);
CREATE TABLE private.link_visits(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), link_id uuid NOT NULL REFERENCES private.marketing_links(id),
 session_id uuid NOT NULL REFERENCES private.sessions(id) ON DELETE CASCADE,
 source_version int NOT NULL, cohort_day date NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 checkpoint_at timestamptz NOT NULL DEFAULT clock_timestamp(), last_seen timestamptz NOT NULL DEFAULT clock_timestamp(),
 total_ms bigint NOT NULL DEFAULT 0, has_timing bool NOT NULL DEFAULT false, converted bool NOT NULL DEFAULT false, closed bool NOT NULL DEFAULT false, erased_converted bool NOT NULL DEFAULT false, erased_closed bool NOT NULL DEFAULT false
);
CREATE TABLE private.link_visit_pages(
 visit_id uuid NOT NULL REFERENCES private.link_visits(id) ON DELETE CASCADE, page_id uuid NOT NULL,
 sequence int NOT NULL, total_ms bigint NOT NULL, PRIMARY KEY(visit_id,page_id)
);
CREATE TABLE private.link_results(
 lead_id uuid PRIMARY KEY REFERENCES private.leads(id) ON DELETE CASCADE,
 link_id uuid NOT NULL REFERENCES private.marketing_links(id), source_version int NOT NULL,
 source_snapshot jsonb NOT NULL, acquired_day date NOT NULL,
 visit_id uuid REFERENCES private.link_visits(id) ON DELETE SET NULL,
 submitted_at timestamptz NOT NULL, closed bool NOT NULL DEFAULT false, installed bool NOT NULL DEFAULT false,
 invalid bool NOT NULL DEFAULT false, first_closed_at timestamptz, closed_at timestamptz, closer_id uuid
);
CREATE INDEX marketing_links_created ON private.marketing_links(created_at DESC,id);
CREATE INDEX marketing_links_creator ON private.marketing_links(created_by,created_at DESC);
CREATE INDEX link_daily_day ON private.link_daily(day,link_id);
CREATE INDEX link_visits_source ON private.link_visits(link_id,cohort_day);
CREATE INDEX link_visits_session ON private.link_visits(session_id);
CREATE INDEX link_visits_retention ON private.link_visits(last_seen);
CREATE INDEX link_results_cohort ON private.link_results(link_id,acquired_day);
CREATE INDEX link_results_visit ON private.link_results(visit_id);
CREATE INDEX link_results_closer ON private.link_results(closer_id) WHERE closer_id IS NOT NULL;
ALTER TABLE private.marketing_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.marketing_link_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.link_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.link_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.link_visit_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.link_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.marketing_links,private.marketing_link_revisions,private.link_daily,private.link_visits,private.link_visit_pages,private.link_results FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON private.marketing_links,private.marketing_link_revisions,private.link_daily,private.link_visits,private.link_visit_pages,private.link_results TO service_role;

CREATE FUNCTION private.link_revision() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 INSERT INTO private.marketing_link_revisions(link_id,version,payload) VALUES(NEW.id,NEW.version,NEW.payload) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER link_revision AFTER INSERT OR UPDATE ON private.marketing_links FOR EACH ROW EXECUTE FUNCTION private.link_revision();

CREATE FUNCTION private.link_sync_voucher() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE who uuid:=nullif(current_setting('pagefpt.link_actor',true),'')::uuid; display text; data jsonb;
BEGIN
 SELECT max(nullif(display_name,'')) INTO display FROM private.memberships WHERE user_id=who;
 data:=jsonb_build_object('title','Voucher /s/'||NEW.slug,'slug',NEW.slug,'target',NEW.target,'platform',NEW.channel,
 'utm_medium','referral','utm_campaign','','utm_content',NEW.slug,'content_note','','active',NEW.active);
 INSERT INTO private.marketing_links(kind,slug,payload,created_by,creator_name,created_at)
 VALUES('voucher',NEW.slug,data,who,coalesce(display,'Tài khoản '||substr(who::text,1,8),'Không xác định'),NEW.created_at)
 ON CONFLICT(kind,slug) DO UPDATE SET payload=private.marketing_links.payload||jsonb_build_object('target',NEW.target,'active',NEW.active,'platform',NEW.channel),version=private.marketing_links.version+1,updated_at=now();
 RETURN NEW;
END $$;
CREATE TRIGGER link_sync_voucher AFTER INSERT OR UPDATE ON private.voucher_links FOR EACH ROW EXECUTE FUNCTION private.link_sync_voucher();
INSERT INTO private.marketing_links(kind,slug,payload,created_by,creator_name,created_at)
 SELECT 'voucher',v.slug,jsonb_build_object('title','Voucher /s/'||v.slug,'slug',v.slug,'target',v.target,'platform',v.channel,
 'utm_medium','referral','utm_campaign','','utm_content',v.slug,'content_note','','active',v.active),a.actor_id,
 coalesce((SELECT max(nullif(display_name,'')) FROM private.memberships WHERE user_id=a.actor_id),'Không xác định'),v.created_at
 FROM private.voucher_links v LEFT JOIN LATERAL(SELECT actor_id FROM private.audit WHERE action='voucher.link_saved' AND payload->>'slug'=v.slug AND created_at=v.created_at ORDER BY id LIMIT 1) a ON true;

CREATE FUNCTION private.link_target_available(target text) RETURNS bool LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT private.voucher_target_available(target) OR target IN ('/san-pham/internet-gia-dinh','/san-pham/internet-doanh-nghiep','/san-pham/fpt-play','/san-pham/combo-fpt-play','/san-pham/camera-fpt');
$$;
CREATE FUNCTION private.link_click(lid uuid,bot bool,ver int) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 INSERT INTO private.link_daily(link_id,day,source_version,raw_clicks,bot_clicks) VALUES(lid,(clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,ver,1,bot::int)
 ON CONFLICT(link_id,day,source_version) DO UPDATE SET raw_clicks=private.link_daily.raw_clicks+1,bot_clicks=private.link_daily.bot_clicks+excluded.bot_clicks;
END $$;

CREATE FUNCTION private.link_result_sync() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r private.link_results; m private.marketing_links; revision jsonb; src jsonb; who uuid; vid uuid;
 isclosed bool; isinstalled bool; isinvalid bool; changed int; v private.link_visits; hasform bool; hasclosed bool;
BEGIN
 who:=nullif(current_setting('pagefpt.link_actor',true),'')::uuid;
 IF TG_OP='DELETE' THEN
  SELECT * INTO r FROM private.link_results WHERE lead_id=OLD.id;
  IF r.lead_id IS NOT NULL THEN
   -- Anonymous outcomes remain frozen after erasure, even if this consented
   -- journey was resumed in a different session and still has other leads.
   IF r.visit_id IS NOT NULL THEN UPDATE private.link_visits SET erased_converted=true,erased_closed=erased_closed OR r.closed WHERE id=r.visit_id; END IF;
   UPDATE private.link_daily SET erased=erased+1 WHERE link_id=r.link_id AND day=r.acquired_day AND source_version=r.source_version;
  END IF;
  RETURN OLD;
 END IF;
 isclosed:=NEW.status IN ('closed','installed'); isinstalled:=NEW.status='installed'; isinvalid:=NEW.status IN ('invalid','duplicate');
 IF TG_OP='INSERT' THEN
  src:=NEW.payload->'link_attribution';
  IF src->>'link_id' IS NOT NULL THEN
   SELECT * INTO m FROM private.marketing_links WHERE id=(src->>'link_id')::uuid;
   SELECT payload INTO revision FROM private.marketing_link_revisions WHERE link_id=m.id AND version=(src->>'version')::int;
   IF m.id IS NULL OR revision IS NULL THEN RETURN NEW; END IF;
  ELSE
   SELECT * INTO m FROM private.marketing_links WHERE kind='voucher' AND slug=NEW.payload->'voucher_request'->>'link_slug';
   IF m.id IS NULL THEN RETURN NEW; END IF;
   src:=jsonb_build_object('version',m.version,'acquired_at',NEW.created_at); revision:=m.payload;
  END IF;
  IF src->>'visit_id' IS NOT NULL AND EXISTS(SELECT 1 FROM private.sessions WHERE id=nullif(NEW.payload->>'session_id','')::uuid AND analytics) THEN
   SELECT id INTO vid FROM private.link_visits WHERE id=(src->>'visit_id')::uuid AND link_id=m.id AND source_version=(src->>'version')::int AND last_seen>clock_timestamp()-interval '30 minutes';
  END IF;
  -- Lock visit before result/day: heartbeat and revocation use the same order.
  IF vid IS NOT NULL THEN SELECT * INTO v FROM private.link_visits WHERE id=vid FOR UPDATE; IF v.id IS NULL THEN vid:=NULL; END IF; END IF;
  INSERT INTO private.link_results(lead_id,link_id,source_version,source_snapshot,acquired_day,visit_id,submitted_at,closed,installed,invalid,first_closed_at,closed_at,closer_id)
  VALUES(NEW.id,m.id,(src->>'version')::int,revision,((src->>'acquired_at')::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,vid,NEW.created_at,isclosed,isinstalled,isinvalid,CASE WHEN isclosed THEN now() END,CASE WHEN isclosed THEN now() END,CASE WHEN isclosed THEN who END) RETURNING * INTO r;
  INSERT INTO private.link_daily(link_id,day,source_version,forms,closed,installed,invalid) VALUES(r.link_id,r.acquired_day,r.source_version,1,isclosed::int,isinstalled::int,isinvalid::int)
  ON CONFLICT(link_id,day,source_version) DO UPDATE SET forms=private.link_daily.forms+1,closed=private.link_daily.closed+excluded.closed,installed=private.link_daily.installed+excluded.installed,invalid=private.link_daily.invalid+excluded.invalid;
 ELSE
  SELECT * INTO r FROM private.link_results WHERE lead_id=NEW.id;
  IF r.visit_id IS NOT NULL THEN SELECT * INTO v FROM private.link_visits WHERE id=r.visit_id FOR UPDATE; END IF;
  SELECT * INTO r FROM private.link_results WHERE lead_id=NEW.id FOR UPDATE;
  IF r.lead_id IS NULL THEN RETURN NEW; END IF;
  UPDATE private.link_daily SET closed=closed+isclosed::int-r.closed::int,installed=installed+isinstalled::int-r.installed::int,invalid=invalid+isinvalid::int-r.invalid::int WHERE link_id=r.link_id AND day=r.acquired_day AND source_version=r.source_version;
  UPDATE private.link_results SET closed=isclosed,installed=isinstalled,invalid=isinvalid,
   first_closed_at=CASE WHEN isclosed THEN coalesce(first_closed_at,clock_timestamp()) ELSE first_closed_at END,
   closed_at=CASE WHEN isclosed AND NOT r.closed THEN clock_timestamp() ELSE closed_at END,
   closer_id=CASE WHEN isclosed AND NOT r.closed THEN who ELSE closer_id END WHERE lead_id=NEW.id RETURNING * INTO r;
 END IF;
 IF r.visit_id IS NOT NULL THEN
  SELECT * INTO v FROM private.link_visits WHERE id=r.visit_id FOR UPDATE;
  IF v.id IS NOT NULL THEN
   SELECT count(*)>0,bool_or(closed) INTO hasform,hasclosed FROM private.link_results WHERE visit_id=v.id;
   hasform:=hasform OR v.erased_converted; hasclosed:=coalesce(hasclosed,false) OR v.erased_closed;
   UPDATE private.link_daily SET measured_forms=measured_forms+hasform::int-v.converted::int,measured_closed=measured_closed+hasclosed::int-v.closed::int WHERE link_id=v.link_id AND day=v.cohort_day AND source_version=v.source_version;
   UPDATE private.link_visits SET converted=hasform,closed=hasclosed WHERE id=v.id;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER link_result_insert AFTER INSERT ON private.leads FOR EACH ROW EXECUTE FUNCTION private.link_result_sync();
CREATE TRIGGER link_result_update AFTER UPDATE OF status ON private.leads FOR EACH ROW EXECUTE FUNCTION private.link_result_sync();
CREATE TRIGGER link_result_erasure BEFORE DELETE ON private.leads FOR EACH ROW EXECUTE FUNCTION private.link_result_sync();
-- Existing voucher requests are recoverable; historic clicks and time are not.
INSERT INTO private.link_results(lead_id,link_id,source_version,source_snapshot,acquired_day,submitted_at,closed,installed,invalid)
 SELECT l.id,m.id,m.version,m.payload,(l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,l.created_at,l.status IN ('closed','installed'),l.status='installed',l.status IN ('invalid','duplicate')
 FROM private.leads l JOIN private.marketing_links m ON m.kind='voucher' AND m.slug=l.payload->'voucher_request'->>'link_slug';
INSERT INTO private.link_daily(link_id,day,source_version,forms,closed,installed,invalid)
 SELECT link_id,acquired_day,source_version,count(*),count(*) FILTER(WHERE closed),count(*) FILTER(WHERE installed),count(*) FILTER(WHERE invalid) FROM private.link_results GROUP BY link_id,acquired_day,source_version;

CREATE FUNCTION private.link_wilson_rank(n bigint,successes bigint,forms bigint) RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN n>=30 AND successes>=0 AND successes<=forms AND forms<=n THEN
 round((greatest(0,(successes::double precision/n+3.841458820694124/(2*n)-1.959963984540054*sqrt(successes::double precision/n*(1-successes::double precision/n)/n+3.841458820694124/(4*n::double precision*n)))/(1+3.841458820694124/n))*100)::numeric,2) END;
$$;
CREATE FUNCTION private.link_report(c jsonb) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 WITH selected AS (
 SELECT m.* FROM private.marketing_links m WHERE
 (nullif(c->>'platform','') IS NULL OR m.payload->>'platform'=c->>'platform' OR EXISTS(SELECT 1 FROM private.link_daily dd JOIN private.marketing_link_revisions rr ON rr.link_id=dd.link_id AND rr.version=dd.source_version WHERE dd.link_id=m.id AND rr.payload->>'platform'=c->>'platform' AND dd.day BETWEEN (c->>'start')::date AND (c->>'end')::date)) AND
 (c->>'creator' IS NULL OR m.created_by=(c->>'creator')::uuid) AND
 (nullif(c->>'kind','') IS NULL OR m.kind=c->>'kind') AND
 (c->>'link_id' IS NULL OR m.id=(c->>'link_id')::uuid) AND
 (nullif(c->>'q','') IS NULL OR strpos(lower(concat_ws(' ',m.slug,m.payload->>'title',m.payload->>'content_note')),lower(c->>'q'))>0)
 ), base_metrics AS (
 SELECT m.*,coalesce(array_agg(DISTINCT rr.payload->>'platform') FILTER(WHERE rr.payload->>'platform' IS NOT NULL),'{}') AS measured_platforms,coalesce(sum(d.raw_clicks),0)::bigint AS raw_clicks,coalesce(sum(d.bot_clicks),0)::bigint AS bot_clicks,
 coalesce(sum(d.raw_clicks-d.bot_clicks),0)::bigint AS clicks,coalesce(sum(d.forms),0)::bigint AS forms,
 coalesce(sum(d.closed),0)::bigint AS closed,coalesce(sum(d.installed),0)::bigint AS installed,
 coalesce(sum(d.invalid),0)::bigint AS invalid,coalesce(sum(d.erased),0)::bigint AS erased,
 coalesce(sum(d.measured_visits),0)::bigint AS measured_visits,
 coalesce(sum(d.timed_visits),0)::bigint AS timed_visits,
 CASE WHEN sum(d.timed_visits)>0 THEN round(sum(d.engaged_ms)::numeric/sum(d.timed_visits))::bigint END AS average_engagement_ms,
 coalesce(sum(d.measured_visits) FILTER(WHERE d.day<=(current_timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')::date-7),0)::bigint AS mature_visits,
 coalesce(sum(d.measured_forms) FILTER(WHERE d.day<=(current_timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')::date-7),0)::bigint AS mature_forms,
 coalesce(sum(d.measured_closed) FILTER(WHERE d.day<=(current_timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')::date-7),0)::bigint AS mature_closed
 FROM selected m LEFT JOIN private.link_daily d ON d.link_id=m.id AND d.day BETWEEN (c->>'start')::date AND (c->>'end')::date AND (nullif(c->>'platform','') IS NULL OR EXISTS(SELECT 1 FROM private.marketing_link_revisions rv WHERE rv.link_id=d.link_id AND rv.version=d.source_version AND rv.payload->>'platform'=c->>'platform')) LEFT JOIN private.marketing_link_revisions rr ON rr.link_id=d.link_id AND rr.version=d.source_version GROUP BY m.id,m.kind,m.slug,m.payload,m.version,m.created_by,m.creator_name,m.created_at,m.updated_at,m.tracked_from
 ), metrics AS (SELECT b.*,lower(payload->>'title') AS title,lower(payload->>'platform') AS platform,CASE WHEN forms>0 THEN closed::numeric/forms END AS closed_rate,private.link_wilson_rank(mature_visits,mature_closed,mature_forms) AS ranking_score FROM base_metrics b), ordered AS (
 SELECT * FROM metrics ORDER BY
 CASE WHEN c->>'order'='title' AND c->>'direction'='asc' THEN title END ASC NULLS LAST,
 CASE WHEN c->>'order'='title' AND c->>'direction'<>'asc' THEN title END DESC NULLS LAST,
 CASE WHEN c->>'order'='platform' AND c->>'direction'='asc' THEN platform END ASC NULLS LAST,
 CASE WHEN c->>'order'='platform' AND c->>'direction'<>'asc' THEN platform END DESC NULLS LAST,
 CASE WHEN c->>'order'='creator_name' AND c->>'direction'='asc' THEN creator_name END ASC NULLS LAST,
 CASE WHEN c->>'order'='creator_name' AND c->>'direction'<>'asc' THEN creator_name END DESC NULLS LAST,
 CASE WHEN c->>'order'='closed_rate' AND c->>'direction'='asc' THEN closed_rate END ASC NULLS LAST,
 CASE WHEN c->>'order'='closed_rate' AND c->>'direction'<>'asc' THEN closed_rate END DESC NULLS LAST,
 CASE WHEN c->>'order'='ranking_score' AND c->>'direction'='asc' THEN ranking_score END ASC NULLS LAST,
 CASE WHEN c->>'order'='ranking_score' AND c->>'direction'<>'asc' THEN ranking_score END DESC NULLS LAST,
 CASE WHEN c->>'order'='clicks' AND c->>'direction'='asc' THEN clicks END ASC,
 CASE WHEN c->>'order'='clicks' AND c->>'direction'<>'asc' THEN clicks END DESC,
 CASE WHEN c->>'order'='forms' AND c->>'direction'='asc' THEN forms END ASC,
 CASE WHEN c->>'order'='forms' AND c->>'direction'<>'asc' THEN forms END DESC,
 CASE WHEN c->>'order'='closed' AND c->>'direction'='asc' THEN closed END ASC,
 CASE WHEN c->>'order'='closed' AND c->>'direction'<>'asc' THEN closed END DESC,
 CASE WHEN c->>'order'='installed' AND c->>'direction'='asc' THEN installed END ASC,
 CASE WHEN c->>'order'='installed' AND c->>'direction'<>'asc' THEN installed END DESC,
 CASE WHEN c->>'order'='average_engagement_ms' AND c->>'direction'='asc' THEN average_engagement_ms END ASC NULLS LAST,
 CASE WHEN c->>'order'='average_engagement_ms' AND c->>'direction'<>'asc' THEN average_engagement_ms END DESC NULLS LAST,
 CASE WHEN c->>'order'='created_at' AND c->>'direction'='asc' THEN created_at END ASC,
 CASE WHEN c->>'order'='created_at' AND c->>'direction'<>'asc' THEN created_at END DESC,id
 LIMIT coalesce((c->>'limit')::int,25) OFFSET coalesce((c->>'offset')::int,0)
 )
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(o)) FROM ordered o),'[]'),
 'total_count',(SELECT count(*) FROM selected),'start',c->>'start','end',c->>'end','timezone','Asia/Ho_Chi_Minh',
 'totals',jsonb_build_object('clicks',(SELECT coalesce(sum(clicks),0) FROM metrics),'raw_clicks',(SELECT coalesce(sum(raw_clicks),0) FROM metrics),'bot_clicks',(SELECT coalesce(sum(bot_clicks),0) FROM metrics),'forms',(SELECT coalesce(sum(forms),0) FROM metrics),'closed',(SELECT coalesce(sum(closed),0) FROM metrics),'installed',(SELECT coalesce(sum(installed),0) FROM metrics),'measured_visits',(SELECT coalesce(sum(measured_visits),0) FROM metrics)),
 'daily',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.day) FROM(SELECT d.day,sum(d.raw_clicks-d.bot_clicks) AS clicks,sum(d.forms) AS forms,sum(d.closed) AS closed,sum(d.installed) AS installed FROM private.link_daily d JOIN selected m ON m.id=d.link_id WHERE d.day BETWEEN (c->>'start')::date AND (c->>'end')::date AND (nullif(c->>'platform','') IS NULL OR EXISTS(SELECT 1 FROM private.marketing_link_revisions rv WHERE rv.link_id=d.link_id AND rv.version=d.source_version AND rv.payload->>'platform'=c->>'platform')) GROUP BY d.day) a),'[]'),
 'closers',coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM(SELECT r.closer_id,coalesce(max(nullif(mm.display_name,'')),'Tài khoản '||substr(r.closer_id::text,1,8),'Không xác định') AS name,count(DISTINCT r.lead_id) AS closed,round(avg(extract(epoch FROM r.closed_at-r.submitted_at)/3600)::numeric,1) AS average_hours FROM private.link_results r JOIN selected m ON m.id=r.link_id LEFT JOIN private.memberships mm ON mm.user_id=r.closer_id WHERE r.closed AND (nullif(c->>'platform','') IS NULL OR r.source_snapshot->>'platform'=c->>'platform') AND r.acquired_day BETWEEN (c->>'start')::date AND (c->>'end')::date GROUP BY r.closer_id) a),'[]'));
$$;

CREATE FUNCTION private.link_dispatch(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
#variable_conflict use_column
DECLARE op text:=c->>'op'; data jsonb:=c->'payload'; actor uuid:=(c->>'actor')::uuid;
 m private.marketing_links; v private.link_visits; p private.link_visit_pages;
 sid uuid:=(c->>'session_id')::uuid; gate jsonb; who text; previous bigint; delta bigint; elapsed bigint; day date;
BEGIN
 IF op IN ('link_context','link_resolve') THEN
  SELECT * INTO m FROM private.marketing_links WHERE kind=coalesce(c->>'kind','content') AND slug=c->>'slug' FOR SHARE;
  IF m.id IS NULL THEN IF op='link_context' THEN RETURN '{}'; END IF; RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  IF op='link_resolve' THEN
   IF NOT (m.payload->>'active')::bool OR NOT private.link_target_available(m.payload->>'target') THEN RETURN jsonb_build_object('error','LINK_UNAVAILABLE','status',404); END IF;
   IF coalesce((c->>'count_click')::bool,false) THEN PERFORM private.link_click(m.id,coalesce((c->>'bot')::bool,false),m.version); END IF;
  END IF;
  RETURN to_jsonb(m)-'created_by'-'creator_name';
 END IF;
 IF op='link_revoke' THEN DELETE FROM private.link_visits WHERE id=(c->>'id')::uuid; RETURN '{"revoked":true}'; END IF;
 IF op IN ('link_visit','link_engagement') THEN
  PERFORM 1 FROM private.sessions WHERE id=sid AND analytics FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','ANALYTICS_CONSENT_REQUIRED','status',403); END IF;
  gate:=private.consume_bucket(jsonb_build_object('key','link-'||CASE WHEN op='link_visit' THEN 'visit:'||sid::text ELSE 'engagement:'||(c->>'id') END,'capacity',CASE WHEN op='link_visit' THEN 12 ELSE 24 END,'rate',CASE WHEN op='link_visit' THEN 0.1 ELSE 0.5 END));
  IF NOT (gate->>'allowed')::bool THEN RETURN jsonb_build_object('error','RATE_LIMITED','status',429,'retry_after',gate->'retry_after'); END IF;
  IF op='link_visit' THEN
   SELECT * INTO m FROM private.marketing_links WHERE id=(data->>'link_id')::uuid;
   IF m.id IS NULL OR NOT EXISTS(SELECT 1 FROM private.marketing_link_revisions WHERE link_id=m.id AND version=(data->>'version')::int) THEN RETURN jsonb_build_object('error','INVALID_LINK_SOURCE','status',422); END IF;
   SELECT * INTO v FROM private.link_visits WHERE link_id=m.id AND source_version=(data->>'version')::int AND last_seen>clock_timestamp()-interval '30 minutes' AND (id=(c->>'id')::uuid OR session_id=sid) ORDER BY last_seen DESC LIMIT 1 FOR UPDATE;
   IF v.id IS NOT NULL THEN UPDATE private.link_visits SET session_id=sid,last_seen=clock_timestamp() WHERE id=v.id; RETURN jsonb_build_object('id',v.id,'replayed',true); END IF;
   day:=(clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
   INSERT INTO private.link_visits(link_id,session_id,source_version,cohort_day) VALUES(m.id,sid,(data->>'version')::int,day) RETURNING * INTO v;
   INSERT INTO private.link_daily(link_id,day,source_version,measured_visits) VALUES(m.id,day,(data->>'version')::int,1) ON CONFLICT(link_id,day,source_version) DO UPDATE SET measured_visits=private.link_daily.measured_visits+1;
   RETURN jsonb_build_object('id',v.id,'replayed',false);
  END IF;
  SELECT * INTO v FROM private.link_visits WHERE id=(c->>'id')::uuid FOR UPDATE;
  IF v.id IS NULL OR v.last_seen<clock_timestamp()-interval '30 minutes' THEN RETURN jsonb_build_object('error','VISIT_EXPIRED','status',410); END IF;
  SELECT * INTO p FROM private.link_visit_pages WHERE visit_id=v.id AND page_id=(data->>'page_id')::uuid;
  IF p.sequence IS NOT NULL AND (data->>'sequence')::int<=p.sequence THEN RETURN jsonb_build_object('accepted_ms',0,'replayed',true); END IF;
  IF p.sequence IS NULL AND (SELECT count(*) FROM private.link_visit_pages WHERE visit_id=v.id)>=128 THEN RETURN jsonb_build_object('error','VISIT_PAGE_LIMIT','status',429); END IF;
  previous:=coalesce(p.total_ms,0);
  elapsed:=greatest(0,floor(extract(epoch FROM clock_timestamp()-v.checkpoint_at)*1000))::bigint;
  delta:=least(15000,elapsed,greatest(0,(data->>'total_ms')::bigint-previous));
  INSERT INTO private.link_visit_pages(visit_id,page_id,sequence,total_ms) VALUES(v.id,(data->>'page_id')::uuid,(data->>'sequence')::int,greatest(previous,(data->>'total_ms')::bigint))
  ON CONFLICT(visit_id,page_id) DO UPDATE SET sequence=excluded.sequence,total_ms=excluded.total_ms;
  UPDATE private.link_visits SET total_ms=total_ms+delta,has_timing=true,checkpoint_at=clock_timestamp(),last_seen=clock_timestamp() WHERE id=v.id;
  UPDATE private.link_daily SET engaged_ms=engaged_ms+delta,timed_visits=timed_visits+CASE WHEN v.has_timing THEN 0 ELSE 1 END WHERE link_id=v.link_id AND day=v.cohort_day AND source_version=v.source_version;
  RETURN jsonb_build_object('accepted_ms',delta,'replayed',false);
 END IF;
 IF NOT private.permitted(actor,'marketing.write','00000000-0000-0000-0000-000000000000') THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
 IF op='link_report' THEN RETURN private.link_report(c); END IF;
 IF op='link_list' THEN RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM(SELECT * FROM private.marketing_links ORDER BY created_at DESC,id LIMIT 1000) a),'[]')); END IF;
 IF op='link_options' THEN RETURN jsonb_build_object('creators',coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM(SELECT DISTINCT created_by AS id,creator_name AS name FROM private.marketing_links WHERE created_by IS NOT NULL) a),'[]'),'targets',coalesce((SELECT jsonb_agg(jsonb_build_object('target','/'||(published_payload->>'slug'),'title',published_payload->>'title')) FROM private.resources WHERE kind='page' AND status='published'),'[]')); END IF;
 IF op IN ('link_save','link_toggle') THEN
  IF op='link_save' AND c->>'id' IS NULL AND data->>'platform' NOT IN ('google','meta','facebook','instagram','tiktok','zalo','youtube','seo','referral','email','other') THEN RETURN jsonb_build_object('error','INVALID_PLATFORM','status',422); END IF;
  IF c->>'id' IS NULL THEN
   IF NOT private.link_target_available(data->>'target') THEN RETURN jsonb_build_object('error','INVALID_LINK_TARGET','status',422); END IF;
   SELECT max(nullif(display_name,'')) INTO who FROM private.memberships WHERE user_id=actor;
   INSERT INTO private.marketing_links(kind,slug,payload,created_by,creator_name) VALUES('content',data->>'slug',data,actor,coalesce(who,'Tài khoản '||substr(actor::text,1,8))) ON CONFLICT(kind,slug) DO NOTHING RETURNING * INTO m;
   IF m.id IS NULL THEN RETURN jsonb_build_object('error','LINK_SLUG_EXISTS','status',409); END IF;
  ELSE
   -- Voucher editing already locks voucher_links before its registry-sync trigger.
   -- Match that order even for metadata-only writes to avoid cross-editor deadlocks.
   PERFORM 1 FROM private.voucher_links vl JOIN private.marketing_links ml ON ml.kind='voucher' AND ml.slug=vl.slug WHERE ml.id=(c->>'id')::uuid FOR UPDATE OF vl;
   SELECT * INTO m FROM private.marketing_links WHERE id=(c->>'id')::uuid FOR UPDATE;
   IF m.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
   IF m.version<>(c->>'expected_version')::int THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
   IF op='link_toggle' THEN data:=m.payload||jsonb_build_object('active',(c->>'active')::bool); END IF;
   IF data->>'slug'<>m.slug THEN RETURN jsonb_build_object('error','LINK_SLUG_IMMUTABLE','status',422); END IF;
   IF m.kind='voucher' THEN
    IF data->>'target'<>m.payload->>'target' OR data->>'platform'<>m.payload->>'platform' THEN RETURN jsonb_build_object('error','EDIT_VOUCHER_LINK_IN_VOUCHERS','status',422); END IF;
    IF (data->>'active')::bool<>(m.payload->>'active')::bool THEN UPDATE private.voucher_links SET active=(data->>'active')::bool WHERE slug=m.slug; SELECT * INTO m FROM private.marketing_links WHERE id=m.id; END IF;
   ELSE
    IF data->>'platform' NOT IN ('google','meta','facebook','instagram','tiktok','zalo','youtube','seo','referral','email','other') THEN RETURN jsonb_build_object('error','INVALID_PLATFORM','status',422); END IF;
    IF NOT private.link_target_available(data->>'target') THEN RETURN jsonb_build_object('error','INVALID_LINK_TARGET','status',422); END IF;
    IF EXISTS(SELECT 1 FROM private.link_daily WHERE link_id=m.id) AND (data->>'platform'<>m.payload->>'platform' OR data->>'utm_campaign'<>m.payload->>'utm_campaign' OR data->>'utm_content'<>m.payload->>'utm_content' OR data->>'utm_medium'<>m.payload->>'utm_medium') THEN RETURN jsonb_build_object('error','LINK_SOURCE_IMMUTABLE','status',422); END IF;
   END IF;
   UPDATE private.marketing_links SET payload=data,version=version+1,updated_at=now() WHERE id=m.id RETURNING * INTO m;
  END IF;
  INSERT INTO private.audit(actor_id,entity_id,action,payload) VALUES(actor,m.id,'link.saved',jsonb_build_object('kind',m.kind,'version',m.version));
  RETURN to_jsonb(m);
 END IF;
 RETURN jsonb_build_object('error','UNKNOWN_OPERATION','status',400);
END $$;

ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_before_link_performance;
CREATE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE result jsonb; m private.marketing_links; data jsonb:=command->'payload';
BEGIN
 PERFORM set_config('pagefpt.link_actor',coalesce(command->>'actor',''),true);
 IF command->>'op' LIKE 'link_%' THEN RETURN private.link_dispatch(command); END IF;
 result:=api.dispatch_before_link_performance(command);
 IF result ? 'error' THEN RETURN result; END IF;
 IF command->>'op'='voucher_resolve' AND coalesce((command->>'record_click')::bool,false) AND result->'link'->>'slug' IS NOT NULL THEN
  SELECT * INTO m FROM private.marketing_links WHERE kind='voucher' AND slug=result->'link'->>'slug' FOR SHARE;
  IF m.id IS NOT NULL THEN PERFORM private.link_click(m.id,coalesce((command->>'bot')::bool,false),m.version); result:=result||jsonb_build_object('tracking_link_id',m.id,'tracking_link_version',m.version); END IF;
 END IF;
 IF command->>'op'='voucher_link_save' AND data IS NOT NULL THEN
  UPDATE private.marketing_links SET payload=payload||jsonb_build_object('content_note',coalesce(data->>'content_note',''),
   'title',coalesce(nullif(data->>'title',''),payload->>'title')),version=version+1,updated_at=now()
   WHERE kind='voucher' AND slug=result->>'slug';
 END IF;
 IF command->>'op'='consent' AND NOT (command->>'analytics')::bool THEN
  DELETE FROM private.link_visits WHERE session_id=(command->>'id')::uuid;
 END IF;
 IF command->>'op'='schedule_tick' THEN DELETE FROM private.link_visits WHERE id IN (SELECT id FROM private.link_visits WHERE last_seen<clock_timestamp()-interval '30 days' ORDER BY last_seen LIMIT 200); END IF;
 RETURN result;
END $$;
REVOKE EXECUTE ON FUNCTION api.dispatch(jsonb),api.dispatch_before_link_performance(jsonb),private.link_revision(),private.link_sync_voucher(),private.link_target_available(text),private.link_click(uuid,bool,int),private.link_result_sync(),private.link_report(jsonb),private.link_wilson_rank(bigint,bigint,bigint),private.link_dispatch(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.dispatch(jsonb),api.dispatch_before_link_performance(jsonb),private.link_revision(),private.link_sync_voucher(),private.link_target_available(text),private.link_click(uuid,bool,int),private.link_result_sync(),private.link_report(jsonb),private.link_wilson_rank(bigint,bigint,bigint),private.link_dispatch(jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
