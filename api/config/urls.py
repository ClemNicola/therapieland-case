from django.urls import include, path
from django.utils.csp import CSP
from django.views.decorators.csp import csp_override
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerSplitView

from config import views

# Swagger UI is an HTML page loading its assets from the jsDelivr CDN, so it needs a
# looser CSP than the JSON endpoints (still no inline scripts thanks to the "split" view).
SWAGGER_CSP = {
    "default-src": [CSP.NONE],
    "script-src": [CSP.SELF, "https://cdn.jsdelivr.net"],
    "style-src": ["https://cdn.jsdelivr.net", CSP.UNSAFE_INLINE],
    "img-src": [CSP.SELF, "data:", "https://cdn.jsdelivr.net"],
    "connect-src": [CSP.SELF],
    "frame-ancestors": [CSP.NONE],
    "base-uri": [CSP.NONE],
    "form-action": [CSP.NONE],
}

urlpatterns = [
    path("api/health/", views.health, name="health"),
    path("api/auth/", include("accounts.urls")),
    path("api/", include("patients.urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        csp_override(SWAGGER_CSP)(SpectacularSwaggerSplitView.as_view(url_name="schema")),
        name="docs",
    ),
]
