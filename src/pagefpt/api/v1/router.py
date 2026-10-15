from fastapi import APIRouter

from pagefpt.api.v1.resources import router as resource_router
from pagefpt.modules.abuse.challenges import router as challenge_router
from pagefpt.modules.administration.routes import router as administration_router
from pagefpt.modules.care.routes import router as care_router
from pagefpt.modules.catalog.routes import router as catalog_router
from pagefpt.modules.content.display_settings import router as display_router
from pagefpt.modules.content.redirects import router as redirects_router
from pagefpt.modules.content.routes import router as content_router
from pagefpt.modules.content.scheduling import router as scheduling_router
from pagefpt.modules.governance.routes import router as governance_router
from pagefpt.modules.identity.accounts import router as accounts_router
from pagefpt.modules.identity.recovery import router as recovery_router
from pagefpt.modules.identity.routes import router as identity_router
from pagefpt.modules.identity.sessions import router as sessions_router
from pagefpt.modules.integrations.routes import router as integrations_router
from pagefpt.modules.integrations.webhooks import router as webhook_router
from pagefpt.modules.intelligence.routes import public_router as visits_router
from pagefpt.modules.intelligence.routes import router as intelligence_router
from pagefpt.modules.leads.admin import router as crm_router
from pagefpt.modules.leads.appointments import router as appointments_router
from pagefpt.modules.leads.billing import router as billing_router
from pagefpt.modules.leads.profile import router as lead_profile_router
from pagefpt.modules.leads.routes import router as leads_router
from pagefpt.modules.link_analytics.routes import router as link_analytics_router
from pagefpt.modules.marketing.routes import router as marketing_router
from pagefpt.modules.measurement.routes import public_router as measurement_public_router
from pagefpt.modules.measurement.routes import router as measurement_router
from pagefpt.modules.media.routes import router as media_router
from pagefpt.modules.pricing.imports import router as imports_router
from pagefpt.modules.pricing.routes import router as pricing_router
from pagefpt.modules.reporting.routes import router as reporting_router
from pagefpt.modules.vouchers.routes import router as vouchers_router
from pagefpt.modules.workflow.routes import router as jobs_router
from pagefpt.web.cms_pages import router as cms_router

router = APIRouter()
router.include_router(link_analytics_router)
router.include_router(vouchers_router)
router.include_router(identity_router)
router.include_router(accounts_router)
router.include_router(catalog_router)
router.include_router(leads_router)
router.include_router(lead_profile_router)
router.include_router(crm_router)
router.include_router(jobs_router)
router.include_router(marketing_router)
router.include_router(content_router)
router.include_router(care_router)
router.include_router(media_router)
router.include_router(governance_router)
router.include_router(challenge_router)
router.include_router(reporting_router)
router.include_router(imports_router)
router.include_router(scheduling_router)
router.include_router(webhook_router)
router.include_router(resource_router)


router.include_router(sessions_router)
router.include_router(recovery_router)

router.include_router(pricing_router)

router.include_router(appointments_router)
router.include_router(billing_router)

router.include_router(intelligence_router)

router.include_router(redirects_router)

router.include_router(visits_router)

router.include_router(integrations_router)

router.include_router(display_router)

router.include_router(administration_router)


router.include_router(measurement_router)
router.include_router(measurement_public_router)

# CMS slug fallback follows every concrete API route.
router.include_router(cms_router)
