BEGIN;
CREATE TABLE private.measurement_costs(
 connection_id uuid NOT NULL REFERENCES private.measurement_connections(id),day date NOT NULL,campaign_id text NOT NULL,
 adgroup_id text NOT NULL DEFAULT '',ad_id text NOT NULL DEFAULT '',cost_vnd bigint NOT NULL CHECK(cost_vnd>=0),
 clicks bigint,impressions bigint,source text NOT NULL DEFAULT 'manual',version int NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(connection_id,day,campaign_id,adgroup_id,ad_id)
);
CREATE INDEX measurement_costs_day ON private.measurement_costs(day,campaign_id);
CREATE TABLE private.measurement_cost_accounts(environment text NOT NULL,provider text NOT NULL,account_id text NOT NULL,connection_id uuid NOT NULL REFERENCES private.measurement_connections(id),PRIMARY KEY(environment,provider,account_id));
CREATE TABLE private.measurement_cost_imports(digest text PRIMARY KEY,actor_id uuid,created_at timestamptz NOT NULL DEFAULT now(),row_count int NOT NULL);
CREATE FUNCTION private.measurement_reporting(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE op text:=c->>'op';actor uuid:=(c->>'actor')::uuid;conn private.measurement_connections;r jsonb;idx int:=0;version int;versions jsonb:='[]';start_day date:=(c->>'start')::date;end_day date:=(c->>'end')::date;items jsonb;totals jsonb;grain text;existing_grain text;account_key text;owner uuid;
BEGIN
 IF actor IS NULL OR NOT private.permitted(actor,CASE WHEN op LIKE 'measurement_cost_%' THEN 'measurement.configure' ELSE 'measurement.read' END,'00000000-0000-0000-0000-000000000000') THEN RETURN '{"error":"PERMISSION_DENIED","status":403}'; END IF;
 IF op IN ('measurement_cost_preview','measurement_cost_apply') THEN
  SELECT * INTO conn FROM private.measurement_connections WHERE id=(c->>'connection_id')::uuid FOR SHARE;
  IF conn.id IS NULL OR conn.payload->>'provider' NOT IN ('google_ads','meta') THEN RETURN '{"error":"INVALID_COST_CONNECTION","status":422}';END IF;
  IF coalesce(conn.payload->'settings'->>'currency','VND')<>'VND' THEN RETURN '{"error":"CURRENCY_NOT_VND","status":422}';END IF;
  account_key:=CASE WHEN conn.payload->>'provider'='google_ads' THEN conn.payload->'settings'->>'customer_id' ELSE conn.payload->'settings'->>'ad_account_id' END;
  IF coalesce(account_key,'')='' THEN RETURN '{"error":"COST_ACCOUNT_REQUIRED","status":422}';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended((conn.payload->>'environment')||':'||(conn.payload->>'provider')||':'||account_key,2876));
  SELECT connection_id INTO owner FROM private.measurement_cost_accounts WHERE environment=conn.payload->>'environment' AND provider=conn.payload->>'provider' AND account_id=account_key;
  IF owner IS NOT NULL AND owner<>conn.id THEN RETURN '{"error":"COST_ACCOUNT_ALREADY_MAPPED","status":409}';END IF;
  IF op='measurement_cost_apply' THEN
   IF c->>'sync_job_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM private.measurement_sync_jobs sj WHERE sj.id=(c->>'sync_job_id')::uuid AND sj.connection_id=conn.id AND sj.state='running' AND sj.lease_token=(c->>'sync_lease_token')::uuid AND sj.source_identity=private.measurement_source_identity(conn.payload)) THEN RETURN '{"error":"SYNC_SOURCE_CHANGED","status":409}';END IF;
   IF conn.version IS DISTINCT FROM (c->>'connection_version')::int THEN RETURN '{"error":"VERSION_CONFLICT","status":409}';END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended(conn.id::text,2873));
   IF EXISTS(SELECT 1 FROM private.measurement_cost_imports WHERE digest=c->>'digest') THEN RETURN '{"saved":true,"replayed":true}';END IF;
  END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(c->'rows') LOOP
   SELECT m.version INTO version FROM private.measurement_costs m WHERE m.connection_id=conn.id AND m.day=(r->>'day')::date AND m.campaign_id=r->>'campaign_id' AND m.adgroup_id=coalesce(r->>'adgroup_id','') AND m.ad_id=coalesce(r->>'ad_id','');
   versions:=versions||jsonb_build_array(coalesce(version,0));
   IF op='measurement_cost_apply' AND coalesce(version,0)<>(c->'versions'->>idx)::int THEN RETURN '{"error":"VERSION_CONFLICT","status":409}';END IF;
   grain:=CASE WHEN coalesce(r->>'ad_id','')<>'' THEN 'ad' WHEN coalesce(r->>'adgroup_id','')<>'' THEN 'group' ELSE 'campaign' END;
   IF EXISTS(SELECT 1 FROM private.measurement_costs m WHERE m.connection_id=conn.id AND m.day=(r->>'day')::date AND m.campaign_id=r->>'campaign_id' AND (m.source<>coalesce(c->>'source','manual') OR CASE WHEN m.ad_id<>'' THEN 'ad' WHEN m.adgroup_id<>'' THEN 'group' ELSE 'campaign' END<>grain)) THEN RETURN '{"error":"COST_SOURCE_OR_GRAIN_CONFLICT","status":409}';END IF;
   idx:=idx+1;
  END LOOP;
  IF op='measurement_cost_preview' THEN RETURN jsonb_build_object('versions',versions,'connection_version',conn.version);END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(c->'rows') LOOP
   INSERT INTO private.measurement_costs(connection_id,day,campaign_id,adgroup_id,ad_id,cost_vnd,clicks,impressions,source)
   VALUES(conn.id,(r->>'day')::date,r->>'campaign_id',coalesce(r->>'adgroup_id',''),coalesce(r->>'ad_id',''),(r->>'cost_vnd')::bigint,(r->>'clicks')::bigint,(r->>'impressions')::bigint,coalesce(c->>'source','manual'))
   ON CONFLICT(connection_id,day,campaign_id,adgroup_id,ad_id) DO UPDATE SET cost_vnd=excluded.cost_vnd,clicks=excluded.clicks,impressions=excluded.impressions,version=private.measurement_costs.version+1,updated_at=now();
  END LOOP;
  INSERT INTO private.measurement_cost_accounts(environment,provider,account_id,connection_id) VALUES(conn.payload->>'environment',conn.payload->>'provider',account_key,conn.id) ON CONFLICT DO NOTHING;
  INSERT INTO private.measurement_cost_imports(digest,actor_id,row_count) VALUES(c->>'digest',actor,idx);
  INSERT INTO private.audit(actor_id,action,payload) VALUES(actor,op,jsonb_build_object('connection_id',conn.id,'rows',idx));
  RETURN jsonb_build_object('saved',true,'replayed',false,'rows',idx);
 END IF;
 IF op='measurement_report' THEN
  IF start_day IS NULL OR end_day IS NULL OR end_day<start_day OR end_day-start_day>92 THEN RETURN '{"error":"INVALID_REPORT_RANGE","status":422}';END IF;
  WITH lead_data AS (
   SELECT l.id,l.status,l.created_at,l.payload,
    CASE lower(coalesce(nullif(l.payload->'attribution'->'last_touch'->>'platform',''),nullif(l.payload->'attribution'->'last_touch'->>'utm_source',''),'unknown')) WHEN 'facebook' THEN 'meta' WHEN 'instagram' THEN 'meta' WHEN 'fb' THEN 'meta' ELSE lower(coalesce(nullif(l.payload->'attribution'->'last_touch'->>'platform',''),nullif(l.payload->'attribution'->'last_touch'->>'utm_source',''),'unknown')) END platform,
    coalesce(nullif(l.payload->'attribution'->'last_touch'->>'campaign_id',''),nullif(l.payload->'attribution'->'last_touch'->>'utm_campaign',''),'unknown') campaign
   FROM private.leads l WHERE coalesce(l.payload->>'measurement_environment',c->>'environment')=c->>'environment' AND l.created_at>=start_day::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' AND l.created_at<(end_day+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
  ), leads AS (
   SELECT platform,campaign,count(*) forms,count(*) FILTER(WHERE status IN('closed','installed')) closed,count(*) FILTER(WHERE status='installed') installed,
    count(*) FILTER(WHERE status IN('invalid','rejected','duplicate')) invalid,count(*) FILTER(WHERE created_at<=now()-make_interval(days=>least(90,greatest(1,coalesce((c->>'maturity_days')::int,7))))) mature_forms,
    count(*) FILTER(WHERE status IN('closed','installed') AND created_at<=now()-make_interval(days=>least(90,greatest(1,coalesce((c->>'maturity_days')::int,7))))) mature_closed
   FROM lead_data GROUP BY platform,campaign
  ), costs AS (
   SELECT CASE WHEN cn.payload->>'provider'='google_ads' THEN 'google' ELSE 'meta' END platform,m.campaign_id campaign,sum(m.cost_vnd) cost_vnd,sum(m.clicks) ad_clicks,sum(m.impressions) impressions,max(m.updated_at) cost_updated_at
   FROM private.measurement_costs m JOIN private.measurement_connections cn ON cn.id=m.connection_id WHERE cn.payload->>'environment'=c->>'environment' AND m.day BETWEEN start_day AND end_day GROUP BY 1,2
  ), combined AS (
   SELECT coalesce(l.platform,k.platform) platform,coalesce(l.campaign,k.campaign) campaign,coalesce(l.forms,0) forms,coalesce(l.closed,0) closed,coalesce(l.installed,0) installed,coalesce(l.invalid,0) invalid,
    coalesce(l.mature_forms,0) mature_forms,coalesce(l.mature_closed,0) mature_closed,k.cost_vnd,k.ad_clicks,k.impressions,k.cost_updated_at,
    k.cost_vnd::numeric/nullif(l.forms,0) cpl_vnd,k.cost_vnd::numeric/nullif(l.closed,0) cost_per_closed_vnd
   FROM leads l FULL JOIN costs k USING(platform,campaign)
  ) SELECT coalesce(jsonb_agg(to_jsonb(combined) ORDER BY forms DESC,campaign),'[]') INTO items FROM combined;
  SELECT jsonb_build_object('forms',coalesce(sum((v->>'forms')::bigint),0),'closed',coalesce(sum((v->>'closed')::bigint),0),'installed',coalesce(sum((v->>'installed')::bigint),0),'cost_vnd',sum((v->>'cost_vnd')::bigint),'cpl_vnd',sum((v->>'cost_vnd')::numeric)/nullif(sum((v->>'forms')::bigint),0)) INTO totals FROM jsonb_array_elements(items)v;
  RETURN jsonb_build_object('items',items,'totals',totals,'start',start_day,'end',end_day,'timezone','Asia/Ho_Chi_Minh','attribution','latest_eligible_non_direct','basis','lead_acquisition_cohort','revenue_vnd',NULL,
   'deliveries',coalesce((SELECT jsonb_object_agg(state,n) FROM(SELECT state,count(*) n FROM private.measurement_deliveries GROUP BY state)d),'{}'),
   'queue',jsonb_build_object('pending',(SELECT count(*) FROM private.jobs WHERE kind='measurement_conversion' AND state='pending'),'oldest_pending_at',(SELECT min(created_at) FROM private.jobs WHERE kind='measurement_conversion' AND state='pending')),
   'limitations',jsonb_build_array('Chi phí chỉ gồm dữ liệu đã nhập hoặc đồng bộ.','Nguồn URL là dữ liệu khai báo; không chứng minh nhân quả.','Không cộng chuyển đổi Google và Meta để suy ra số khách.'));
 END IF;
 RETURN '{"error":"UNKNOWN_OPERATION","status":400}';
END $$;
CREATE FUNCTION private.measurement_cost_identity_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM private.measurement_cost_accounts WHERE connection_id=OLD.id) AND
 (OLD.payload->>'environment',OLD.payload->>'provider',OLD.payload->'settings'->>'customer_id',OLD.payload->'settings'->>'ad_account_id',OLD.payload->'settings'->>'currency') IS DISTINCT FROM
 (NEW.payload->>'environment',NEW.payload->>'provider',NEW.payload->'settings'->>'customer_id',NEW.payload->'settings'->>'ad_account_id',NEW.payload->'settings'->>'currency') THEN RAISE EXCEPTION 'Cost account identity is immutable' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER measurement_cost_identity BEFORE UPDATE ON private.measurement_connections FOR EACH ROW EXECUTE FUNCTION private.measurement_cost_identity_guard();
REVOKE ALL ON FUNCTION private.measurement_cost_identity_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.measurement_cost_identity_guard() TO service_role;
ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_before_measurement_reporting;
CREATE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF command->>'op' IN ('measurement_cost_preview','measurement_cost_apply','measurement_report') THEN RETURN private.measurement_reporting(command);END IF;
 RETURN api.dispatch_before_measurement_reporting(command);
END $$;
ALTER TABLE private.measurement_cost_accounts ENABLE ROW LEVEL SECURITY;ALTER TABLE private.measurement_costs ENABLE ROW LEVEL SECURITY;ALTER TABLE private.measurement_cost_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.measurement_cost_accounts,private.measurement_costs,private.measurement_cost_imports FROM PUBLIC,anon,authenticated;
GRANT ALL ON private.measurement_cost_accounts,private.measurement_costs,private.measurement_cost_imports TO service_role;
REVOKE ALL ON FUNCTION private.measurement_reporting(jsonb),api.dispatch(jsonb),api.dispatch_before_measurement_reporting(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.measurement_reporting(jsonb),api.dispatch(jsonb),api.dispatch_before_measurement_reporting(jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
