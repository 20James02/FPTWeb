# Luồng link voucher → popup → form

User brief: redirect tới trang chỉ định, popup chúc mừng/thông tin voucher, Sử dụng ngay mở form; bước nối liền và thu hút khách, giữ cấu hình Admin. Root cause salethang10: voucher draft, link active, target / valid, date valid. Không tự công bố/bypass MFA.

Bounded design: route known active link valid public target even if campaign not live; unavailable popup offers general consultation, no draft benefit exposed or attached. Live uses signed voucher cookie and public benefit DTO; acquisition marker pf_offer in URL is intent only, must match actual context. No force/repeated modal trap, dismissal and Escape work; reminder reopens; form receipt clears reminder. All published benefit data escaped, no costs/raw PII exposed. Preview doesn't activate; no extra analytics without existing consent.

Form diagnostic before: necessity28/30,value-effort12/20,clarity14/20,recovery12/15,trust8/10,mobile4/5=78/100 (design review, not measured conversion). Page readiness: clarity16/25,focus15/20,message match7/15,trust10/15,friction8/15,objections6/10=62/100. Main friction: link can show JSON404 for draft; valid link has no directed popup/form transition. Goal is improve this specific path, no promised lift.

1. RED backend tests live marker/cookie/public benefits, inactive/unknown invalid targets and draft fallback no benefit cookie + form doesn't apply unpublished code. Add JS acquisition state/focus/reopen/preview/source match tests.
2. CLI forward migration private voucher_landing dispatch fallback, service-only functions; safe public_view DTO and redirect. No edits to applied migrations.
3. New native dialog + accessible CSS + script, existing voucher SDK change notification, form summary/event. Admin links readiness warning. Keep same form/submit/retry/consent and CRM association.
4. GREEN integration/contract/browser actual live→popup→form→receipt→CRM voucher/source. Mobile320/390/768/1440, reducedmotion/escape/focus/nooverflow, unavailable and preview paths.
5. Independent review (executing-plans final reviewer), verify lint/type/contracts/voucher regressions, forward DB apply/check, deployment candidate/live smoke, docs.

Ruling: User's specific build request authorizes bounded implementation, no reauthorization gate; no artifact approval inferred. Financial campaign publication remains existing Admin/MFA action. Preserve current work/QA, do not reset/git push.
